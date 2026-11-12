import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  ROOT_CAUSE_CATEGORIES,
  TriageVerdict,
  type IncidentView,
} from "./types.js";
import {
  correlateTrace,
  getContext,
  listServices,
  searchLogs,
} from "./tools.js";

export const DEFAULT_MODEL = process.env.TRIAGE_MODEL ?? "claude-opus-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
const envEffort = process.env.TRIAGE_EFFORT as Effort | undefined;
/** Unset means the model's own default (medium on Opus 5.5). */
export const DEFAULT_EFFORT: Effort | undefined = envEffort && EFFORTS.includes(envEffort) ? envEffort : undefined;

/**
 * Hard limits on one investigation. They keep a confused or looping agent from
 * burning an eval run, and they make cost per incident bounded and comparable
 * across models. When any limit gets close the agent gets one last turn, told
 * to submit its best triage, so a budget hit still yields a scoreable verdict.
 */
export interface Budget {
  /** Model calls (turns) per investigation. */
  maxIterations: number;
  /** Investigation tool calls (submit_triage doesn't count). */
  maxToolCalls: number;
  /** Input (incl. cached) + output tokens across all turns. */
  maxTotalTokens: number;
  /** Wall-clock limit for the investigation. */
  deadlineMs: number;
}

export const DEFAULT_BUDGET: Budget = {
  maxIterations: 20,
  maxToolCalls: 40,
  maxTotalTokens: 600_000,
  deadlineMs: 5 * 60_000,
};

/** Fraction of the token / time budget at which the agent is told to wrap up. */
const WRAP_UP_AT = 0.85;
/** Times we'll prompt an agent that replies with text instead of a tool call. */
const MAX_NUDGES = 2;
/** Tool output cap, so one broad search can't flood the context. */
const MAX_TOOL_OUTPUT_CHARS = 12_000;
/** SDK-level retries (with backoff, honoring retry-after) on 408/409/429/5xx/connection errors. */
export const API_MAX_RETRIES = 4;

/** One investigation step the agent took — the record the eval scores and the UI can replay. */
export interface TraceStep {
  tool: string;
  input: unknown;
  output: string;
  isError?: boolean;
  /** True when this exact call was already made and the earlier result was reused. */
  repeated?: boolean;
}

/**
 * How the investigation ended. Phase 3 counts these per model, since
 * "never answered" is a different failure from "answered wrong".
 */
export type Outcome =
  | "submitted" // a schema-valid verdict was recorded
  | "budget_exhausted" // hit a limit and didn't submit on its final turn
  | "no_verdict" // stopped replying with tool calls despite nudges
  | "refused" // stop_reason "refusal"
  | "api_error"; // the API failed after SDK retries, or rejected the request

export type ApiErrorKind =
  | "billing" // 402: out of credits or another billing problem
  | "auth" // 401 / 403
  | "bad_request" // 400 / 422: something wrong with the request itself
  | "not_found" // 404: e.g. a model id this key can't use
  | "rate_limited"
  | "overloaded"
  | "server"
  | "timeout"
  | "connection"
  | "other";

/**
 * Errors that will fail the same way for every incident, so an eval run should
 * stop instead of working through the rest of the queue.
 */
export const FATAL_API_ERRORS: ReadonlySet<ApiErrorKind> = new Set(["billing", "auth", "bad_request", "not_found"]);

export interface TriageResult {
  incidentId: string;
  model: string;
  outcome: Outcome;
  verdict: TriageVerdict | null;
  trace: TraceStep[];
  iterations: number;
  /** Investigation tool calls made (excludes submit_triage). */
  toolCalls: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  durationMs: number;
  stopReason: string | null;
  /** Set when a budget limit triggered the final "submit now" turn. */
  budgetHit?: keyof Budget;
  apiErrorKind?: ApiErrorKind;
  error?: string;
}

/** The slice of the SDK client the loop uses — lets tests drive it with a scripted fake. */
export type MessagesClient = Pick<Anthropic, "messages">;

export interface TriageOptions {
  model?: string;
  effort?: Effort;
  client?: MessagesClient;
  budget?: Partial<Budget>;
  /** Clock override for tests. */
  now?: () => number;
}

const SYSTEM_PROMPT = `You are an on-call incident triage agent for an event-driven microservice platform.
You are given an alert and a high-level overview of which services logged during the incident window. You do NOT have the raw logs in front of you — you must investigate by calling tools to pull exactly the lines you need.

Your job: find the ROOT CAUSE, not just the loudest symptom. In a cascade, the service that paged (e.g. the gateway returning 5xx) is usually downstream of the real fault. Follow the evidence upstream.

Method:
- Start from the alert. Use list_services to see where errors concentrated and the time window.
- Use search_logs to find the earliest errors/warnings and where they originate. Prefer the EARLIEST anomaly over the most frequent one.
- Use correlate_trace to follow a single request across services when a trace id appears.
- Use get_context to read the lines around a key line.
- Distinguish root cause from downstream symptoms (retry storms, pool/queue saturation, 5xx at the edge) and from red herrings (unrelated slow queries, deploys that predate the onset).

Classify the root cause into exactly one of these categories:
${ROOT_CAUSE_CATEGORIES.map((c) => `- ${c}`).join("\n")}

When you are confident, call submit_triage with hypotheses ranked most-likely first. Each hypothesis MUST cite the specific log line numbers (the #N ids) that support it. Set a calibrated confidence in [0,1] — be honest when the evidence is ambiguous. Keep investigating until you can cite concrete evidence; do not guess before you have looked.`;

// ---- Tool definitions. Arguments are validated with zod at execution time
// (see runTool); bounds here are hints to the model, not strict-mode guarantees. ----

const tools = [
  {
    name: "list_services",
    description:
      "Overview of the incident window: each service's line count, error count, and time range. Call this first.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "search_logs",
    description:
      "Search log lines. Combine filters: query (case-insensitive substring of the message), service, level (returns that level and above: DEBUG<INFO<WARN<ERROR<FATAL), traceId. Output is capped by limit (default 25).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        service: { type: "string" },
        level: { type: "string", enum: ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] },
        traceId: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_context",
    description: "Return the log lines immediately before and after a given line number (the #N id).",
    input_schema: {
      type: "object",
      properties: {
        line: { type: "integer", minimum: 1 },
        before: { type: "integer", minimum: 0, maximum: 50 },
        after: { type: "integer", minimum: 0, maximum: 50 },
      },
      required: ["line"],
      additionalProperties: false,
    },
  },
  {
    name: "correlate_trace",
    description: "Return every log line sharing a trace id, across all services, in order — follows one request's path.",
    input_schema: {
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_triage",
    description:
      "Submit your final triage. Call this once, when you can back your top hypothesis with cited evidence. Ends the investigation.",
    input_schema: {
      type: "object",
      properties: {
        hypotheses: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              rootCause: { type: "string", enum: [...ROOT_CAUSE_CATEGORIES] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              evidenceLines: { type: "array", items: { type: "integer", minimum: 1 } },
              reasoning: { type: "string" },
            },
            required: ["rootCause", "confidence", "evidenceLines", "reasoning"],
            additionalProperties: false,
          },
        },
        recommendedAction: { type: "string" },
      },
      required: ["hypotheses", "recommendedAction"],
      additionalProperties: false,
    },
  },
] satisfies Anthropic.Tool[];

// ---- Argument validation (the model can send malformed or partial input) ----

const SearchArgsSchema = z.object({
  query: z.string().optional(),
  service: z.string().optional(),
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]).optional(),
  traceId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
const ContextArgsSchema = z.object({
  line: z.number().int().min(1),
  before: z.number().int().min(0).max(50).optional(),
  after: z.number().int().min(0).max(50).optional(),
});
const TraceArgsSchema = z.object({ traceId: z.string() });

const SUBMIT = "submit_triage";

/**
 * Run the triage agent against one incident view. Pure w.r.t. the incident:
 * the loop never sees the ground-truth label (the caller passes an IncidentView).
 *
 * Never throws for API or model failures — every way an investigation can end
 * is reported in `outcome`, so an eval run over many incidents keeps going.
 */
export async function triage(incident: IncidentView, opts: TriageOptions = {}): Promise<TriageResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const effort = opts.effort ?? DEFAULT_EFFORT;
  const client = opts.client ?? new Anthropic({ maxRetries: API_MAX_RETRIES });
  const budget: Budget = { ...DEFAULT_BUDGET, ...opts.budget };
  const now = opts.now ?? Date.now;
  const started = now();
  const logs = incident.logs;

  const result: TriageResult = {
    incidentId: incident.id,
    model,
    outcome: "no_verdict",
    verdict: null,
    trace: [],
    iterations: 0,
    toolCalls: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    durationMs: 0,
    stopReason: null,
  };

  // Append-only: earlier turns are never edited or dropped. That keeps the
  // prompt-cache prefix stable and replays thinking blocks exactly as returned.
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `INCIDENT ${incident.id}: ${incident.title}

ALERT:
${incident.alert}

SERVICES INVOLVED: ${incident.services.join(", ")}

SERVICE OVERVIEW:
${listServices(logs)}

Investigate with the tools, then call submit_triage. The raw logs are only available through the tools.`,
    },
  ];

  const seen = new Map<string, string>(); // repeated-call cache: call key -> output
  let finalTurn = false; // the agent has been told to submit now
  let nudges = 0;

  const totalTokens = () =>
    result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens + result.usage.outputTokens;

  /** Which limit, if any, is close enough that the next turn must be the last. */
  const limitReached = (): keyof Budget | undefined => {
    if (result.iterations >= budget.maxIterations - 1) return "maxIterations";
    if (result.toolCalls >= budget.maxToolCalls) return "maxToolCalls";
    if (totalTokens() >= budget.maxTotalTokens * WRAP_UP_AT) return "maxTotalTokens";
    if (now() - started >= budget.deadlineMs * WRAP_UP_AT) return "deadlineMs";
    return undefined;
  };

  try {
    while (!result.verdict) {
      if (result.iterations >= budget.maxIterations || now() - started >= budget.deadlineMs) {
        result.budgetHit ??= result.iterations >= budget.maxIterations ? "maxIterations" : "deadlineMs";
        result.outcome = "budget_exhausted";
        break;
      }
      result.iterations += 1;

      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        // Auto-cache the growing prefix: each turn re-sends everything before it.
        cache_control: { type: "ephemeral" },
        ...(effort ? { output_config: { effort } } : {}),
      });

      result.usage.inputTokens += response.usage.input_tokens;
      result.usage.outputTokens += response.usage.output_tokens;
      result.usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      result.usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
      result.stopReason = response.stop_reason;

      if (response.stop_reason === "refusal") {
        result.outcome = "refused";
        result.error = `model refused${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`;
        break;
      }

      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue; // resume the same turn

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (toolUses.length === 0) {
        if (finalTurn) {
          result.outcome = "budget_exhausted";
          break;
        }
        if (response.stop_reason !== "max_tokens" && ++nudges > MAX_NUDGES) {
          result.outcome = "no_verdict";
          break;
        }
        messages.push({
          role: "user",
          content:
            response.stop_reason === "max_tokens"
              ? "Your reply hit the output limit. Be brief: make one tool call, or call submit_triage."
              : "Continue the investigation with a tool call, or call submit_triage with your verdict. Don't answer in plain text.",
        });
        continue;
      }

      // Parallel tool calls: answer every tool_use, in order, in ONE user message.
      const lastBlock = response.content[response.content.length - 1];
      const content: Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam> = [];
      for (const use of toolUses) {
        const { output, isError } = dispatch(use, {
          truncated: response.stop_reason === "max_tokens" && use === lastBlock,
          finalTurn,
          budgetLeft: result.toolCalls < budget.maxToolCalls,
          logs,
          seen,
          result,
        });
        content.push({ type: "tool_result", tool_use_id: use.id, content: output, ...(isError ? { is_error: true } : {}) });
      }

      if (result.verdict) break;
      if (finalTurn) {
        // The agent was told to submit and didn't (or submitted something invalid).
        result.outcome = "budget_exhausted";
        break;
      }

      const hit = limitReached();
      if (hit) {
        finalTurn = true;
        result.budgetHit = hit;
        content.push({
          type: "text",
          text: `Investigation budget reached (${hit}). This is your last turn: call submit_triage now with your best-supported hypotheses, citing the evidence you've already found, and lower your confidence to reflect what you couldn't check.`,
        });
      }
      messages.push({ role: "user", content });
    }
  } catch (err) {
    result.outcome = "api_error";
    result.apiErrorKind = classifyApiError(err);
    result.error = err instanceof Anthropic.APIError ? `API error ${err.status ?? ""} (${result.apiErrorKind}): ${err.message}` : String(err);
  }

  if (result.verdict) result.outcome = "submitted";
  result.durationMs = now() - started;
  if (result.outcome !== "submitted" && !result.error) {
    result.error =
      result.outcome === "budget_exhausted"
        ? `budget exhausted (${result.budgetHit}) without a valid triage`
        : "agent stopped without submitting a triage";
  }
  return result;
}

/**
 * Failures the SDK has already retried (with backoff) or that retrying can't
 * fix. The kind lets an eval run tell "rate limited, rerun later" from "bug".
 */
export function classifyApiError(err: unknown): ApiErrorKind {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.APIConnectionError) return "connection";
  if (!(err instanceof Anthropic.APIError)) return "other";
  // Prefer the API's error type; fall back to the status code.
  if (err.type === "billing_error" || err.status === 402) return "billing";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "auth";
  if (err instanceof Anthropic.NotFoundError) return "not_found";
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.UnprocessableEntityError) return "bad_request";
  if (err.type === "overloaded_error" || err.status === 529) return "overloaded";
  if ((err.status ?? 0) >= 500) return "server";
  return "other";
}

interface DispatchCtx {
  /** This call was the block cut off by max_tokens — its input may be incomplete. */
  truncated: boolean;
  finalTurn: boolean;
  budgetLeft: boolean;
  logs: IncidentView["logs"];
  seen: Map<string, string>;
  result: TriageResult;
}

/** Decide what to do with one tool call, run it if allowed, and record it in the trace. */
function dispatch(use: Anthropic.ToolUseBlock, ctx: DispatchCtx): { output: string; isError: boolean } {
  const record = (output: string, isError: boolean, repeated = false) => {
    ctx.result.trace.push({ tool: use.name, input: use.input, output, ...(isError ? { isError } : {}), ...(repeated ? { repeated } : {}) });
    return { output, isError };
  };

  if (ctx.truncated) {
    return record("This call was cut off by the output limit before its input was complete, so it was not run. Re-issue it.", true);
  }
  if (ctx.result.verdict) {
    return record("A triage was already submitted in this turn; this call was not run.", true);
  }
  if (use.name !== SUBMIT) {
    if (ctx.finalTurn || !ctx.budgetLeft) {
      return record("Investigation budget exhausted; only submit_triage is accepted now.", true);
    }
    ctx.result.toolCalls += 1;
    const key = `${use.name}:${stableJson(use.input)}`;
    const earlier = ctx.seen.get(key);
    if (earlier !== undefined) {
      return record(`(You already made this exact call; same result as before.)\n${earlier}`, false, true);
    }
    const { output, isError } = runTool(use, ctx.logs, ctx.result);
    if (!isError) ctx.seen.set(key, output);
    return record(output, isError);
  }
  const { output, isError } = runTool(use, ctx.logs, ctx.result);
  return record(output, isError);
}

/** Execute one tool call. Returns the tool_result content. */
function runTool(
  use: Anthropic.ToolUseBlock,
  logs: IncidentView["logs"],
  result: TriageResult,
): { output: string; isError: boolean } {
  try {
    switch (use.name) {
      case "list_services":
        return ok(listServices(logs));
      case "search_logs":
        return ok(searchLogs(logs, parseArgs(SearchArgsSchema, use.input)));
      case "get_context": {
        const a = parseArgs(ContextArgsSchema, use.input);
        return ok(getContext(logs, a.line, a.before, a.after));
      }
      case "correlate_trace":
        return ok(correlateTrace(logs, parseArgs(TraceArgsSchema, use.input).traceId));
      case SUBMIT: {
        const parsed = TriageVerdict.safeParse(use.input);
        if (!parsed.success) {
          return { output: `invalid triage: ${formatIssues(parsed.error)}. Fix it and call submit_triage again.`, isError: true };
        }
        const problems = checkEvidence(parsed.data, logs.length);
        if (problems) return { output: `invalid triage: ${problems}. Fix it and call submit_triage again.`, isError: true };
        result.verdict = parsed.data;
        return ok("triage recorded");
      }
      default:
        return { output: `unknown tool: ${use.name}`, isError: true };
    }
  } catch (err) {
    return { output: `tool error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

/** Cited lines must exist, and the top hypothesis must cite something. */
function checkEvidence(verdict: TriageVerdict, lineCount: number): string | null {
  const missing = [...new Set(verdict.hypotheses.flatMap((h) => h.evidenceLines))].filter((n) => n > lineCount);
  if (missing.length) {
    return `evidenceLines cite lines that don't exist: ${missing.map((n) => `#${n}`).join(", ")} (the log has ${lineCount} lines)`;
  }
  if (verdict.hypotheses[0].evidenceLines.length === 0) {
    return "the top hypothesis cites no evidenceLines";
  }
  return null;
}

function ok(output: string): { output: string; isError: false } {
  if (output.length > MAX_TOOL_OUTPUT_CHARS) {
    output = `${output.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n[output truncated at ${MAX_TOOL_OUTPUT_CHARS} chars — narrow the query or lower the limit]`;
  }
  return { output, isError: false };
}

function parseArgs<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`invalid arguments: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((e) => `${e.path.join(".") || "(input)"}: ${e.message}`).join("; ");
}

/** JSON with sorted keys, so {a,b} and {b,a} count as the same call. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
