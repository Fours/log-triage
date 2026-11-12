import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { DEFAULT_BUDGET, FATAL_API_ERRORS, triage, type ApiErrorKind, type Effort, type TriageOptions, type TriageResult } from "../agent.js";
import { getPrompt } from "../prompts.js";
import { loadIncident } from "../tools.js";
import { toIncidentView, type Incident, type IncidentView } from "../types.js";
import { BASELINE_MODEL, baselineTriage } from "./baseline.js";
import { renderLeaderboard, renderRunReport, resumeCommand, runPrompt, type LeaderboardEntry, type RunConfig } from "./report.js";
import { scoreIncident, summarize, type IncidentScore, type Summary } from "./score.js";

/**
 * Run a model over the labeled dataset and write a self-contained run
 * directory under <resultsDir>/runs/<runId>/:
 *
 *   config.json          model, effort, budget, dataset version, git commit, status
 *   incidents/<id>.json  the full TriageResult (verdict + trace) and its score
 *   summary.json         aggregate metrics (over finished incidents)
 *   report.md            human-readable report
 *
 * Each incident is written as soon as it finishes, so an interrupted run picks
 * up where it stopped with `resume` (incidents that hit an API error are retried).
 * A run stops early on errors every incident would hit (billing, auth, a bad
 * request, an unknown model), and a run with unfinished incidents is marked
 * incomplete and left off the leaderboard.
 */

export type TriageFn = (view: IncidentView, opts: TriageOptions) => Promise<TriageResult>;

export interface EvalOptions {
  /** Repo root, for git metadata and relative paths in config. */
  root: string;
  /** Holds runs/ and the README.md leaderboard. */
  resultsDir: string;
  datasetDir: string;
  model: string;
  /** Prompt version (src/prompts.ts); defaults like the agent's. Ignored for the baseline. */
  prompt?: string;
  effort: Effort | null;
  baseline?: boolean;
  ids?: string[];
  difficulty?: string;
  limit?: number;
  concurrency: number;
  runId?: string;
  resume?: boolean;
  /** Override the agent (tests). */
  triageFn?: TriageFn;
  log?: (line: string) => void;
}

export interface EvalOutcome {
  runId: string;
  runDir: string;
  complete: boolean;
  /** Incidents without a finished result (never run, or ended in an API error). */
  pending: string[];
  stoppedBy: RunConfig["stoppedBy"];
  summary: Summary;
}

interface IncidentRecord {
  score: IncidentScore;
  result: TriageResult;
}

export function loadDataset(datasetDir: string, filter: Pick<EvalOptions, "ids" | "difficulty" | "limit"> = {}) {
  const manifestPath = resolve(datasetDir, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const files: string[] = manifest
    ? manifest.incidents.map((m: { file: string }) => m.file)
    : readdirSync(datasetDir).filter((f) => f.endsWith(".json"));
  let incidents: Incident[] = files.map((f) => loadIncident(resolve(datasetDir, f)));
  if (filter.ids) {
    const wanted = new Set(filter.ids);
    incidents = incidents.filter((i) => wanted.has(i.id));
  }
  if (filter.difficulty) incidents = incidents.filter((i) => i.label.difficulty === filter.difficulty);
  if (filter.limit) incidents = incidents.slice(0, filter.limit);
  return { incidents, manifest };
}

function gitInfo(root: string): RunConfig["git"] {
  try {
    return {
      commit: execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(),
      dirty: execSync("git status --porcelain", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().length > 0,
    };
  } catch {
    return { commit: "unknown", dirty: false };
  }
}

/** Runs written before `status` existed are complete. */
export const isComplete = (c: RunConfig) => (c.status ?? "complete") === "complete";

export async function runEval(opts: EvalOptions): Promise<EvalOutcome> {
  const log = opts.log ?? console.log;
  const model = opts.baseline ? BASELINE_MODEL : opts.model;
  const effort = opts.baseline ? null : opts.effort;
  const prompt = opts.baseline ? null : getPrompt(opts.prompt).id; // throws on an unknown version
  const datasetDir = relative(opts.root, opts.datasetDir);
  // Runs on anything but the dev set are tagged with the dataset's folder name (e.g. "test").
  const datasetTag = datasetDir === "incidents/generated" ? null : datasetDir.split("/").pop();
  const triageFn: TriageFn = opts.triageFn ?? ((view, o) => triage(view, o));
  const runsDir = resolve(opts.resultsDir, "runs");

  const { incidents, manifest } = loadDataset(opts.datasetDir, opts);
  if (incidents.length === 0) throw new Error("No incidents selected.");

  const today = new Date().toISOString().slice(0, 10);
  const runId = opts.runId ?? [today, model.replace(/[^a-z0-9.-]+/gi, "-"), prompt, effort, datasetTag].filter(Boolean).join("_");
  const runDir = resolve(runsDir, runId);
  const incidentsDir = resolve(runDir, "incidents");
  if (existsSync(runDir) && !opts.resume) {
    throw new Error(`Run ${runId} already exists. Pass --resume to continue it, or --run-id to start a new one.`);
  }
  mkdirSync(incidentsDir, { recursive: true });

  const configPath = resolve(runDir, "config.json");
  const config: RunConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf8"))
    : {
        runId,
        model,
        prompt,
        effort,
        dataset: {
          dir: datasetDir,
          generatorVersion: manifest?.generatorVersion ?? null,
          seed: manifest?.seed ?? null,
          incidents: incidents.length,
        },
        budget: opts.baseline ? null : { ...DEFAULT_BUDGET },
        concurrency: opts.concurrency,
        git: gitInfo(opts.root),
        startedAt: new Date().toISOString(),
        finishedAt: null,
      };
  if (config.model !== model) throw new Error(`Run ${runId} was made with ${config.model}, not ${model}.`);
  if (runPrompt(config) !== prompt) throw new Error(`Run ${runId} was made with prompt ${runPrompt(config)}, not ${prompt}.`);
  if (config.dataset.dir !== datasetDir) throw new Error(`Run ${runId} was made on ${config.dataset.dir}, not ${datasetDir}.`);
  config.status = "incomplete";
  config.finishedAt = null;
  delete config.stoppedBy;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  const recordPath = (id: string) => resolve(incidentsDir, `${id}.json`);
  const readRecord = (id: string): IncidentRecord | null =>
    existsSync(recordPath(id)) ? (JSON.parse(readFileSync(recordPath(id), "utf8")) as IncidentRecord) : null;
  const finished = (id: string) => {
    const rec = readRecord(id);
    return !!rec && rec.result.outcome !== "api_error"; // retry API failures on resume
  };

  const todo = incidents.filter((i) => !finished(i.id));
  log(
    `\n=== Eval ${runId}: ${model}${prompt ? ` · prompt ${prompt}` : ""}${effort ? ` · effort ${effort}` : ""} · ${datasetDir} · ${incidents.length} incidents` +
      `${todo.length < incidents.length ? `, ${incidents.length - todo.length} already done` : ""} · concurrency ${opts.concurrency} ===\n`,
  );

  let stoppedBy: RunConfig["stoppedBy"];
  let count = 0;

  async function runOne(incident: Incident): Promise<void> {
    const view = toIncidentView(incident);
    const result = opts.baseline ? baselineTriage(view) : await triageFn(view, { model, prompt: prompt ?? undefined, effort: effort ?? undefined });
    const score = scoreIncident(incident, result);
    writeFileSync(recordPath(incident.id), JSON.stringify({ score, result } satisfies IncidentRecord, null, 2) + "\n");
    count += 1;

    if (result.outcome === "api_error") {
      log(`[${String(count).padStart(2)}/${todo.length}] ${incident.id} ! API error (${result.apiErrorKind}): ${result.error}`);
      if (result.apiErrorKind && FATAL_API_ERRORS.has(result.apiErrorKind) && !stoppedBy) {
        stoppedBy = { kind: result.apiErrorKind, message: result.error ?? "" };
      }
      return;
    }
    const mark = score.top1 ? "✓" : score.top1Lenient ? "~" : "✗";
    log(
      `[${String(count).padStart(2)}/${todo.length}] ${incident.id} ${mark} ${score.predicted ?? score.outcome}` +
        `${score.confidence !== null ? ` (${score.confidence.toFixed(2)})` : ""} vs ${score.truth}` +
        ` · evidence ${score.evidence.correct}/${score.evidence.cited}` +
        `${score.costUsd !== null ? ` · $${score.costUsd.toFixed(3)}` : ""}` +
        `${opts.baseline ? "" : ` · ${(score.durationMs / 1000).toFixed(0)}s`}`,
    );
  }

  // Workers stop pulling new incidents once a fatal error is seen; in-flight ones finish.
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency, queue.length) }, async () => {
      while (!stoppedBy) {
        const next = queue.shift();
        if (!next) break;
        await runOne(next);
      }
    }),
  );

  // ---- Score and report (over finished incidents) ----
  const pending = incidents.filter((i) => !finished(i.id)).map((i) => i.id);
  const scores = incidents.filter((i) => finished(i.id)).map((i) => readRecord(i.id)!.score);
  const summary = summarize(scores);
  const complete = pending.length === 0;

  config.status = complete ? "complete" : "incomplete";
  config.dataset.incidents = incidents.length;
  if (stoppedBy) config.stoppedBy = stoppedBy;
  config.finishedAt = complete ? new Date().toISOString() : null;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  writeFileSync(resolve(runDir, "summary.json"), JSON.stringify({ ...summary, complete, pending }, null, 2) + "\n");
  writeFileSync(resolve(runDir, "report.md"), renderRunReport(config, summary, scores, pending));
  writeLeaderboard(opts.resultsDir);

  if (stoppedBy) {
    log(`\nStopped early: ${describeFatal(stoppedBy.kind)}\n  ${stoppedBy.message}`);
  }
  if (!complete) {
    log(
      `\nIncomplete: ${pending.length} of ${incidents.length} incidents unfinished. It's left off the leaderboard. ` +
        `Fix the cause, then continue (finished incidents are kept):\n  ${resumeCommand(config)}`,
    );
  } else {
    const s = summary;
    log(
      `\ntop-1 ${(s.overall.top1 * 100).toFixed(0)}% · lenient ${(s.overall.top1Lenient * 100).toFixed(0)}% · top-3 ${(s.overall.top3 * 100).toFixed(0)}%` +
        ` · evidence P ${(s.overall.evidencePrecision * 100).toFixed(0)}% R ${(s.overall.evidenceRecall * 100).toFixed(0)}%` +
        ` · ECE ${s.calibration.ece.toFixed(2)}` +
        `${s.cost.totalUsd !== null ? ` · total $${s.cost.totalUsd.toFixed(2)}` : ""}`,
    );
  }
  log(`Report: ${relative(opts.root, resolve(runDir, "report.md"))}`);

  return { runId, runDir, complete, pending, stoppedBy, summary };
}

function describeFatal(kind: ApiErrorKind | string): string {
  switch (kind) {
    case "billing":
      return "out of API credits (or another billing problem). Add credits in the Claude Console, then resume.";
    case "auth":
      return "the API key was rejected. Check ANTHROPIC_API_KEY, then resume.";
    case "not_found":
      return "the model wasn't found. Check the model id, then resume.";
    case "bad_request":
      return "the API rejected the request itself, so every incident would fail the same way.";
    default:
      return kind;
  }
}

/** Rewrite <resultsDir>/README.md from every complete run on disk. */
export function writeLeaderboard(resultsDir: string): void {
  const runsDir = resolve(resultsDir, "runs");
  const entries: LeaderboardEntry[] = readdirSync(runsDir)
    .filter((d) => existsSync(resolve(runsDir, d, "summary.json")) && existsSync(resolve(runsDir, d, "config.json")))
    .map((d) => ({
      config: JSON.parse(readFileSync(resolve(runsDir, d, "config.json"), "utf8")) as RunConfig,
      summary: JSON.parse(readFileSync(resolve(runsDir, d, "summary.json"), "utf8")) as Summary,
    }))
    .filter((e) => isComplete(e.config));
  writeFileSync(resolve(resultsDir, "README.md"), renderLeaderboard(entries));
}
