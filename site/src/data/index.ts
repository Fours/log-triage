import resultsJson from './generated/results.json'
import replaysJson from './generated/replays.json'

/**
 * Everything numeric on the page comes from these two files, written by
 * `npm run export:site` (scripts/export-site-data.ts) from the committed eval
 * runs. Copy lives in the components; numbers never do.
 */

export type Interval = [number, number]

export interface RunSummary {
  key: string
  runId: string
  model: string
  modelName: string
  prompt: string | null
  effort: string | null
  dataset: string
  n: number
  top1: number
  top1Lenient: number
  top3: number
  evidencePrecision: number
  evidenceRecall: number
  ece: number
  confidentlyWrong: number
  herringIncidents: number
  /** Labeled herring lines cited per incident (any hypothesis). */
  herringsMean: number
  hardTop1: number | null
  meanUsd: number | null
  p50Ms: number
  meanToolCalls: number
  intervals: {
    top1: Interval
    top1Lenient: Interval
    evidencePrecision: Interval
    evidenceRecall: Interval
    meanUsd: Interval | null
  } | null
}

export interface PairedDiff {
  metric: string
  diff: number
  ci: Interval
  significant: boolean
}

export interface DatasetStats {
  incidents: number
  categories: number
  ambiguous: number
  minLines: number
  maxLines: number
}

export interface PairedRow {
  label: string
  a: string
  b: string
  diffs: PairedDiff[]
}

export interface Results {
  runs: Record<string, RunSummary>
  matrix: string[]
  iterations: string[]
  prompts: Record<string, string>
  paired: PairedRow[]
  dataset: DatasetStats
  /** Generator v2's held-out test set (Phase 7). */
  v2: {
    matrix: string[]
    /** Identical Haiku low runs: the run-to-run noise floor. */
    repeats: string[]
    baseline: string
    paired: PairedRow[]
    dataset: DatasetStats
  }
}

export interface LogLine {
  n: number
  ts: string
  service: string
  level: string
  msg: string
  traceId?: string
}

export interface Hypothesis {
  rootCause: string
  confidence: number
  evidenceLines: number[]
  reasoning: string
}

export interface ReplayRun {
  key: string
  modelName: string
  prompt: string | null
  effort: string
  /** e.g. "run 2 of 3", when the same configuration ran more than once. */
  runLabel: string | null
  steps: { tool: string; input: unknown; output: string; isError: boolean }[]
  verdict: { hypotheses: Hypothesis[]; recommendedAction: string } | null
  score: {
    top1: boolean
    top1Lenient: boolean
    predicted: string | null
    confidence: number | null
    precision: number
    recall: number
    cited: number
    correct: number
  }
  costUsd: number | null
  durationMs: number
}

export interface Replay {
  incidentId: string
  /** Which generator's test set the incident is from. */
  dataset: 'v1' | 'v2'
  title: string
  why: string
  incident: { title: string; alert: string; services: string[]; lineCount: number; overview: string }
  label: {
    rootCause: string
    acceptableCauses: string[]
    difficulty: string
    evidenceLines: number[]
    herringLines: number[]
    explanation: string
  }
  lines: LogLine[]
  runs: ReplayRun[]
}

export const results = resultsJson as unknown as Results
export const replays = replaysJson as unknown as Replay[]

export const run = (key: string): RunSummary => {
  const r = results.runs[key]
  if (!r) throw new Error(`No run "${key}" in results.json`)
  return r
}

// ---- Formatting ----

export const pct = (x: number) => `${Math.round(x * 100)}%`
export const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)} pts`
export const usd = (x: number | null) =>
  x === null ? '—' : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`
export const category = (c: string | null) => (c ? c.replace(/_/g, ' ') : 'no verdict')
