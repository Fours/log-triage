import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRun } from "../src/eval/runs.js";
import { pairedDiff } from "../src/eval/stats.js";

/**
 * Paired comparison of two runs on the same incidents: the mean per-incident
 * difference (B − A) with a 95% bootstrap interval. No API calls.
 *
 *   npm run compare -- <runA> <runB>
 */

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("Usage: npm run compare -- <runA> <runB>   (run ids from results/runs/)");
  process.exit(1);
}

const resultsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../results");
const A = loadRun(resultsDir, a);
const B = loadRun(resultsDir, b);
if (A.config.dataset.dir !== B.config.dataset.dir) {
  console.error(`Different datasets (${A.config.dataset.dir} vs ${B.config.dataset.dir}); a paired comparison needs the same incidents.`);
  process.exit(1);
}

const fmt: Record<string, (x: number) => string> = {
  costUsd: (x) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(4)}`,
  seconds: (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}s`,
};
const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)} pts`;

console.log(`B − A, paired over shared incidents\n  A = ${a}\n  B = ${b}\n`);
for (const d of pairedDiff(A.scores, B.scores)) {
  const f = fmt[d.metric] ?? pts;
  console.log(`${d.metric.padEnd(18)} ${f(d.diff).padStart(13)}   95% [${f(d.ci[0])}, ${f(d.ci[1])}]${d.significant ? "   ← interval excludes 0" : ""}`);
}
