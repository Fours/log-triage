import type { Outcome, TriageResult } from "../agent.js";
import { ROOT_CAUSE_CATEGORIES, type Incident, type RootCauseCategory } from "../types.js";
import { costUsd } from "./pricing.js";

/**
 * Scoring is deterministic code over (label, verdict): no LLM judge. Root
 * causes are a closed set and evidence is line numbers, so every metric is
 * exact and two runs can be compared without judge noise.
 */

export interface EvidenceScore {
  /** Lines the top hypothesis cited. */
  cited: number;
  /** Cited lines that are labeled evidence. */
  correct: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface IncidentScore {
  incidentId: string;
  difficulty: Incident["label"]["difficulty"];
  scenario: string | null;
  truth: RootCauseCategory;
  acceptable: RootCauseCategory[];
  outcome: Outcome;
  /** Top-ranked root cause, or null with no verdict. */
  predicted: RootCauseCategory | null;
  /** Confidence the agent gave its top hypothesis. */
  confidence: number | null;
  /** Top hypothesis is the labeled root cause. */
  top1: boolean;
  /** Top hypothesis is the root cause or a labeled acceptable alternative. */
  top1Lenient: boolean;
  /** The root cause appears in the first three hypotheses. */
  top3: boolean;
  /** 1-based rank of the root cause among hypotheses, null if absent. */
  rank: number | null;
  evidence: EvidenceScore;
  /** Red-herring lines cited anywhere in the verdict. */
  herringsCited: number;
  costUsd: number | null;
  durationMs: number;
  iterations: number;
  toolCalls: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export function scoreIncident(incident: Incident, result: TriageResult): IncidentScore {
  const { label } = incident;
  const hyps = result.verdict?.hypotheses ?? [];
  const top = hyps[0];
  const rankIdx = hyps.findIndex((h) => h.rootCause === label.rootCause);

  const truthLines = new Set(label.evidenceLines);
  const cited = new Set(top?.evidenceLines ?? []);
  const correct = [...cited].filter((n) => truthLines.has(n)).length;
  const precision = cited.size ? correct / cited.size : 0;
  const recall = truthLines.size ? correct / truthLines.size : 0;

  const herrings = new Set(label.herringLines);
  const allCited = new Set(hyps.flatMap((h) => h.evidenceLines));

  return {
    incidentId: incident.id,
    difficulty: label.difficulty,
    scenario: label.scenario ?? null,
    truth: label.rootCause,
    acceptable: label.acceptableCauses,
    outcome: result.outcome,
    predicted: top?.rootCause ?? null,
    confidence: top?.confidence ?? null,
    top1: top?.rootCause === label.rootCause,
    top1Lenient: !!top && (top.rootCause === label.rootCause || label.acceptableCauses.includes(top.rootCause)),
    top3: rankIdx >= 0 && rankIdx < 3,
    rank: rankIdx >= 0 ? rankIdx + 1 : null,
    evidence: {
      cited: cited.size,
      correct,
      precision,
      recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    },
    herringsCited: [...allCited].filter((n) => herrings.has(n)).length,
    costUsd: costUsd(result.model, result.usage),
    durationMs: result.durationMs,
    iterations: result.iterations,
    toolCalls: result.toolCalls,
    tokens: {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
      cacheRead: result.usage.cacheReadTokens,
      cacheWrite: result.usage.cacheWriteTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Aggregation

export interface CalibrationBin {
  /** Confidence range [lo, hi). The last bin includes 1.0. */
  lo: number;
  hi: number;
  n: number;
  meanConfidence: number;
  accuracy: number;
}

export interface Slice {
  n: number;
  top1: number;
  top1Lenient: number;
  top3: number;
  evidencePrecision: number;
  evidenceRecall: number;
  evidenceF1: number;
}

export interface Summary {
  n: number;
  /** Rates over all incidents; an incident without a verdict counts as wrong. */
  overall: Slice;
  outcomes: Record<Outcome, number>;
  byDifficulty: Record<string, Slice>;
  byCategory: Record<string, Slice>;
  calibration: {
    /** Expected calibration error of top-1 confidence vs top-1 correctness (verdicts only). */
    ece: number;
    /** Mean squared error of top-1 confidence vs correctness (verdicts only). */
    brier: number;
    /** Wrong top-1 answers given with confidence ≥ 0.8. */
    confidentlyWrong: number;
    bins: CalibrationBin[];
  };
  /** Mean red-herring lines cited per incident, and share of incidents citing any. */
  herrings: { meanCited: number; incidentsCitingAny: number };
  /** confusion[truth][predicted] — predicted "none" when there was no verdict. */
  confusion: Record<string, Record<string, number>>;
  cost: { totalUsd: number | null; meanUsd: number | null };
  latency: { p50Ms: number; p95Ms: number; meanMs: number };
  effort: { meanIterations: number; meanToolCalls: number; meanTokens: number };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (xs: boolean[]) => mean(xs.map(Number));

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function slice(scores: IncidentScore[]): Slice {
  return {
    n: scores.length,
    top1: rate(scores.map((s) => s.top1)),
    top1Lenient: rate(scores.map((s) => s.top1Lenient)),
    top3: rate(scores.map((s) => s.top3)),
    evidencePrecision: mean(scores.map((s) => s.evidence.precision)),
    evidenceRecall: mean(scores.map((s) => s.evidence.recall)),
    evidenceF1: mean(scores.map((s) => s.evidence.f1)),
  };
}

function groupBy<K extends string>(scores: IncidentScore[], key: (s: IncidentScore) => K): Record<K, IncidentScore[]> {
  const out = {} as Record<K, IncidentScore[]>;
  for (const s of scores) (out[key(s)] ??= []).push(s);
  return out;
}

/** Equal-width bins over [0, 1]; ECE = Σ (n_bin / n) · |accuracy − mean confidence|. */
export function calibration(scores: IncidentScore[], binCount = 5): Summary["calibration"] {
  const answered = scores.filter((s) => s.confidence !== null);
  const bins: CalibrationBin[] = Array.from({ length: binCount }, (_, i) => {
    const lo = i / binCount;
    const hi = (i + 1) / binCount;
    const inBin = answered.filter((s) => s.confidence! >= lo && (s.confidence! < hi || (i === binCount - 1 && s.confidence! <= hi)));
    return {
      lo,
      hi,
      n: inBin.length,
      meanConfidence: mean(inBin.map((s) => s.confidence!)),
      accuracy: rate(inBin.map((s) => s.top1)),
    };
  });
  const ece = answered.length ? bins.reduce((acc, b) => acc + (b.n / answered.length) * Math.abs(b.accuracy - b.meanConfidence), 0) : 0;
  return {
    ece,
    brier: mean(answered.map((s) => (s.confidence! - Number(s.top1)) ** 2)),
    confidentlyWrong: answered.filter((s) => !s.top1 && s.confidence! >= 0.8).length,
    bins,
  };
}

export function summarize(scores: IncidentScore[]): Summary {
  const outcomes = { submitted: 0, budget_exhausted: 0, no_verdict: 0, refused: 0, api_error: 0 } as Record<Outcome, number>;
  for (const s of scores) outcomes[s.outcome] += 1;

  const confusion: Summary["confusion"] = {};
  for (const truth of ROOT_CAUSE_CATEGORIES) confusion[truth] = {};
  for (const s of scores) {
    const row = confusion[s.truth];
    const col = s.predicted ?? "none";
    row[col] = (row[col] ?? 0) + 1;
  }

  const costs = scores.map((s) => s.costUsd);
  const priced = costs.every((c) => c !== null);
  const durations = scores.map((s) => s.durationMs);

  return {
    n: scores.length,
    overall: slice(scores),
    outcomes,
    byDifficulty: Object.fromEntries(
      (["easy", "medium", "hard"] as const)
        .map((d) => [d, scores.filter((s) => s.difficulty === d)] as const)
        .filter(([, xs]) => xs.length)
        .map(([d, xs]) => [d, slice(xs)]),
    ),
    byCategory: Object.fromEntries(
      Object.entries(groupBy(scores, (s) => s.truth))
        .sort(([a], [b]) => ROOT_CAUSE_CATEGORIES.indexOf(a as RootCauseCategory) - ROOT_CAUSE_CATEGORIES.indexOf(b as RootCauseCategory))
        .map(([c, xs]) => [c, slice(xs)]),
    ),
    calibration: calibration(scores),
    herrings: {
      meanCited: mean(scores.map((s) => s.herringsCited)),
      incidentsCitingAny: scores.filter((s) => s.herringsCited > 0).length,
    },
    confusion,
    cost: priced
      ? { totalUsd: costs.reduce((a, b) => a! + b!, 0)!, meanUsd: mean(costs as number[]) }
      : { totalUsd: null, meanUsd: null },
    latency: { p50Ms: percentile(durations, 50), p95Ms: percentile(durations, 95), meanMs: mean(durations) },
    effort: {
      meanIterations: mean(scores.map((s) => s.iterations)),
      meanToolCalls: mean(scores.map((s) => s.toolCalls)),
      meanTokens: mean(scores.map((s) => s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheWrite)),
    },
  };
}
