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
const MAX_ITERATIONS = 20;

/** One investigation step the agent took — the record the eval scores and the UI can replay. */
export interface TraceStep {
  tool: string;
  input: unknown;
  output: string;
}

export interface TriageResult {
  incidentId: string;
  model: string;
  verdict: TriageVerdict | null;
  trace: TraceStep[];
  iterations: number;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string | null;
  error?: string;
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

// ---- Tool definitions (JSON Schema, strict so arguments validate) ----

const tools = [
  {
    name: "list_services",
    description:
      "Overview of the incident window: each service's line count, error count, and time range. Call this first.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "search_logs",
    description:
      "Search log lines. Combine filters: query (case-insensitive substring of the message), service, level (returns that level and above: DEBUG<INFO<WARN<ERROR<FATAL), traceId. Output is capped by limit (default 25).",
    strict: true,
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
    strict: true,
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
    strict: true,
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
    strict: true,
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

// ---- Argument validation (the SDK can hand back partial/escaped input) ----

const SearchArgsSchema = z.object({
  query: z.string().optional(),
  service: z.string().optional(),
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]).optional(),
  traceId: z.string().optional(),
  limit: z.number().int().optional(),
});
const ContextArgsSchema = z.object({
  line: z.number().int(),
  before: z.number().int().optional(),
  after: z.number().int().optional(),
});
const TraceArgsSchema = z.object({ traceId: z.string() });

/**
 * Run the triage agent against one incident view. Pure w.r.t. the incident:
 * the loop never sees the ground-truth label (the caller passes an IncidentView).
 */
export async function triage(
  incident: IncidentView,
  opts: { model?: string; client?: Anthropic } = {},
): Promise<TriageResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const client = opts.client ?? new Anthropic();
  const logs = incident.logs;

  const result: TriageResult = {
    incidentId: incident.id,
    model,
    verdict: null,
    trace: [],
    iterations: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    stopReason: null,
  };

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

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      result.iterations = i + 1;

      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      result.usage.inputTokens += response.usage.input_tokens;
      result.usage.outputTokens += response.usage.output_tokens;
      result.stopReason = response.stop_reason;

      if (response.stop_reason === "refusal") {
        result.error = "model refused";
        break;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUses.length === 0) {
        // No tool call and not done via submit_triage — nudge once, then stop.
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let submitted = false;

      for (const use of toolUses) {
        const { content, isError } = runTool(use, logs, result);
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content,
          ...(isError ? { is_error: true } : {}),
        });
        if (use.name === "submit_triage" && !isError) submitted = true;
      }

      messages.push({ role: "user", content: toolResults });
      if (submitted) break;
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      result.error = `API error ${err.status}: ${err.message}`;
    } else {
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  if (!result.verdict && !result.error) {
    result.error = "agent ended without submitting a triage";
  }
  return result;
}

/** Execute one tool call and record it in the trace. Returns the tool_result content. */
function runTool(
  use: Anthropic.ToolUseBlock,
  logs: IncidentView["logs"],
  result: TriageResult,
): { content: string; isError: boolean } {
  let content: string;
  let isError = false;

  try {
    switch (use.name) {
      case "list_services":
        content = listServices(logs);
        break;
      case "search_logs":
        content = searchLogs(logs, SearchArgsSchema.parse(use.input));
        break;
      case "get_context": {
        const a = ContextArgsSchema.parse(use.input);
        content = getContext(logs, a.line, a.before, a.after);
        break;
      }
      case "correlate_trace":
        content = correlateTrace(logs, TraceArgsSchema.parse(use.input).traceId);
        break;
      case "submit_triage": {
        const parsed = TriageVerdict.safeParse(use.input);
        if (!parsed.success) {
          content = `invalid triage: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`;
          isError = true;
        } else {
          result.verdict = parsed.data;
          content = "triage recorded";
        }
        break;
      }
      default:
        content = `unknown tool: ${use.name}`;
        isError = true;
    }
  } catch (err) {
    content = `tool error: ${err instanceof Error ? err.message : String(err)}`;
    isError = true;
  }

  result.trace.push({ tool: use.name, input: use.input, output: content });
  return { content, isError };
}
