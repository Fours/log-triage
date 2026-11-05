import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { strict as assert } from "node:assert";
import { loadIncident, listServices, searchLogs, getContext, correlateTrace } from "../src/tools.js";

/**
 * Exercises the deterministic log layer with no API key. This is the layer the
 * agent reasons over and the eval harness reuses, so it is worth pinning down
 * on its own. Run: npm run test:tools
 */

const here = dirname(fileURLToPath(import.meta.url));
const incident = loadIncident(resolve(here, "../incidents/sample-001-payment-timeout.json"));

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log(`Loaded incident ${incident.id}: ${incident.logs.length} lines, ${incident.services.length} services`);

check("loadIncident validates against the schema", () => {
  assert.equal(incident.id, "sample-001-payment-timeout");
  assert.equal(incident.logs.length, 26);
});

check("listServices reports every service and the window", () => {
  const out = listServices(incident.logs);
  for (const s of incident.services) assert.ok(out.includes(s), `missing ${s}`);
  assert.ok(out.includes("26 lines total"));
});

check("searchLogs filters by minimum level", () => {
  const out = searchLogs(incident.logs, { level: "ERROR" });
  assert.ok(!out.includes("no matching"));
  assert.ok(!/ WARN /.test(out) && !/ INFO /.test(out), "should only show ERROR+");
});

check("searchLogs filters by query substring and service", () => {
  const out = searchLogs(incident.logs, { query: "upstream timeout", service: "payment-svc" });
  assert.ok(out.includes("#9"));
  assert.ok(out.includes("cardproc.example"));
});

check("searchLogs caps output at limit", () => {
  const out = searchLogs(incident.logs, { limit: 2 });
  assert.ok(out.includes("showing first 2"));
  assert.equal(out.trim().split("\n").length, 3); // header + 2 lines
});

check("getContext returns a window around a line", () => {
  const out = getContext(incident.logs, 9, 1, 1);
  assert.ok(out.includes("#8") && out.includes("#9") && out.includes("#10"));
});

check("correlateTrace follows one request across services", () => {
  const out = correlateTrace(incident.logs, "t-1004");
  assert.ok(out.includes("payment-svc") && out.includes("order-service"));
  assert.ok(out.includes("order-consumer"), "t-1004 crosses into the retry consumer");
});

check("correlateTrace reports empty for an unknown trace", () => {
  assert.ok(correlateTrace(incident.logs, "t-9999").includes("no log lines"));
});

console.log(`\n${passed} checks passed.`);
