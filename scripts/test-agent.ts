import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import Anthropic from "@anthropic-ai/sdk";
import { triage, type MessagesClient, type TriageResult } from "../src/agent.js";
import { loadIncident } from "../src/tools.js";
import { toIncidentView } from "../src/types.js";

/**
 * Drives the agent loop with a scripted fake client: no API key, no network,
 * deterministic. Each test scripts what "the model" says turn by turn and
 * checks what the loop sends back. Run: npm run test:agent
 */

const here = dirname(fileURLToPath(import.meta.url));
const incident = loadIncident(resolve(here, "../incidents/generated/gen-023.json"));
const view = toIncidentView(incident);
const N = view.logs.length;

// ---- Scripted fake model ----------------------------------------------------

type Block = Anthropic.ContentBlock;
type Turn = { content: Block[]; stop?: Anthropic.StopReason; usage?: Partial<Anthropic.Usage> } | Error;

let ids = 0;
const tool = (name: string, input: Record<string, unknown> = {}): Anthropic.ToolUseBlock =>
  ({ type: "tool_use", id: `toolu_${++ids}`, name, input, caller: { type: "direct" } }) as unknown as Anthropic.ToolUseBlock;
const text = (t: string): Anthropic.TextBlock => ({ type: "text", text: t, citations: null }) as Anthropic.TextBlock;
const thinking = (): Block => ({ type: "thinking", thinking: "", signature: "sig-abc" }) as unknown as Block;

const verdict = (evidence = [1, 2], rootCause = "config_error") => ({
  hypotheses: [{ rootCause, confidence: 0.8, evidenceLines: evidence, reasoning: "because" }],
  recommendedAction: "roll back",
});
const submit = (evidence?: number[]) => tool("submit_triage", verdict(evidence));

interface Fake {
  client: MessagesClient;
  /** Snapshot of each request's params at call time. */
  requests: Anthropic.MessageCreateParamsNonStreaming[];
}

function fakeClient(script: Turn[]): Fake {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create = async (params: Anthropic.MessageCreateParamsNonStreaming) => {
    requests.push(structuredClone(params));
    const turn = script.shift();
    if (!turn) throw new Error("fake model: script exhausted");
    if (turn instanceof Error) throw turn;
    const stop = turn.stop ?? (turn.content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
    return {
      id: `msg_${requests.length}`,
      type: "message",
      role: "assistant",
      model: params.model,
      content: turn.content,
      stop_reason: stop,
      stop_sequence: null,
      stop_details: stop === "refusal" ? { type: "refusal", category: "cyber", explanation: null } : null,
      usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...turn.usage },
    } as unknown as Anthropic.Message;
  };
  return { client: { messages: { create } } as unknown as MessagesClient, requests };
}

/** Tool results the loop sent back on request `i` (the last user message). */
function sentBack(fake: Fake, i: number) {
  const last = fake.requests[i].messages.at(-1)!;
  assert.equal(last.role, "user");
  return last.content as Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam>;
}
const results = (blocks: ReturnType<typeof sentBack>) => blocks.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result");
const texts = (blocks: ReturnType<typeof sentBack>) => blocks.filter((b): b is Anthropic.TextBlockParam => b.type === "text");

async function run(script: Turn[], opts: Parameters<typeof triage>[1] = {}): Promise<{ r: TriageResult; fake: Fake }> {
  const fake = fakeClient(script);
  const r = await triage(view, { client: fake.client, ...opts });
  return { r, fake };
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---- Tests -------------------------------------------------------------------

console.log(`Agent loop against a scripted model (incident ${view.id}, ${N} lines)`);

await check("parallel tool calls: every call answered, in order, in one user message", async () => {
  const a = tool("search_logs", { level: "ERROR", limit: 5 });
  const b = tool("get_context", { line: 10, before: 1, after: 1 });
  const c = tool("list_services");
  const { r, fake } = await run([{ content: [text("looking"), a, b, c] }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  const back = results(sentBack(fake, 1));
  assert.deepEqual(back.map((x) => x.tool_use_id), [a.id, b.id, c.id]);
  assert.ok(back.every((x) => !x.is_error));
  assert.equal(r.toolCalls, 3);
});

await check("submit alongside other calls: all answered, verdict recorded, loop ends", async () => {
  const { r, fake } = await run([{ content: [tool("list_services"), submit()] }]);
  assert.equal(r.outcome, "submitted");
  assert.equal(fake.requests.length, 1);
  assert.equal(r.trace.length, 2);
});

await check("a second submit in the same turn is answered but ignored", async () => {
  const { r } = await run([{ content: [submit([1]), tool("submit_triage", verdict([2], "bad_deploy"))] }]);
  assert.equal(r.verdict?.hypotheses[0].rootCause, "config_error");
  assert.ok(r.trace[1].isError);
});

await check("invalid triage (schema or nonexistent lines) is rejected with a fixable error", async () => {
  const badSchema = tool("submit_triage", { hypotheses: [{ rootCause: "gremlins", confidence: 2 }] });
  const badLines = submit([1, N + 5]);
  const noEvidence = submit([]);
  const { r, fake } = await run([{ content: [badSchema] }, { content: [badLines] }, { content: [noEvidence] }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  const [e1] = results(sentBack(fake, 1));
  const [e2] = results(sentBack(fake, 2));
  const [e3] = results(sentBack(fake, 3));
  assert.ok(e1.is_error && String(e1.content).includes("rootCause"));
  assert.ok(e2.is_error && String(e2.content).includes(`#${N + 5}`));
  assert.ok(e3.is_error && String(e3.content).includes("cites no evidenceLines"));
});

await check("bad tool arguments come back as an error result, not a crash", async () => {
  const { r, fake } = await run([{ content: [tool("get_context", { line: "ten" }), tool("nope")] }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  const back = results(sentBack(fake, 1));
  assert.ok(back[0].is_error && String(back[0].content).includes("invalid arguments"));
  assert.ok(back[1].is_error && String(back[1].content).includes("unknown tool"));
});

await check("plain-text reply gets nudged, then the agent can still submit", async () => {
  const { r, fake } = await run([{ content: [text("I think it's config.")] }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  const nudge = fake.requests[1].messages.at(-1)!;
  assert.match(String(nudge.content), /submit_triage/);
});

await check("an agent that keeps replying in text ends as no_verdict after the nudge limit", async () => {
  const { r, fake } = await run([{ content: [text("a")] }, { content: [text("b")] }, { content: [text("c")] }]);
  assert.equal(r.outcome, "no_verdict");
  assert.equal(fake.requests.length, 3);
});

await check("tool-call budget: over-budget calls are refused, agent is told to submit, and does", async () => {
  const { r, fake } = await run(
    [{ content: [tool("search_logs", { query: "a" }), tool("search_logs", { query: "b" }), tool("search_logs", { query: "c" })] }, { content: [submit()] }],
    { budget: { maxToolCalls: 2 } },
  );
  assert.equal(r.outcome, "submitted");
  assert.equal(r.budgetHit, "maxToolCalls");
  assert.equal(r.toolCalls, 2);
  const back = sentBack(fake, 1);
  assert.ok(results(back)[2].is_error && String(results(back)[2].content).includes("budget"));
  assert.match(texts(back)[0].text, /last turn/);
  // The notice comes after every tool_result.
  assert.equal(back.at(-1)!.type, "text");
});

await check("iteration budget: final turn is the last request; ignoring it ends as budget_exhausted", async () => {
  const forever = () => ({ content: [tool("search_logs", { query: `q${ids}` })] });
  const { r, fake } = await run([forever(), forever(), forever(), forever(), forever()], { budget: { maxIterations: 3 } });
  assert.equal(r.outcome, "budget_exhausted");
  assert.equal(r.budgetHit, "maxIterations");
  assert.equal(fake.requests.length, 3);
  assert.match(texts(sentBack(fake, 2))[0].text, /last turn/);
  // On the final turn, investigation calls are refused.
  assert.ok(r.trace.at(-1)!.isError);
});

await check("token budget triggers the wrap-up turn", async () => {
  const { r } = await run([{ content: [tool("list_services")], usage: { input_tokens: 9_000 } }, { content: [submit()] }], {
    budget: { maxTotalTokens: 10_000 },
  });
  assert.equal(r.outcome, "submitted");
  assert.equal(r.budgetHit, "maxTotalTokens");
});

await check("deadline triggers the wrap-up turn, and a hard stop past it", async () => {
  let t = 0;
  const now = () => (t += 40_000);
  const { r } = await run(
    [{ content: [tool("list_services")] }, { content: [tool("search_logs", { query: "x" })] }, { content: [submit()] }],
    { now, budget: { deadlineMs: 100_000 } },
  );
  assert.ok(r.budgetHit === "deadlineMs", `budgetHit=${r.budgetHit}`);
  assert.notEqual(r.outcome, "api_error");
});

await check("a tool call cut off by max_tokens is not run and is reported back", async () => {
  const cut = tool("search_logs", { query: "par" });
  const { r, fake } = await run([{ content: [tool("list_services"), cut], stop: "max_tokens" }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  const back = results(sentBack(fake, 1));
  assert.ok(!back[0].is_error);
  assert.ok(back[1].is_error && String(back[1].content).includes("cut off"));
});

await check("max_tokens with no tool call asks for a shorter reply (doesn't use up a nudge)", async () => {
  const { r, fake } = await run([{ content: [text("long…")], stop: "max_tokens" }, { content: [text("x")] }, { content: [text("y")] }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  assert.match(String(fake.requests[1].messages.at(-1)!.content), /output limit/);
});

await check("refusal ends the investigation with outcome refused", async () => {
  const { r, fake } = await run([{ content: [], stop: "refusal" }]);
  assert.equal(r.outcome, "refused");
  assert.match(r.error ?? "", /cyber/);
  assert.equal(fake.requests.length, 1);
});

await check("pause_turn resumes without adding a user message", async () => {
  const { r, fake } = await run([{ content: [text("…")], stop: "pause_turn" }, { content: [submit()] }]);
  assert.equal(r.outcome, "submitted");
  assert.equal(fake.requests[1].messages.at(-1)!.role, "assistant");
});

await check("API errors (after SDK retries) end as api_error with a kind, never a throw", async () => {
  const cases: Array<[Error, string]> = [
    [new Anthropic.RateLimitError(429, {}, "rate limited", new Headers()), "rate_limited"],
    [new Anthropic.InternalServerError(529, {}, "overloaded", new Headers()), "overloaded"],
    [new Anthropic.InternalServerError(500, {}, "boom", new Headers()), "server"],
    [new Anthropic.BadRequestError(400, {}, "bad", new Headers()), "bad_request"],
    [new Anthropic.AuthenticationError(401, {}, "nope", new Headers()), "auth"],
    [new Anthropic.APIConnectionError({ message: "reset" }), "connection"],
  ];
  for (const [err, kind] of cases) {
    const { r } = await run([{ content: [tool("list_services")] }, err]);
    assert.equal(r.outcome, "api_error");
    assert.equal(r.apiErrorKind, kind);
    assert.equal(r.trace.length, 1, "work done before the failure is kept");
  }
});

await check("repeating an identical call reuses the earlier result (key order doesn't matter)", async () => {
  const { r, fake } = await run([
    { content: [tool("search_logs", { level: "WARN", query: "pool" })] },
    { content: [tool("search_logs", { query: "pool", level: "WARN" })] },
    { content: [submit()] },
  ]);
  assert.equal(r.outcome, "submitted");
  assert.ok(r.trace[1].repeated);
  assert.match(String(results(sentBack(fake, 2))[0].content), /already made this exact call/);
});

await check("history is append-only: every request extends the previous one unchanged", async () => {
  const { fake } = await run([
    { content: [thinking(), tool("list_services")] },
    { content: [text("hmm")] },
    { content: [thinking(), tool("search_logs", { query: "x" }), tool("get_context", { line: 3 })] },
    { content: [submit()] },
  ]);
  for (let i = 1; i < fake.requests.length; i++) {
    const prev = fake.requests[i - 1].messages;
    const cur = fake.requests[i].messages;
    assert.ok(cur.length > prev.length);
    assert.deepEqual(cur.slice(0, prev.length), prev, `request ${i} rewrote history`);
  }
  // Thinking blocks are replayed exactly as returned.
  const replayed = fake.requests[1].messages[1].content as Block[];
  assert.deepEqual(replayed[0], thinking());
});

await check("requests carry prompt caching and a stable system prompt + tool list", async () => {
  const { fake } = await run([{ content: [tool("list_services")] }, { content: [submit()] }], { effort: "low" });
  const [a, b] = fake.requests;
  assert.deepEqual(a.cache_control, { type: "ephemeral" });
  assert.equal(a.system, b.system);
  assert.deepEqual(a.tools, b.tools);
  assert.deepEqual(a.output_config, { effort: "low" });
});

await check("the ground-truth label never reaches the model", async () => {
  const { fake } = await run([{ content: [tool("list_services")] }, { content: [submit()] }]);
  const sent = JSON.stringify(fake.requests);
  assert.ok(!sent.includes(incident.label.explanation.slice(0, 60)));
  assert.ok(!sent.includes('"label"'));
});

await check("usage, iterations and duration are accounted", async () => {
  const { r } = await run([{ content: [tool("list_services")], usage: { cache_read_input_tokens: 500 } }, { content: [submit()] }]);
  assert.equal(r.iterations, 2);
  assert.equal(r.usage.inputTokens, 2000);
  assert.equal(r.usage.outputTokens, 200);
  assert.equal(r.usage.cacheReadTokens, 500);
  assert.ok(r.durationMs >= 0);
});

console.log(`\n${passed} checks passed.`);
