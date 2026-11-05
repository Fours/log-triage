import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadIncident } from "./tools.js";
import { triage, DEFAULT_MODEL } from "./agent.js";
import { toIncidentView } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INCIDENT = resolve(here, "../incidents/sample-001-payment-timeout.json");

async function main() {
  const path = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_INCIDENT;
  const incident = loadIncident(path);

  console.log(`\n=== Triaging ${incident.id} on ${DEFAULT_MODEL} ===`);
  console.log(`Alert: ${incident.alert}\n`);

  const result = await triage(toIncidentView(incident));

  console.log("--- Investigation trace ---");
  for (const step of result.trace) {
    const input = step.tool === "list_services" ? "" : ` ${JSON.stringify(step.input)}`;
    console.log(`\n[${step.tool}]${input}`);
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
    console.log(`No verdict. ${result.error ?? ""}`);
  }

  console.log(
    `\n--- Run: ${result.iterations} iteration(s), ${result.trace.length} tool call(s), ` +
      `${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens, stop=${result.stopReason} ---`,
  );

  // Compare against ground truth for a quick read (the eval harness formalizes this in Phase 3).
  const top = result.verdict?.hypotheses[0]?.rootCause;
  console.log(
    `\n[ground truth] rootCause=${incident.label.rootCause}  ->  agent top-1=${top ?? "none"}  ${top === incident.label.rootCause ? "✓ MATCH" : "✗ miss"}`,
  );

  process.exit(result.verdict ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
