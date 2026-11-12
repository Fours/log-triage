import { ROOT_CAUSE_CATEGORIES } from "../types.js";
import type { IncidentScore, Slice, Summary } from "./score.js";

/** What produced a run — enough to reproduce or compare it. */
export interface RunConfig {
  runId: string;
  model: string;
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

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const usd = (x: number | null) => (x === null ? "—" : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);
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
        `Resume with \`npm run eval -- --run-id ${config.runId} --resume\`.`,
    );
    lines.push("");
  }
  lines.push(
    `Model **${config.model}**${config.effort ? ` · effort **${config.effort}**` : ""} · ${s.n} incidents · ` +
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

/** One row per run, best top-1 first — the comparison table for results/README.md. */
export function renderLeaderboard(entries: LeaderboardEntry[]): string {
  const rows = [...entries].sort((a, b) => b.summary.overall.top1 - a.summary.overall.top1 || a.config.runId.localeCompare(b.config.runId));
  const lines = [
    "# Eval results",
    "",
    "Generated by `npm run eval` from the runs in [`runs/`](runs/). Each run's `report.md` has the per-difficulty, per-category, calibration and confusion breakdowns.",
    "",
    "| run | model | effort | n | top-1 | top-1 (lenient) | top-3 | evidence P / R | ECE | cost / incident | p50 latency |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const { config: c, summary: s } of rows) {
    lines.push(
      `| [${c.runId}](runs/${c.runId}/report.md) | ${c.model} | ${c.effort ?? (c.model.startsWith("baseline") ? "—" : "default")} | ${s.n} | **${pct(s.overall.top1)}** | ${pct(s.overall.top1Lenient)} | ${pct(s.overall.top3)} | ` +
        `${pct(s.overall.evidencePrecision)} / ${pct(s.overall.evidenceRecall)} | ${num(s.calibration.ece)} | ${usd(s.cost.meanUsd)} | ${secs(s.latency.p50Ms)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
