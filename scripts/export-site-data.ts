import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TriageResult } from "../src/agent.js";
import { PROMPTS } from "../src/prompts.js";
import { runPrompt, type RunConfig } from "../src/eval/report.js";
import { loadRun } from "../src/eval/runs.js";
import { summarize, type IncidentScore } from "../src/eval/score.js";
import { pairedDiff } from "../src/eval/stats.js";
import { listServices, loadIncident } from "../src/tools.js";

/**
 * Export the numbers and traces the showcase site (site/) renders, straight
 * from the committed runs in results/, so no figure on the page is typed by
 * hand. Re-run after new eval runs, then rebuild the site.
 *
 *   npm run export:site
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resultsDir = resolve(root, "results");
const outDir = resolve(root, "site/src/data/generated");

// ---- Runs shown on the page ----

const RUNS = {
  // Held-out test set
  baselineTest: "2026-11-12_baseline-keywords_test",
  opusV1Test: "2026-11-12_claude-opus-5-5_v1_test",
  opusMediumTest: "2026-11-12_claude-opus-5-5_v3_test",
  opusLowTest: "2026-11-12_claude-opus-5-5_v3_low_test",
  sonnetLowTest: "2026-11-12_claude-sonnet-5-5_v3_low_test",
  sonnetMediumTest: "2026-11-12_claude-sonnet-5-5_v3_medium_test",
  haikuLowTest: "2026-11-12_claude-haiku-5-5_v3_low_test",
  haikuMediumTest: "2026-11-12_claude-haiku-5-5_v3_medium_test",
  // Dev set (prompt iterations)
  devV1: "2026-11-12_claude-opus-5-5",
  devV2: "2026-11-12_claude-opus-5-5_v2",
  devV3: "2026-11-12_claude-opus-5-5_v3",
  devV3Low: "2026-11-12_claude-opus-5-5_v3_low",
  devV4Low: "2026-11-12_claude-opus-5-5_v4_low",
  devBaseline: "2026-11-12_baseline-keywords",
  // Generator v2 test set (Phase 7)
  v2Baseline: "2026-11-15_baseline-keywords_v2-test",
  v2HaikuLow: "2026-11-15_claude-haiku-5-5_v3_low_v2-test",
  v2HaikuLow2: "2026-11-15_claude-haiku-5-5_v3_low_v2-test_rep2",
  v2HaikuLow3: "2026-11-15_claude-haiku-5-5_v3_low_v2-test_rep3",
  v2HaikuMedium: "2026-11-15_claude-haiku-5-5_v3_medium_v2-test",
  v2SonnetLow: "2026-11-15_claude-sonnet-5-5_v3_low_v2-test",
  v2SonnetMedium: "2026-11-15_claude-sonnet-5-5_v3_medium_v2-test",
  v2OpusLow: "2026-11-15_claude-opus-5-5_v3_low_v2-test",
  v2OpusMedium: "2026-11-15_claude-opus-5-5_v3_medium_v2-test",
} as const;

const MATRIX = ["haikuLowTest", "haikuMediumTest", "sonnetLowTest", "sonnetMediumTest", "opusLowTest", "opusMediumTest"] as const;
const ITERATIONS = ["devV1", "devV2", "devV3", "devV3Low", "devV4Low"] as const;
const MATRIX_V2 = ["v2HaikuLow", "v2HaikuMedium", "v2SonnetLow", "v2SonnetMedium", "v2OpusLow", "v2OpusMedium"] as const;
/** Three identical Haiku low runs on v2: the run-to-run noise floor. */
const REPEATS_V2 = ["v2HaikuLow", "v2HaikuLow2", "v2HaikuLow3"] as const;
/** Shown next to a run in a replay when the same configuration was run more than once. */
const RUN_LABELS: Partial<Record<keyof typeof RUNS, string>> = { v2HaikuLow: "run 1 of 3", v2HaikuLow2: "run 2 of 3", v2HaikuLow3: "run 3 of 3" };
const PAIRS_V2: Array<[string, keyof typeof RUNS, keyof typeof RUNS]> = [
  ["Haiku low, run 1 → run 2 (identical)", "v2HaikuLow", "v2HaikuLow2"],
  ["Opus low → Haiku low", "v2OpusLow", "v2HaikuLow"],
  ["Opus low → Sonnet low", "v2OpusLow", "v2SonnetLow"],
  ["Opus: low → medium effort", "v2OpusLow", "v2OpusMedium"],
];
const PAIRS: Array<[string, keyof typeof RUNS, keyof typeof RUNS]> = [
  ["v1 → v3 (Opus, held-out)", "opusV1Test", "opusMediumTest"],
  ["Opus: medium → low effort", "opusMediumTest", "opusLowTest"],
  ["Opus low → Haiku low", "opusLowTest", "haikuLowTest"],
  ["Opus low → Sonnet low", "opusLowTest", "sonnetLowTest"],
];

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
  "baseline:keywords": "Keyword baseline",
};

const loaded = Object.fromEntries(Object.entries(RUNS).map(([k, id]) => [k, loadRun(resultsDir, id)])) as Record<keyof typeof RUNS, ReturnType<typeof loadRun>>;

function runSummary(key: keyof typeof RUNS) {
  const { config, scores } = loaded[key];
  const s = summarize(scores);
  return {
    key,
    runId: config.runId,
    model: config.model,
    modelName: MODEL_NAMES[config.model] ?? config.model,
    prompt: runPrompt(config),
    // Omitted effort means the model's default: medium for Opus 5.5.
    effort: config.effort ?? (config.model.startsWith("baseline") ? null : "medium"),
    dataset: config.dataset.dir,
    n: s.n,
    top1: s.overall.top1,
    top1Lenient: s.overall.top1Lenient,
    top3: s.overall.top3,
    evidencePrecision: s.overall.evidencePrecision,
    evidenceRecall: s.overall.evidenceRecall,
    ece: s.calibration.ece,
    confidentlyWrong: s.calibration.confidentlyWrong,
    herringIncidents: s.herrings.incidentsCitingAny,
    herringsMean: s.herrings.meanCited,
    hardTop1: s.byDifficulty.hard?.top1 ?? null,
    meanUsd: s.cost.meanUsd,
    p50Ms: s.latency.p50Ms,
    meanToolCalls: s.effort.meanToolCalls,
    intervals: s.intervals ?? null,
  };
}

const results = {
  generatedFrom: "results/runs",
  runs: Object.fromEntries((Object.keys(RUNS) as Array<keyof typeof RUNS>).map((k) => [k, runSummary(k)])),
  matrix: [...MATRIX],
  iterations: [...ITERATIONS],
  prompts: Object.fromEntries(Object.values(PROMPTS).map((p) => [p.id, p.summary])),
  paired: PAIRS.map(([label, a, b]) => ({
    label,
    a,
    b,
    diffs: pairedDiff(loaded[a].scores, loaded[b].scores),
  })),
  dataset: datasetStats("incidents/test"),
  v2: {
    matrix: [...MATRIX_V2],
    repeats: [...REPEATS_V2],
    baseline: "v2Baseline",
    paired: PAIRS_V2.map(([label, a, b]) => ({
      label,
      a,
      b,
      diffs: pairedDiff(loaded[a].scores, loaded[b].scores),
    })),
    dataset: datasetStats("incidents/v2/test"),
  },
};

function datasetStats(dir: string) {
  const manifest = JSON.parse(readFileSync(resolve(root, dir, "manifest.json"), "utf8"));
  const lines = manifest.incidents.map((m: { lines: number }) => m.lines);
  return {
    incidents: manifest.count,
    categories: new Set(manifest.incidents.map((m: { rootCause: string }) => m.rootCause)).size,
    ambiguous: manifest.incidents.filter((m: { acceptableCauses: string[] }) => m.acceptableCauses.length).length,
    minLines: Math.min(...lines),
    maxLines: Math.max(...lines),
  };
}

// ---- Replays ----

const REPLAYS: Array<{ incidentId: string; dataset?: string; title: string; why: string; runs: Array<keyof typeof RUNS> }> = [
  {
    incidentId: "test-008",
    title: "A held row lock",
    why: "With the Phase 3 prompt, Opus found the lock holder and still called it resource exhaustion. Once the prompt defined the categories, it classified the same evidence correctly.",
    runs: ["opusV1Test", "opusMediumTest", "haikuLowTest"],
  },
  {
    incidentId: "test-019",
    title: "A wrong endpoint, shipped with a release",
    why: "Genuinely ambiguous: the bad URL arrived in a deploy. Haiku gave the labeled answer; Opus and Sonnet chose the acceptable alternative.",
    runs: ["haikuLowTest", "opusLowTest", "sonnetLowTest"],
  },
  {
    incidentId: "test-016",
    title: "A retry storm",
    why: "Same right answer, different diligence: Sonnet stopped after one search and cited under half the evidence; Haiku kept reading and found all of it.",
    runs: ["sonnetLowTest", "haikuLowTest", "opusLowTest"],
  },
  {
    incidentId: "ht-012",
    dataset: "incidents/v2/test",
    title: "A crash loop, and a deploy just before it",
    why: "Of 13 misses on the v2 test set, the only one whose answer cited a labeled red herring, and it's a debatable one. The consumer crash-loops on one message. A deploy of that same consumer landed two minutes earlier, which the label calls a red herring. Haiku blamed the deploy in one run and named the poison message in another, with the same configuration both times. Opus named the poison message. Our label arguably should accept both: see Limitations.",
    runs: ["v2HaikuLow2", "v2HaikuLow", "v2OpusLow"],
  },
];

interface Record_ {
  score: IncidentScore;
  result: TriageResult;
}

function readRecord(runId: string, incidentId: string): Record_ {
  return JSON.parse(readFileSync(resolve(resultsDir, "runs", runId, "incidents", `${incidentId}.json`), "utf8"));
}

const replays = REPLAYS.map((r) => {
  const dataset = r.dataset ?? "incidents/test";
  const incident = loadIncident(resolve(root, dataset, `${r.incidentId}.json`));
  const runs = r.runs.map((key) => {
    const config: RunConfig = loaded[key].config;
    const { score, result } = readRecord(config.runId, r.incidentId);
    return {
      key,
      modelName: MODEL_NAMES[config.model] ?? config.model,
      prompt: runPrompt(config),
      effort: config.effort ?? "medium",
      runLabel: RUN_LABELS[key] ?? null,
      steps: result.trace.map((t) => ({ tool: t.tool, input: t.input, output: t.output, isError: !!t.isError })),
      verdict: result.verdict,
      score: {
        top1: score.top1,
        top1Lenient: score.top1Lenient,
        predicted: score.predicted,
        confidence: score.confidence,
        precision: score.evidence.precision,
        recall: score.evidence.recall,
        cited: score.evidence.cited,
        correct: score.evidence.correct,
      },
      costUsd: score.costUsd,
      durationMs: score.durationMs,
    };
  });
  // Every line any run cited, plus the labeled evidence and herrings, so the page can show their text.
  const wanted = new Set<number>([...incident.label.evidenceLines, ...incident.label.herringLines]);
  for (const run of runs) for (const h of run.verdict?.hypotheses ?? []) for (const n of h.evidenceLines) wanted.add(n);
  return {
    incidentId: r.incidentId,
    dataset: dataset === "incidents/test" ? "v1" : "v2",
    title: r.title,
    why: r.why,
    incident: {
      title: incident.title,
      alert: incident.alert,
      services: incident.services,
      lineCount: incident.logs.length,
      overview: listServices(incident.logs),
    },
    label: {
      rootCause: incident.label.rootCause,
      acceptableCauses: incident.label.acceptableCauses,
      difficulty: incident.label.difficulty,
      evidenceLines: incident.label.evidenceLines,
      herringLines: incident.label.herringLines,
      explanation: incident.label.explanation,
    },
    lines: incident.logs.filter((l) => wanted.has(l.n)),
    runs,
  };
});

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
writeFileSync(resolve(outDir, "replays.json"), JSON.stringify(replays, null, 2) + "\n");
console.log(`Wrote ${Object.keys(results.runs).length} runs and ${replays.length} replays to ${outDir}`);
