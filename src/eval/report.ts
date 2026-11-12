import { ROOT_CAUSE_CATEGORIES } from "../types.js";
import type { IncidentScore, Slice, Summary } from "./score.js";

/** What produced a run — enough to reproduce or compare it. */
export interface RunConfig {
  runId: string;
  model: string;
  /** Prompt version; absent on runs from before versioning (= v1), null for the baseline. */
  prompt?: string | null;
  effort: string | null;
  dataset: { dir: string; generatorVersion: number | null; seed: string | null; incidents: number };
  budget: Record<string, number> | null;
  concurrency: number;
  git: { commit: string; dirty: boolean };
  startedAt: string;
  finishedAt: string | null;
  /** "incomplete" while running, or if some incidents never finished. Absent on older runs (= complete). */
  status?: "complete" | "incomplete";
  /** Set when the run stopped early on an error every incident would hit. */
  stoppedBy?: { kind: string; message: string };
}

const isBaseline = (c: RunConfig) => c.model.startsWith("baseline:");

/** A run's prompt version: null for the baseline; runs from before versioning used v1. */
export const runPrompt = (c: RunConfig): string | null => (isBaseline(c) ? null : (c.prompt ?? "v1"));
const promptOf = (c: RunConfig) => runPrompt(c) ?? "—";

/** The exact command to continue a run. */
export function resumeCommand(c: RunConfig): string {
  const flags = isBaseline(c) ? ["--baseline"] : ["--model", c.model, "--prompt", runPrompt(c)!, ...(c.effort ? ["--effort", c.effort] : [])];
  if (c.dataset.dir !== "incidents/generated") flags.push("--dataset", c.dataset.dir);
  return `npm run eval -- --run-id ${c.runId} --resume ${flags.join(" ")}`;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
/** " [lo–hi]" in percent, for a 95% interval. */
const pctRange = (iv?: [number, number] | null) => (iv ? ` [${(iv[0] * 100).toFixed(0)}–${(iv[1] * 100).toFixed(0)}]` : "");
const usd = (x: number | null) => (x === null ? "—" : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);
/** Leaderboard cost: three decimals, since cheap models differ below a cent. */
const usd3 = (x: number | null) => (x === null ? "—" : `$${x.toFixed(3)}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const num = (x: number, d = 2) => x.toFixed(d);

function sliceRow(name: string, s: Slice): string {
  return `| ${name} | ${s.n} | ${pct(s.top1)} | ${pct(s.top1Lenient)} | ${pct(s.top3)} | ${pct(s.evidencePrecision)} | ${pct(s.evidenceRecall)} |`;
}
const SLICE_HEAD = "| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |\n|---|---:|---:|---:|---:|---:|---:|";

export function renderRunReport(config: RunConfig, summary: Summary, scores: IncidentScore[], pending: string[] = []): string {
  const s = summary;
  const o = s.outcomes;
  const lines: string[] = [];
  lines.push(`# Eval run \`${config.runId}\``);
  lines.push("");
  if (pending.length) {
    lines.push(
      `> **Incomplete run — not comparable to other runs.** ${pending.length} of ${s.n + pending.length} incidents didn't finish` +
        `${config.stoppedBy ? ` (stopped early: ${config.stoppedBy.kind})` : " (API errors)"}; the numbers below cover only the ${s.n} that did. ` +
        `Resume with \`${resumeCommand(config)}\`.`,
    );
    lines.push("");
  }
  lines.push(
    `Model **${config.model}** · prompt **${promptOf(config)}**${config.effort ? ` · effort **${config.effort}**` : ""} · ${s.n} incidents from \`${config.dataset.dir}\` · ` +
      `generator v${config.dataset.generatorVersion ?? "?"} seed \`${config.dataset.seed ?? "?"}\` · commit \`${config.git.commit}\`${config.git.dirty ? " (dirty)" : ""}`,
  );
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push("| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  lines.push(
    `| **${pct(s.overall.top1)}** | ${pct(s.overall.top1Lenient)} | ${pct(s.overall.top3)} | ${pct(s.overall.evidencePrecision)} / ${pct(s.overall.evidenceRecall)} | ` +
      `${num(s.herrings.meanCited)} (${s.herrings.incidentsCitingAny}/${s.n}) | ${num(s.calibration.ece)} | ${num(s.calibration.brier)} | ${usd(s.cost.meanUsd)} | ` +
      `${secs(s.latency.p50Ms)} / ${secs(s.latency.p95Ms)} |`,
  );
  lines.push("");
  if (s.intervals) {
    const iv = s.intervals;
    lines.push(
      `95% bootstrap intervals (resampling incidents): top-1${pctRange(iv.top1)}, lenient${pctRange(iv.top1Lenient)}, ` +
        `evidence precision${pctRange(iv.evidencePrecision)}, recall${pctRange(iv.evidenceRecall)}` +
        `${iv.meanUsd ? `, cost / incident [${usd(iv.meanUsd[0])}–${usd(iv.meanUsd[1])}]` : ""}. ` +
        "To compare two runs on the same incidents, use `npm run compare`, which is much tighter.",
    );
    lines.push("");
  }
  lines.push(
    `Outcomes: ${o.submitted} submitted, ${o.budget_exhausted} budget exhausted, ${o.no_verdict} no verdict, ${o.refused} refused, ${o.api_error} API error. ` +
      `Total cost ${usd(s.cost.totalUsd)}. Mean ${num(s.effort.meanIterations, 1)} turns, ${num(s.effort.meanToolCalls, 1)} tool calls, ${Math.round(s.effort.meanTokens).toLocaleString("en-US")} tokens per incident.`,
  );
  lines.push("");
  lines.push(
    "*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. " +
      "*Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.",
  );

  lines.push("", "## By difficulty", "", SLICE_HEAD);
  for (const [d, sl] of Object.entries(s.byDifficulty)) lines.push(sliceRow(d, sl));

  lines.push("", "## By root cause", "", SLICE_HEAD);
  for (const [c, sl] of Object.entries(s.byCategory)) lines.push(sliceRow(c, sl));

  lines.push("", "## Calibration (top-1 confidence)", "", "| confidence | n | mean confidence | accuracy |", "|---|---:|---:|---:|");
  for (const b of s.calibration.bins) {
    lines.push(`| ${num(b.lo, 1)}–${num(b.hi, 1)} | ${b.n} | ${b.n ? num(b.meanConfidence) : "—"} | ${b.n ? pct(b.accuracy) : "—"} |`);
  }
  lines.push("", `Confidently wrong (top-1 wrong at confidence ≥ 0.8): **${s.calibration.confidentlyWrong}**.`);

  const cols = [...ROOT_CAUSE_CATEGORIES, "none"];
  const short = (c: string) => c.split("_").map((w) => w[0]).join("").toUpperCase();
  lines.push("", "## Confusion matrix", "", "Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.", "");
  lines.push(`| truth \\ predicted | ${cols.map(short).join(" | ")} |`);
  lines.push(`|---|${cols.map(() => "---:").join("|")}|`);
  for (const truth of ROOT_CAUSE_CATEGORIES) {
    lines.push(`| ${truth} (${short(truth)}) | ${cols.map((c) => s.confusion[truth][c] ?? "·").join(" | ")} |`);
  }

  const misses = scores.filter((x) => !x.top1).sort((a, b) => a.incidentId.localeCompare(b.incidentId));
  lines.push("", `## Misses (${misses.length})`, "");
  if (misses.length) {
    lines.push("| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |", "|---|---|---|---|---|---|");
    for (const m of misses) {
      lines.push(
        `| ${m.incidentId} | ${m.difficulty} | ${m.scenario ?? "—"} | ${m.predicted ?? "—"}${m.confidence !== null ? ` (${num(m.confidence)})` : ""} | ` +
          `${m.top1Lenient ? "yes" : "no"} | ${m.outcome} |`,
      );
    }
  } else {
    lines.push("None.");
  }
  lines.push("");
  return lines.join("\n");
}

export interface LeaderboardEntry {
  config: RunConfig;
  summary: Summary;
}

const DATASET_TITLES: Record<string, string> = {
  "incidents/generated": "Dev set (`incidents/generated`): prompts are tuned against this",
  "incidents/test": "Held-out test set (`incidents/test`): each candidate is run once, after tuning",
};

/** One table per dataset, one row per run, best top-1 first — results/README.md. */
export function renderLeaderboard(entries: LeaderboardEntry[]): string {
  const lines = [
    "# Eval results",
    "",
    "Generated by `npm run eval` from the runs in [`runs/`](runs/). Each run's `report.md` has the per-difficulty, per-category, calibration and confusion breakdowns. " +
      "[`ITERATIONS.md`](ITERATIONS.md) records what each prompt version changed and why. " +
      "Brackets are 95% bootstrap intervals on top-1. With 48 incidents one incident is 2 points, so compare two runs with `npm run compare` (paired, much tighter) before reading much into a gap.",
  ];
  const datasets = [...new Set(entries.map((e) => e.config.dataset.dir))].sort(
    (a, b) => Number(b === "incidents/generated") - Number(a === "incidents/generated") || a.localeCompare(b),
  );
  for (const dir of datasets) {
    const rows = entries
      .filter((e) => e.config.dataset.dir === dir)
      .sort((a, b) => b.summary.overall.top1 - a.summary.overall.top1 || a.config.runId.localeCompare(b.config.runId));
    lines.push(
      "",
      `## ${DATASET_TITLES[dir] ?? `\`${dir}\``}`,
      "",
      "| run | model | prompt | effort | n | top-1 | top-1 (lenient) | top-3 | evidence P / R | ECE | cost / incident | p50 latency |",
      "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
    for (const { config: c, summary: s } of rows) {
      lines.push(
        `| [${c.runId}](runs/${c.runId}/report.md) | ${c.model} | ${promptOf(c)} | ${c.effort ?? (isBaseline(c) ? "—" : "default")} | ${s.n} | **${pct(s.overall.top1)}**${pctRange(s.intervals?.top1)} | ${pct(s.overall.top1Lenient)} | ${pct(s.overall.top3)} | ` +
          `${pct(s.overall.evidencePrecision)} / ${pct(s.overall.evidenceRecall)} | ${num(s.calibration.ece)} | ${usd3(s.cost.meanUsd)} | ${secs(s.latency.p50Ms)} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
