import type { TriageResult } from "../agent.js";
import type { Hypothesis, IncidentView, LogLine, RootCauseCategory } from "../types.js";

/**
 * A no-LLM baseline: "grep the WARN/ERROR lines for known failure phrases and
 * pick the category with the most hits". It's the floor the agent has to beat
 * by a clear margin to justify its cost, and a check that the dataset can't be
 * won by keyword matching alone.
 */

export const BASELINE_MODEL = "baseline:keywords";

const PATTERNS: Record<RootCauseCategory, RegExp> = {
  dependency_timeout: /timed out|timeout|lock wait|waiting for .*lock|call slow/i,
  resource_exhaustion: /OutOfMemory|OOMKilled|No space left|disk usage|heap usage|at capacity|too many|table is full/i,
  bad_deploy: /deploy|rolling out|started \S+ v\d/i,
  config_error: /config reloaded|ECONNREFUSED|401|secret|credential/i,
  poison_message: /redeliver|parse error|nack|committed offset|unhandled exception processing/i,
  data_integrity: /duplicate key|duplicate entry|does not exist|Unknown column|constraint|migrat/i,
  cascading_failure: /retrying|shedding|load shed|miss ratio|request rate .*x baseline/i,
  external_outage: /returned 50\d|circuit breaker|InternalError|ServiceUnavailable|provider/i,
};

const isAnomaly = (l: LogLine) => l.level === "WARN" || l.level === "ERROR" || l.level === "FATAL";

export function baselineTriage(incident: IncidentView): TriageResult {
  const anomalies = incident.logs.filter(isAnomaly);
  const hits = (Object.entries(PATTERNS) as [RootCauseCategory, RegExp][])
    .map(([cause, re]) => ({ cause, lines: anomalies.filter((l) => re.test(l.msg)) }))
    .filter((h) => h.lines.length > 0)
    .sort((a, b) => b.lines.length - a.lines.length);

  const total = hits.reduce((acc, h) => acc + h.lines.length, 0);
  const hypotheses: Hypothesis[] = hits.slice(0, 3).map((h) => ({
    rootCause: h.cause,
    confidence: Number((h.lines.length / total).toFixed(2)),
    evidenceLines: h.lines.slice(0, 8).map((l) => l.n),
    reasoning: `${h.lines.length} WARN/ERROR lines match ${h.cause} phrases`,
  }));

  return {
    incidentId: incident.id,
    model: BASELINE_MODEL,
    outcome: hypotheses.length ? "submitted" : "no_verdict",
    verdict: hypotheses.length ? { hypotheses, recommendedAction: "n/a (baseline)" } : null,
    trace: [],
    iterations: 0,
    toolCalls: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    durationMs: 0,
    stopReason: null,
  };
}
