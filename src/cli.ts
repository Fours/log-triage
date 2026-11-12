import "./env.js"; // load .env before the Anthropic client resolves credentials
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadIncident } from "./tools.js";
import { triage, DEFAULT_EFFORT, DEFAULT_MODEL } from "./agent.js";
import { toIncidentView } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INCIDENT = resolve(here, "../incidents/sample-001-payment-timeout.json");

async function main() {
  const path = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_INCIDENT;
  const incident = loadIncident(path);

  console.log(`\n=== Triaging ${incident.id} on ${DEFAULT_MODEL}${DEFAULT_EFFORT ? ` (effort ${DEFAULT_EFFORT})` : ""} ===`);
  console.log(`Alert: ${incident.alert}\n`);

  const result = await triage(toIncidentView(incident));

  console.log("--- Investigation trace ---");
  for (const step of result.trace) {
    const input = step.tool === "list_services" ? "" : ` ${JSON.stringify(step.input)}`;
    const flags = [step.isError ? "error" : "", step.repeated ? "repeat" : ""].filter(Boolean).join(", ");
    console.log(`\n[${step.tool}]${input}${flags ? `  (${flags})` : ""}`);
    console.log(step.output.split("\n").map((l) => `  ${l}`).join("\n"));
  }

  console.log("\n--- Verdict ---");
  if (result.verdict) {
    result.verdict.hypotheses.forEach((h, i) => {
      console.log(
        `${i + 1}. ${h.rootCause}  (confidence ${h.confidence.toFixed(2)})  evidence: ${h.evidenceLines.map((n) => `#${n}`).join(", ")}`,
      );
      console.log(`   ${h.reasoning}`);
    });
    console.log(`\nRecommended action: ${result.verdict.recommendedAction}`);
  } else {
    console.log(`No verdict (${result.outcome}). ${result.error ?? ""}`);
  }

  const u = result.usage;
  console.log(
    `\n--- Run: ${result.outcome}${result.budgetHit ? ` (budget: ${result.budgetHit})` : ""} · ${result.iterations} turn(s), ${result.toolCalls} tool call(s) · ` +
      `${u.inputTokens} in + ${u.cacheReadTokens} cache-read + ${u.cacheWriteTokens} cache-write / ${u.outputTokens} out tokens · ` +
      `${(result.durationMs / 1000).toFixed(1)}s · stop=${result.stopReason} ---`,
  );

  // Compare against ground truth for a quick read (the eval harness formalizes this in Phase 3).
  const top = result.verdict?.hypotheses[0]?.rootCause;
  const { rootCause, acceptableCauses } = incident.label;
  const outcome =
    top === rootCause ? "✓ MATCH" : top && acceptableCauses.includes(top) ? "~ acceptable (defensible alternative)" : "✗ miss";
  const alt = acceptableCauses.length ? ` (also acceptable: ${acceptableCauses.join(", ")})` : "";
  console.log(`\n[ground truth] rootCause=${rootCause}${alt}  ->  agent top-1=${top ?? "none"}  ${outcome}`);

  process.exit(result.verdict ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
