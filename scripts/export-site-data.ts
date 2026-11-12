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
} as const;

const MATRIX = ["haikuLowTest", "haikuMediumTest", "sonnetLowTest", "sonnetMediumTest", "opusLowTest", "opusMediumTest"] as const;
const ITERATIONS = ["devV1", "devV2", "devV3", "devV3Low", "devV4Low"] as const;
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
  dataset: (() => {
    const manifest = JSON.parse(readFileSync(resolve(root, "incidents/test/manifest.json"), "utf8"));
    const lines = manifest.incidents.map((m: { lines: number }) => m.lines);
    return {
      incidents: manifest.count,
      categories: new Set(manifest.incidents.map((m: { rootCause: string }) => m.rootCause)).size,
      ambiguous: manifest.incidents.filter((m: { acceptableCauses: string[] }) => m.acceptableCauses.length).length,
      minLines: Math.min(...lines),
      maxLines: Math.max(...lines),
    };
  })(),
};

// ---- Replays ----

const REPLAYS: Array<{ incidentId: string; title: string; why: string; runs: Array<keyof typeof RUNS> }> = [
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
];

interface Record_ {
  score: IncidentScore;
  result: TriageResult;
}

function readRecord(runId: string, incidentId: string): Record_ {
  return JSON.parse(readFileSync(resolve(resultsDir, "runs", runId, "incidents", `${incidentId}.json`), "utf8"));
}

const replays = REPLAYS.map((r) => {
  const incident = loadIncident(resolve(root, "incidents/test", `${r.incidentId}.json`));
  const runs = r.runs.map((key) => {
    const config: RunConfig = loaded[key].config;
    const { score, result } = readRecord(config.runId, r.incidentId);
    return {
      key,
      modelName: MODEL_NAMES[config.model] ?? config.model,
      prompt: runPrompt(config),
      effort: config.effort ?? "medium",
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
