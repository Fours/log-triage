import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { strict as assert } from "node:assert";
import { loadIncident, listServices, searchLogs, getContext, correlateTrace, resolveTime } from "../src/tools.js";

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

const nums = (out: string) => [...out.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]));

check("searchLogs time range: since/until are inclusive, take ISO or HH:MM[:SS], and combine with other filters", () => {
  const logs = incident.logs;
  const mid = logs[Math.floor(logs.length / 2)];
  const after = nums(searchLogs(logs, { since: mid.ts, limit: 200 }));
  assert.ok(after.length > 0 && after.every((n) => logs[n - 1].ts >= mid.ts));
  assert.ok(after.includes(mid.n), "since is inclusive");
  const before = nums(searchLogs(logs, { until: mid.ts, limit: 200 }));
  assert.ok(before.every((n) => logs[n - 1].ts <= mid.ts) && before.includes(mid.n), "until is inclusive");
  const clock = mid.ts.slice(11, 19);
  assert.deepEqual(nums(searchLogs(logs, { since: clock, limit: 200 })), after, "HH:MM:SS reads on the window's date");
  assert.deepEqual(nums(searchLogs(logs, { since: clock.slice(0, 5), limit: 200 })), nums(searchLogs(logs, { since: `${mid.ts.slice(0, 16)}:00Z`, limit: 200 })));
  const errorsAfter = nums(searchLogs(logs, { since: mid.ts, level: "ERROR", limit: 200 }));
  assert.ok(errorsAfter.every((n) => after.includes(n) && logs[n - 1].level === "ERROR"));
});

check("searchLogs time range: bad input is an error the agent can act on", () => {
  assert.throws(() => searchLogs(incident.logs, { since: "yesterday-ish" }), /can't read time "yesterday-ish"/);
  const [first, last] = [incident.logs[0].ts, incident.logs.at(-1)!.ts];
  assert.throws(() => searchLogs(incident.logs, { since: last, until: first }), /is after until/);
});

check("a bare clock time rolls to the next day when the window crosses midnight", () => {
  const logs = [
    { n: 1, ts: "2026-11-08T23:58:00Z", service: "a", level: "INFO" as const, msg: "x" },
    { n: 2, ts: "2026-11-09T00:01:00Z", service: "a", level: "INFO" as const, msg: "y" },
  ];
  assert.equal(new Date(resolveTime("00:00:30", logs)).toISOString(), "2026-11-09T00:00:30.000Z");
  assert.equal(new Date(resolveTime("23:59", logs)).toISOString(), "2026-11-08T23:59:00.000Z");
});

console.log(`\n${passed} checks passed.`);
