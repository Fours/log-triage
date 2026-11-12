import "../src/env.js";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_BUDGET, DEFAULT_EFFORT, DEFAULT_MODEL, triage, type Effort, type TriageResult } from "../src/agent.js";
import { BASELINE_MODEL, baselineTriage } from "../src/eval/baseline.js";
import { renderLeaderboard, renderRunReport, type LeaderboardEntry, type RunConfig } from "../src/eval/report.js";
import { scoreIncident, summarize, type IncidentScore } from "../src/eval/score.js";
import { loadIncident } from "../src/tools.js";
import { toIncidentView, type Incident } from "../src/types.js";

/**
 * Run the agent over the labeled dataset, score every incident, and write a
 * self-contained run directory under results/runs/<runId>/:
 *
 *   config.json          model, effort, budget, dataset version, git commit
 *   incidents/<id>.json  the full TriageResult (verdict + trace) and its score
 *   summary.json         aggregate metrics
 *   report.md            human-readable report
 *
 * Each incident is written as soon as it finishes, so an interrupted run picks
 * up where it stopped with --resume (incidents that hit an API error are retried).
 *
 *   npm run eval -- --baseline                       # free keyword baseline
 *   npm run eval -- --model claude-haiku-5-5 --limit 5
 *   npm run eval -- --effort high --concurrency 6
 *   npm run eval -- --run-id <id> --resume
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const runsDir = resolve(root, "results/runs");

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    baseline: { type: "boolean", default: false },
    dataset: { type: "string", default: "incidents/generated" },
    ids: { type: "string" },
    difficulty: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "run-id": { type: "string" },
    resume: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

const model = args.baseline ? BASELINE_MODEL : (args.model ?? DEFAULT_MODEL);
const effort = args.baseline ? null : ((args.effort as Effort | undefined) ?? DEFAULT_EFFORT ?? null);
const concurrency = Math.max(1, Number(args.concurrency));

// ---- Dataset ----------------------------------------------------------------

const datasetDir = resolve(root, args.dataset!);
const manifestPath = resolve(datasetDir, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const files: string[] = manifest
  ? manifest.incidents.map((m: { file: string }) => m.file)
  : readdirSync(datasetDir).filter((f) => f.endsWith(".json"));

let incidents: Incident[] = files.map((f) => loadIncident(resolve(datasetDir, f)));
if (args.ids) {
  const wanted = new Set(args.ids.split(","));
  incidents = incidents.filter((i) => wanted.has(i.id));
}
if (args.difficulty) incidents = incidents.filter((i) => i.label.difficulty === args.difficulty);
if (args.limit) incidents = incidents.slice(0, Number(args.limit));
if (incidents.length === 0) {
  console.error("No incidents selected.");
  process.exit(1);
}

// ---- Run directory ----------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const runId = args["run-id"] ?? [today, model.replace(/[^a-z0-9.-]+/gi, "-"), effort].filter(Boolean).join("_");
const runDir = resolve(runsDir, runId);
const incidentsDir = resolve(runDir, "incidents");
if (existsSync(runDir) && !args.resume) {
  console.error(`Run ${runId} already exists. Pass --resume to continue it, or --run-id to start a new one.`);
  process.exit(1);
}
mkdirSync(incidentsDir, { recursive: true });

const git = (() => {
  try {
    return {
      commit: execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(),
      dirty: execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0,
    };
  } catch {
    return { commit: "unknown", dirty: false };
  }
})();

const configPath = resolve(runDir, "config.json");
const config: RunConfig = existsSync(configPath)
  ? { ...JSON.parse(readFileSync(configPath, "utf8")), finishedAt: null }
  : {
      runId,
      model,
      effort,
      dataset: {
        dir: relative(root, datasetDir),
        generatorVersion: manifest?.generatorVersion ?? null,
        seed: manifest?.seed ?? null,
        incidents: incidents.length,
      },
      budget: args.baseline ? null : { ...DEFAULT_BUDGET },
      concurrency,
      git,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
if (config.model !== model) {
  console.error(`Run ${runId} was made with ${config.model}, not ${model}.`);
  process.exit(1);
}
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

interface IncidentRecord {
  score: IncidentScore;
  result: TriageResult;
}
const recordPath = (id: string) => resolve(incidentsDir, `${id}.json`);
const done = (id: string) => {
  if (!existsSync(recordPath(id))) return false;
  const rec: IncidentRecord = JSON.parse(readFileSync(recordPath(id), "utf8"));
  return rec.result.outcome !== "api_error"; // retry transient failures on resume
};

// ---- Run --------------------------------------------------------------------

const todo = incidents.filter((i) => !done(i.id));
console.log(
  `\n=== Eval ${runId}: ${model}${effort ? ` (effort ${effort})` : ""} · ${incidents.length} incidents` +
    `${todo.length < incidents.length ? `, ${incidents.length - todo.length} already done` : ""} · concurrency ${concurrency} ===\n`,
);

let finished = 0;
async function runOne(incident: Incident): Promise<void> {
  const result = args.baseline ? baselineTriage(toIncidentView(incident)) : await triage(toIncidentView(incident), { model, effort: effort ?? undefined });
  const score = scoreIncident(incident, result);
  writeFileSync(recordPath(incident.id), JSON.stringify({ score, result } satisfies IncidentRecord, null, 2) + "\n");
  finished += 1;
  const mark = score.top1 ? "✓" : score.top1Lenient ? "~" : "✗";
  console.log(
    `[${String(finished).padStart(2)}/${todo.length}] ${incident.id} ${mark} ${score.predicted ?? score.outcome}` +
      `${score.confidence !== null ? ` (${score.confidence.toFixed(2)})` : ""} vs ${score.truth}` +
      ` · evidence ${score.evidence.correct}/${score.evidence.cited}` +
      `${score.costUsd !== null && !args.baseline ? ` · $${score.costUsd.toFixed(3)}` : ""}` +
      `${args.baseline ? "" : ` · ${(score.durationMs / 1000).toFixed(0)}s`}`,
  );
}

const queue = [...todo];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await runOne(next);
  }),
);

// ---- Score and report ---------------------------------------------------------

const scores: IncidentScore[] = incidents.map((i) => (JSON.parse(readFileSync(recordPath(i.id), "utf8")) as IncidentRecord).score);
const summary = summarize(scores);
config.finishedAt = new Date().toISOString();
config.dataset.incidents = incidents.length;
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
writeFileSync(resolve(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
writeFileSync(resolve(runDir, "report.md"), renderRunReport(config, summary, scores));

// Leaderboard over every run on disk.
const entries: LeaderboardEntry[] = readdirSync(runsDir)
  .filter((d) => existsSync(resolve(runsDir, d, "summary.json")))
  .map((d) => ({
    config: JSON.parse(readFileSync(resolve(runsDir, d, "config.json"), "utf8")),
    summary: JSON.parse(readFileSync(resolve(runsDir, d, "summary.json"), "utf8")),
  }));
writeFileSync(resolve(root, "results/README.md"), renderLeaderboard(entries));

const s = summary;
console.log(
  `\ntop-1 ${(s.overall.top1 * 100).toFixed(0)}% · lenient ${(s.overall.top1Lenient * 100).toFixed(0)}% · top-3 ${(s.overall.top3 * 100).toFixed(0)}%` +
    ` · evidence P ${(s.overall.evidencePrecision * 100).toFixed(0)}% R ${(s.overall.evidenceRecall * 100).toFixed(0)}%` +
    ` · ECE ${s.calibration.ece.toFixed(2)}` +
    `${s.cost.totalUsd !== null ? ` · total $${s.cost.totalUsd.toFixed(2)}` : ""}`,
);
console.log(`Report: ${relative(root, resolve(runDir, "report.md"))}`);
