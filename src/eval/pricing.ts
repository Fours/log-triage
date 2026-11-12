/**
 * USD per million tokens, Claude API first-party rates as of 2026-11.
 * Cache writes use the 5-minute TTL rate (1.25 × input), which is what the
 * agent's top-level `cache_control: { type: "ephemeral" }` gets.
 * Cache reads are the published rate where known (Opus 5.5, Sonnet 5.5) and
 * 0.1 × input otherwise.
 * Check https://platform.claude.com/docs/en/about-claude/pricing before relying on these.
 */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const price = (input: number, output: number, cacheRead: number): Price => ({
  input,
  output,
  cacheRead,
  cacheWrite: input * 1.25,
});

export const PRICING: Record<string, Price> = {
  "claude-fable-5-2": price(8, 40, 0.2),
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-opus-5": price(5, 25, 0.5),
  "claude-sonnet-5-5": price(2, 10, 0.1),
  "claude-sonnet-5": price(2, 10, 0.2),
  // Haiku 5.5 rates are for prompts up to 100K tokens, which covers every turn here.
  "claude-haiku-5-5": price(0.1, 0.5, 0.01),
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Cost of one run in USD, or null if the model isn't in the table (or isn't an LLM). */
export function costUsd(model: string, u: Usage): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) / 1e6;
}
