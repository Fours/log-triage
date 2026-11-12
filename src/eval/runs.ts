import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TriageResult } from "../agent.js";
import { loadDataset } from "./runner.js";
import type { RunConfig } from "./report.js";
import type { IncidentScore } from "./score.js";

/** Read a finished run's saved scores (API-error records count as pending, as in the runner). */
export function loadRunScores(runDir: string, config: RunConfig, root = resolve(runDir, "../../..")) {
  const { incidents } = loadDataset(resolve(root, config.dataset.dir));
  const scores: IncidentScore[] = [];
  const pending: string[] = [];
  for (const inc of incidents) {
    const path = resolve(runDir, "incidents", `${inc.id}.json`);
    const rec = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as { score: IncidentScore; result: TriageResult }) : null;
    if (rec && rec.result.outcome !== "api_error") scores.push(rec.score);
    else pending.push(inc.id);
  }
  return { scores, pending };
}

export function loadRun(resultsDir: string, runId: string) {
  const runDir = resolve(resultsDir, "runs", runId);
  const configPath = resolve(runDir, "config.json");
  if (!existsSync(configPath)) throw new Error(`No run ${runId} in ${resolve(resultsDir, "runs")}.`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as RunConfig;
  return { config, ...loadRunScores(runDir, config, resolve(resultsDir, "..")) };
}
