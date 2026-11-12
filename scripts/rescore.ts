import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRunReport, type RunConfig } from "../src/eval/report.js";
import { writeLeaderboard } from "../src/eval/runner.js";
import { summarize } from "../src/eval/score.js";
import { loadRunScores } from "../src/eval/runs.js";

/**
 * Rebuild every run's summary.json and report.md (and the leaderboard) from
 * the per-incident scores already on disk. No API calls: use it after changing
 * how results are summarized or rendered.
 *
 *   npm run rescore
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resultsDir = resolve(root, "results");
const runsDir = resolve(resultsDir, "runs");

for (const runId of readdirSync(runsDir).sort()) {
  const configPath = resolve(runsDir, runId, "config.json");
  if (!existsSync(configPath)) continue;
  const config = JSON.parse(readFileSync(configPath, "utf8")) as RunConfig;
  const { scores, pending } = loadRunScores(resolve(runsDir, runId), config);
  const summary = summarize(scores);
  writeFileSync(resolve(runsDir, runId, "summary.json"), JSON.stringify({ ...summary, complete: pending.length === 0, pending }, null, 2) + "\n");
  writeFileSync(resolve(runsDir, runId, "report.md"), renderRunReport(config, summary, scores, pending));
  console.log(`${runId}: ${scores.length} scored${pending.length ? `, ${pending.length} pending` : ""}`);
}
writeLeaderboard(resultsDir);
console.log("Rewrote results/README.md");
