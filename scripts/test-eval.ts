import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import type { ApiErrorKind, TriageResult } from "../src/agent.js";
import { baselineTriage } from "../src/eval/baseline.js";
import { costUsd } from "../src/eval/pricing.js";
import { renderLeaderboard, renderRunReport, type RunConfig } from "../src/eval/report.js";
import { runEval, writeLeaderboard, type TriageFn } from "../src/eval/runner.js";
import { calibration, percentile, scoreIncident, summarize, type IncidentScore } from "../src/eval/score.js";
import { generateDataset } from "../src/generator/index.js";
import { loadIncident } from "../src/tools.js";
import { Incident, toIncidentView, type Hypothesis, type RootCauseCategory } from "../src/types.js";

/** Scorer, aggregation and report checks — no API key. Run: npm run test:eval */

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const incident = Incident.parse({
  id: "t-1",
  title: "t",
  alert: "a",
  services: ["s"],
  logs: Array.from({ length: 20 }, (_, i) => ({ n: i + 1, ts: "2026-01-01T00:00:00Z", service: "s", level: "INFO", msg: `line ${i + 1}` })),
  label: {
    rootCause: "config_error",
    acceptableCauses: ["bad_deploy"],
    evidenceLines: [3, 4, 5, 6],
    herringLines: [10, 11],
    explanation: "x",
    difficulty: "hard",
  },
});

const hyp = (rootCause: RootCauseCategory, evidenceLines: number[], confidence = 0.7): Hypothesis => ({ rootCause, confidence, evidenceLines, reasoning: "r" });
function result(hypotheses: Hypothesis[] | null, extra: Partial<TriageResult> = {}): TriageResult {
  return {
    incidentId: "t-1",
    model: "claude-opus-5-5",
    outcome: hypotheses ? "submitted" : "budget_exhausted",
    verdict: hypotheses ? { hypotheses, recommendedAction: "x" } : null,
    trace: [],
    iterations: 3,
    toolCalls: 4,
    usage: { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 },
    durationMs: 5000,
    stopReason: "tool_use",
    ...extra,
  };
}

console.log("Scorer");

check("exact top-1 with evidence precision and recall", () => {
  const s = scoreIncident(incident, result([hyp("config_error", [3, 4, 9])]));
  assert.ok(s.top1 && s.top1Lenient && s.top3);
  assert.equal(s.rank, 1);
  assert.equal(s.evidence.correct, 2);
  assert.equal(s.evidence.precision, 2 / 3);
  assert.equal(s.evidence.recall, 2 / 4);
  assert.ok(Math.abs(s.evidence.f1 - (2 * (2 / 3) * 0.5) / (2 / 3 + 0.5)) < 1e-12);
});

check("an acceptable alternative scores lenient but not exact; true cause second is top-3 rank 2", () => {
  const s = scoreIncident(incident, result([hyp("bad_deploy", [3]), hyp("config_error", [4])]));
  assert.ok(!s.top1 && s.top1Lenient && s.top3);
  assert.equal(s.rank, 2);
});

check("true cause fourth is outside top-3", () => {
  const s = scoreIncident(incident, result([hyp("external_outage", [1]), hyp("bad_deploy", [1]), hyp("data_integrity", [1]), hyp("config_error", [3])]));
  assert.ok(!s.top3);
  assert.equal(s.rank, 4);
});

check("evidence is scored on the top hypothesis; herrings counted across all hypotheses", () => {
  const s = scoreIncident(incident, result([hyp("config_error", [10, 3]), hyp("bad_deploy", [11, 4])]));
  assert.equal(s.evidence.cited, 2);
  assert.equal(s.evidence.correct, 1);
  assert.equal(s.herringsCited, 2);
});

check("no verdict scores as wrong with zero evidence, keeping the outcome", () => {
  const s = scoreIncident(incident, result(null));
  assert.ok(!s.top1 && !s.top1Lenient && !s.top3);
  assert.equal(s.predicted, null);
  assert.equal(s.confidence, null);
  assert.equal(s.outcome, "budget_exhausted");
  assert.deepEqual([s.evidence.precision, s.evidence.recall, s.evidence.f1], [0, 0, 0]);
});

check("cost uses per-model pricing, including cache reads and writes", () => {
  // Opus 5.5: $4 in, $20 out, $0.20 cache read, $5 cache write per MTok.
  assert.equal(costUsd("claude-opus-5-5", { inputTokens: 1e6, outputTokens: 1e5, cacheReadTokens: 1e6, cacheWriteTokens: 0 }), 4 + 2 + 0.2);
  assert.equal(costUsd("claude-opus-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1e6 }), 5);
  assert.equal(costUsd("baseline:keywords", { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }), null);
  assert.equal(scoreIncident(incident, result([hyp("config_error", [3])])).costUsd, 6.2);
});

console.log("\nAggregation");

const fakeScore = (top1: boolean, confidence: number | null, extra: Partial<IncidentScore> = {}): IncidentScore => ({
  ...scoreIncident(incident, result([hyp("config_error", [3])])),
  top1,
  top1Lenient: top1,
  confidence,
  ...extra,
});

check("calibration: a perfectly calibrated set has ECE 0; overconfidence shows up", () => {
  const calibrated = [fakeScore(true, 0.9), fakeScore(true, 0.9), fakeScore(true, 0.5), fakeScore(false, 0.5)];
  // bin 0.8–1.0: conf 0.9, acc 1.0 → gap 0.1 (n=2); bin 0.4–0.6: conf 0.5, acc 0.5 → 0
  assert.ok(Math.abs(calibration(calibrated).ece - 0.05) < 1e-12);
  const perfect = [fakeScore(true, 1), fakeScore(false, 0)];
  assert.equal(calibration(perfect).ece, 0);
  assert.equal(calibration(perfect).brier, 0);
  const over = calibration([fakeScore(false, 0.95), fakeScore(false, 0.85)]);
  assert.ok(over.ece > 0.85);
  assert.equal(over.confidentlyWrong, 2);
});

check("calibration ignores incidents without a verdict; confidence 1.0 lands in the top bin", () => {
  const c = calibration([fakeScore(true, 1), fakeScore(false, null)]);
  assert.equal(c.bins.at(-1)!.n, 1);
  assert.equal(c.bins.reduce((a, b) => a + b.n, 0), 1);
});

check("percentile uses nearest-rank", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([], 50), 0);
});

check("summary: rates over all incidents, outcome counts, confusion with 'none'", () => {
  const scores = [
    scoreIncident(incident, result([hyp("config_error", [3, 4])])),
    scoreIncident(incident, result([hyp("bad_deploy", [3])])),
    scoreIncident(incident, result(null)),
  ];
  const s = summarize(scores);
  assert.equal(s.n, 3);
  assert.equal(s.overall.top1, 1 / 3);
  assert.equal(s.overall.top1Lenient, 2 / 3);
  assert.equal(s.outcomes.submitted, 2);
  assert.equal(s.outcomes.budget_exhausted, 1);
  assert.deepEqual(s.confusion.config_error, { config_error: 1, bad_deploy: 1, none: 1 });
  assert.equal(s.byDifficulty.hard.n, 3);
  assert.equal(s.cost.totalUsd, 6.2 * 3);
});

check("summary cost is null when any run is unpriced", () => {
  const s = summarize([scoreIncident(incident, result([hyp("config_error", [3])], { model: "baseline:keywords" }))]);
  assert.equal(s.cost.totalUsd, null);
});

console.log("\nReports and baseline");

const config: RunConfig = {
  runId: "r1",
  model: "claude-opus-5-5",
  effort: null,
  dataset: { dir: "incidents/generated", generatorVersion: 1, seed: "s", incidents: 1 },
  budget: null,
  concurrency: 1,
  git: { commit: "abc", dirty: false },
  startedAt: "",
  finishedAt: "",
};

check("run report and leaderboard render every section", () => {
  const scores = [scoreIncident(incident, result([hyp("bad_deploy", [3])]))];
  const md = renderRunReport(config, summarize(scores), scores);
  for (const h of ["## Headline", "## By difficulty", "## By root cause", "## Calibration", "## Confusion matrix", "## Misses (1)"]) assert.ok(md.includes(h), h);
  const board = renderLeaderboard([{ config, summary: summarize(scores) }]);
  assert.ok(board.includes("[r1](runs/r1/report.md)"));
});

check("baseline produces a scoreable verdict for every generated incident from the view alone", () => {
  for (const { incident: inc } of generateDataset()) {
    const r = baselineTriage(toIncidentView(inc));
    assert.equal(r.outcome, "submitted", inc.id);
    for (const h of r.verdict!.hypotheses) for (const n of h.evidenceLines) assert.ok(n >= 1 && n <= inc.logs.length);
  }
});

check("the hand-built sample still loads and scores (labels from before Phase 3 get defaults)", () => {
  const sample = loadIncident(resolve(here, "../incidents/sample-001-payment-timeout.json"));
  assert.deepEqual(sample.label.herringLines, []);
  const s = scoreIncident(sample, baselineTriage(toIncidentView(sample)));
  assert.equal(s.truth, "dependency_timeout");
});

console.log("\nRunner (fake agent, temp results dir)");

async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const root = resolve(here, "..");
const datasetDir = resolve(root, "incidents/generated");
const ids = ["gen-001", "gen-002", "gen-003", "gen-004", "gen-005", "gen-006", "gen-007", "gen-008"];

/** A fake agent: answers like the baseline, but fails with `kind` on the calls listed in `failOn` (1-based). */
function fakeAgent(failOn: number[] = [], kind: ApiErrorKind = "billing") {
  let calls = 0;
  const fn: TriageFn = async (view) => {
    const call = ++calls;
    await new Promise((r) => setTimeout(r, 5));
    if (failOn.includes(call)) {
      return { ...baselineTriage(view), model: "claude-opus-5-5", outcome: "api_error", verdict: null, apiErrorKind: kind, error: `API error (${kind})` };
    }
    return { ...baselineTriage(view), model: "claude-opus-5-5" };
  };
  return { fn, calls: () => calls };
}

const tmp = mkdtempSync(join(tmpdir(), "log-triage-eval-"));
const base = { root, resultsDir: tmp, datasetDir, model: "claude-opus-5-5", effort: null, ids, log: () => {} };
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

try {
  await checkAsync("out of credits: stops pulling incidents, marks the run incomplete, keeps it off the leaderboard", async () => {
    const agent = fakeAgent([3]);
    const out = await runEval({ ...base, runId: "billing", concurrency: 1, triageFn: agent.fn });
    assert.equal(agent.calls(), 3, "no incidents started after the fatal error");
    assert.equal(out.complete, false);
    assert.equal(out.stoppedBy?.kind, "billing");
    assert.equal(out.pending.length, 6);
    assert.equal(out.summary.n, 2, "summary covers only finished incidents");
    assert.equal(readJson(join(out.runDir, "config.json")).status, "incomplete");
    assert.match(readFileSync(join(out.runDir, "report.md"), "utf8"), /Incomplete run/);
    assert.ok(!readFileSync(join(tmp, "README.md"), "utf8").includes("billing"));
  });

  await checkAsync("resume after topping up: finished incidents are kept, the failed one is retried, run completes", async () => {
    const agent = fakeAgent();
    const out = await runEval({ ...base, runId: "billing", concurrency: 1, resume: true, triageFn: agent.fn });
    assert.equal(agent.calls(), 6);
    assert.equal(out.complete, true);
    assert.equal(out.summary.n, 8);
    const config = readJson(join(out.runDir, "config.json"));
    assert.equal(config.status, "complete");
    assert.equal(config.stoppedBy, undefined);
    assert.ok(!readFileSync(join(out.runDir, "report.md"), "utf8").includes("Incomplete"));
    assert.ok(readFileSync(join(tmp, "README.md"), "utf8").includes("[billing]"));
  });

  await checkAsync("with concurrency, in-flight incidents finish but nothing new starts after a fatal error", async () => {
    const agent = fakeAgent([1]);
    const out = await runEval({ ...base, runId: "parallel", concurrency: 4, triageFn: agent.fn });
    assert.ok(agent.calls() <= 4, `${agent.calls()} calls`);
    assert.equal(out.stoppedBy?.kind, "billing");
    assert.equal(out.pending.length, 8 - (agent.calls() - 1));
  });

  await checkAsync("a transient error (rate limited after retries) doesn't stop the run, but leaves it incomplete", async () => {
    const agent = fakeAgent([2], "rate_limited");
    const out = await runEval({ ...base, runId: "transient", concurrency: 1, triageFn: agent.fn });
    assert.equal(agent.calls(), 8);
    assert.equal(out.stoppedBy, undefined);
    assert.equal(out.complete, false);
    assert.deepEqual(out.pending, ["gen-002"]);
  });

  await checkAsync("auth, bad-request and unknown-model errors also stop the run", async () => {
    for (const kind of ["auth", "bad_request", "not_found"] as const) {
      const agent = fakeAgent([1], kind);
      const out = await runEval({ ...base, runId: `fatal-${kind}`, concurrency: 1, triageFn: agent.fn });
      assert.equal(agent.calls(), 1, kind);
      assert.equal(out.stoppedBy?.kind, kind);
    }
  });

  await checkAsync("an existing run needs --resume; runs from before `status` existed count as complete", async () => {
    await assert.rejects(runEval({ ...base, runId: "billing", concurrency: 1, triageFn: fakeAgent().fn }), /already exists/);
    const legacy = join(tmp, "runs", "transient", "config.json");
    const cfg = readJson(legacy);
    delete cfg.status;
    writeFileSync(legacy, JSON.stringify(cfg));
    writeLeaderboard(tmp);
    assert.ok(readFileSync(join(tmp, "README.md"), "utf8").includes("[transient]"));
  });
} finally {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed.`);
