import "../src/env.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_EFFORT, DEFAULT_MODEL, type Effort } from "../src/agent.js";
import { runEval } from "../src/eval/runner.js";

/**
 * Run the agent over the labeled dataset and score it. See src/eval/runner.ts
 * for what a run writes.
 *
 *   npm run eval -- --baseline                       # free keyword baseline
 *   npm run eval -- --model claude-haiku-5-5 --limit 5
 *   npm run eval -- --effort high --concurrency 6
 *   npm run eval -- --run-id <id> --resume           # continue an interrupted run
 *
 * Exits 1 if the run is incomplete (stopped early or some incidents failed).
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    baseline: { type: "boolean", default: false },
    dataset: { type: "string", default: "incidents/generated" },
    ids: { type: "string" },
    difficulty: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "run-id": { type: "string" },
    resume: { type: "boolean", default: false },
  },
});

try {
  const outcome = await runEval({
    root,
    resultsDir: resolve(root, "results"),
    datasetDir: resolve(root, args.dataset!),
    model: args.model ?? DEFAULT_MODEL,
    effort: (args.effort as Effort | undefined) ?? DEFAULT_EFFORT ?? null,
    baseline: args.baseline,
    ids: args.ids?.split(","),
    difficulty: args.difficulty,
    limit: args.limit ? Number(args.limit) : undefined,
    concurrency: Math.max(1, Number(args.concurrency)),
    runId: args["run-id"],
    resume: args.resume,
  });
  process.exit(outcome.complete ? 0 : 1);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
