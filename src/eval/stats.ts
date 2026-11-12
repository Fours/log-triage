import { createRng } from "../generator/rng.js";
import type { IncidentScore } from "./score.js";

/**
 * Uncertainty for 48-incident runs, where one incident moves top-1 by 2 points.
 * Percentile bootstrap, seeded so a report regenerates byte-for-byte.
 */

export type Interval = [lo: number, hi: number];

const ITERATIONS = 4000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function quantile(sorted: number[], q: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/** 95% percentile-bootstrap interval for the mean of `xs`. */
export function bootstrapMean(xs: number[], seed = "bootstrap"): Interval {
  if (xs.length === 0) return [0, 0];
  const rng = createRng(seed);
  const stats: number[] = [];
  for (let b = 0; b < ITERATIONS; b++) {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) sum += xs[rng.int(0, xs.length - 1)];
    stats.push(sum / xs.length);
  }
  stats.sort((a, b) => a - b);
  return [quantile(stats, 0.025), quantile(stats, 0.975)];
}

export interface Intervals {
  top1: Interval;
  top1Lenient: Interval;
  evidencePrecision: Interval;
  evidenceRecall: Interval;
  /** Null when the run isn't priced (the baseline). */
  meanUsd: Interval | null;
}

/** 95% intervals for a run's headline metrics, resampling incidents. */
export function intervals(scores: IncidentScore[]): Intervals {
  const costs = scores.map((s) => s.costUsd);
  return {
    top1: bootstrapMean(scores.map((s) => Number(s.top1)), "top1"),
    top1Lenient: bootstrapMean(scores.map((s) => Number(s.top1Lenient)), "top1Lenient"),
    evidencePrecision: bootstrapMean(scores.map((s) => s.evidence.precision), "evidencePrecision"),
    evidenceRecall: bootstrapMean(scores.map((s) => s.evidence.recall), "evidenceRecall"),
    meanUsd: costs.every((c) => c !== null) ? bootstrapMean(costs as number[], "meanUsd") : null,
  };
}

export interface PairedDiff {
  metric: string;
  /** Mean of b − a over shared incidents. */
  diff: number;
  ci: Interval;
  /** The interval excludes zero. */
  significant: boolean;
}

export const PAIRED_METRICS: Record<string, (s: IncidentScore) => number | null> = {
  top1: (s) => Number(s.top1),
  top1Lenient: (s) => Number(s.top1Lenient),
  evidencePrecision: (s) => s.evidence.precision,
  evidenceRecall: (s) => s.evidence.recall,
  costUsd: (s) => s.costUsd,
  seconds: (s) => s.durationMs / 1000,
};

/**
 * Paired comparison of two runs on the same incidents: resample incidents and
 * take the mean per-incident difference (b − a). Much tighter than comparing
 * two independent intervals, because most incidents are easy for both runs.
 */
export function pairedDiff(a: IncidentScore[], b: IncidentScore[]): PairedDiff[] {
  const byId = new Map(a.map((s) => [s.incidentId, s]));
  const pairs = b.filter((s) => byId.has(s.incidentId)).map((s) => [byId.get(s.incidentId)!, s] as const);
  if (pairs.length === 0) throw new Error("The two runs share no incidents.");
  const out: PairedDiff[] = [];
  for (const [metric, get] of Object.entries(PAIRED_METRICS)) {
    const diffs = pairs.map(([x, y]) => {
      const vx = get(x);
      const vy = get(y);
      return vx === null || vy === null ? null : vy - vx;
    });
    if (diffs.some((d) => d === null)) continue;
    const ds = diffs as number[];
    const ci = bootstrapMean(ds, `paired:${metric}`);
    out.push({ metric, diff: mean(ds), ci, significant: ci[0] > 0 || ci[1] < 0 });
  }
  return out;
}
