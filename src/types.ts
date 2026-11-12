import { z } from "zod";

/**
 * The schema is the single source of truth. The Phase 1 incident generator
 * writes JSON that must pass `IncidentSchema`, and the Phase 3 eval scorer
 * reads the same `label` block. TS types are derived with `z.infer` so the
 * code and the data can never drift apart.
 */

/** The closed set of root causes the agent classifies into and the eval scores against. */
export const ROOT_CAUSE_CATEGORIES = [
  "dependency_timeout", // a downstream call hangs / times out
  "resource_exhaustion", // OOM, thread/connection pool, disk, file handles
  "bad_deploy", // a release introduced the fault (new version, bad config rollout)
  "config_error", // misconfiguration: wrong endpoint, missing env var, bad credential
  "poison_message", // a malformed/looping message jams a queue consumer
  "data_integrity", // bad/corrupt data, failed migration, constraint violation
  "cascading_failure", // failure of one component overwhelms others (retry storms, backpressure)
  "external_outage", // a third party / cloud dependency is down
] as const;

export const RootCauseCategory = z.enum(ROOT_CAUSE_CATEGORIES);
export type RootCauseCategory = z.infer<typeof RootCauseCategory>;

export const LogLevel = z.enum(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]);
export type LogLevel = z.infer<typeof LogLevel>;

/** One parsed log line. `n` is a stable 1-indexed id the agent cites as evidence. */
export const LogLine = z.object({
  n: z.number().int().positive(),
  ts: z.string(), // ISO-8601 timestamp
  service: z.string(),
  level: LogLevel,
  traceId: z.string().optional(),
  msg: z.string(),
});
export type LogLine = z.infer<typeof LogLine>;

/** Ground truth. Read only by the eval scorer — never shown to the agent. */
export const IncidentLabel = z.object({
  rootCause: RootCauseCategory,
  /** The log line numbers that actually explain the root cause. */
  evidenceLines: z.array(z.number().int().positive()),
  explanation: z.string(),
  /** Optional difficulty tag so the eval can slice easy vs. adversarial cases. */
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  /**
   * Other categories a careful engineer could defend for an ambiguous or
   * multi-cause incident (e.g. a config error that shipped inside a deploy).
   * `rootCause` stays the single best answer; the scorer can give partial
   * credit for these. Empty for unambiguous incidents.
   */
  acceptableCauses: z.array(RootCauseCategory).default([]),
  /** Generator scenario key (e.g. "dependency_timeout/db-lock-wait"), for slicing results. */
  scenario: z.string().optional(),
});
export type IncidentLabel = z.infer<typeof IncidentLabel>;

export const Incident = z.object({
  id: z.string(),
  title: z.string(),
  /** The alert/symptom that paged someone — the agent's starting point. */
  alert: z.string(),
  services: z.array(z.string()),
  logs: z.array(LogLine),
  label: IncidentLabel,
});
export type Incident = z.infer<typeof Incident>;

/** One ranked hypothesis the agent produces. */
export const Hypothesis = z.object({
  rootCause: RootCauseCategory,
  confidence: z.number().min(0).max(1),
  evidenceLines: z.array(z.number().int().positive()),
  reasoning: z.string(),
});
export type Hypothesis = z.infer<typeof Hypothesis>;

/** The agent's final verdict, submitted via the terminal `submit_triage` tool. */
export const TriageVerdict = z.object({
  /** Hypotheses ranked most-likely first. */
  hypotheses: z.array(Hypothesis).min(1),
  recommendedAction: z.string(),
});
export type TriageVerdict = z.infer<typeof TriageVerdict>;

/** What the agent is allowed to see: the incident minus the ground-truth label. */
export type IncidentView = Omit<Incident, "label">;

export function toIncidentView(incident: Incident): IncidentView {
  const { label: _label, ...view } = incident;
  return view;
}
