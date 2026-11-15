import type { RootCauseCategory } from "../types.js";
import { cite, type LineRef } from "./builder.js";
import type { Ctx } from "./context.js";
import { DECOY_PLAN } from "./hardness.js";
import { spread, type Rng } from "./rng.js";

/**
 * Generator v2's loud decoys (docs/milestone-7.md, T3): a chronic, unrelated
 * error flood on an auxiliary service that is never on the failing request's
 * path. It starts well before onset and outnumbers the real path's errors, so
 * "start from the service with the most errors" picks the wrong service. The
 * timing is the fair clue: these errors predate the incident.
 *
 * Each decoy speaks its category's usual vocabulary ("at capacity", "parse
 * error", "retrying", a deploy), so it reads like that category to anyone
 * matching on keywords.
 *
 * T6 adds *timed* decoys (medium and hard, per DECOY_PLAN): the same floods,
 * but starting just after the fault's first cause line, so "it started with
 * the incident" no longer rules them out. Their fair clue is the path: no
 * failing request's trace ever passes through the decoy's service, and the
 * fault's first signs come before it.
 *
 * Every v2 incident also gets one healthy auxiliary service, so an extra
 * service isn't a giveaway, and the services list is shuffled. All randomness
 * comes from `c.hard.rng`; v1 never calls this.
 */

export interface Decoy {
  key: string;
  /** The category a careless reader might mistake the flood for. */
  mimics: RootCauseCategory;
  /** The auxiliary service it runs on (never a topology service). */
  service: string;
  /** One chronic error line. */
  error(r: Rng, i: number): string;
  /** A routine INFO line the same service logs when healthy. */
  routine(r: Rng): string;
  /** Why it's irrelevant, for the label's explanation. */
  why: string;
}

const hex = (r: Rng) => r.int(0, 0xfffffff).toString(16).padStart(7, "0");

export const DECOYS: readonly Decoy[] = [
  {
    key: "deprecated-healthcheck",
    mimics: "dependency_timeout",
    service: "status-poller",
    error: () => `healthcheck GET http://legacy-inventory:8080/v1/status timed out after 2000ms (endpoint deprecated since 2025-06)`,
    routine: (r) => `poll cycle complete: ${r.int(18, 40)} targets checked in ${r.int(300, 900)}ms`,
    why: "a health check still polling a deprecated endpoint, which no request depends on",
  },
  {
    key: "metrics-buffer-full",
    mimics: "resource_exhaustion",
    service: "metrics-agent",
    error: (r) => `remote-write exporter at capacity (queue 10000/10000), dropped ${r.int(200, 2400)} samples`,
    routine: (r) => `flushed ${r.int(4000, 9000)} series to remote-write in ${r.int(40, 180)}ms`,
    why: "the metrics agent's own export buffer overflowing, which affects dashboards, not requests",
  },
  {
    key: "cron-missing-module",
    mimics: "bad_deploy",
    service: "report-cron",
    error: () => `job nightly-revenue-report exited with code 1 since the deploy of image report-cron:2026.10.2: ModuleNotFoundError: No module named 'pandas'`,
    routine: (r) => `scheduler heartbeat: ${r.int(6, 14)} jobs registered, next run in ${r.int(20, 300)}s`,
    why: "a reporting cron job broken by an old image change, retrying on schedule and unrelated to the request path",
  },
  {
    key: "unknown-feature-flag",
    mimics: "config_error",
    service: "flag-sync",
    error: (r) => `config reloaded from flag service with 1 invalid key: flag "${r.pick(["checkout_v3_ui", "search_rerank_beta", "dark_mode_emails", "new_pricing_banner"])}" is unknown in environment staging-2, keeping cached value`,
    routine: (r) => `synced ${r.int(60, 140)} feature flags from flag service (etag ${hex(r)})`,
    why: "a flag-sync job complaining about another environment's flags, while serving cached values",
  },
  {
    key: "malformed-audit-events",
    mimics: "poison_message",
    service: "audit-archiver",
    error: (r) => `parse error on audit event evt-${r.int(100000, 999999)}: invalid UTF-8 at byte ${r.int(10, 900)}, skipping`,
    routine: (r) => `archived audit batch of ${r.int(200, 900)} events`,
    why: "an archiver skipping a trickle of bad audit events, as designed, without blocking anything",
  },
  {
    key: "archive-checksums",
    mimics: "data_integrity",
    service: "billing-reconciler",
    error: (r) => `invoice_archive row inv-${r.int(100000, 999999)} violates checksum constraint, skipping (archive partition 2019-Q${r.int(1, 4)})`,
    routine: (r) => `reconciled ${r.int(300, 1200)} current-period invoices, 0 discrepancies`,
    why: "a reconciler flagging old archived invoices, which no live request reads",
  },
  {
    key: "analytics-429s",
    mimics: "cascading_failure",
    service: "analytics-forwarder",
    error: (r, i) => `analytics-ingest returned 429, retrying batch of ${r.int(50, 400)} events (attempt ${1 + (i % 5)}/5, then dropped)`,
    routine: (r) => `forwarded ${r.int(500, 3000)} events to analytics-ingest`,
    why: "an analytics forwarder being rate-limited by its vendor, off the request path",
  },
  {
    key: "customer-webhook-502",
    mimics: "external_outage",
    service: "webhook-dispatcher",
    error: (r, i) => `customer webhook https://hooks.acme-${r.int(10, 99)}.example/ingest returned 502 Bad Gateway (attempt ${1 + (i % 10)}/10)`,
    routine: (r) => `delivered ${r.int(40, 200)} webhooks (p95 ${r.int(120, 600)}ms)`,
    why: "one customer's webhook endpoint returning 502s, which only affects deliveries to that customer",
  },
];

export interface PlantedDecoys {
  /** Auxiliary services added to the incident: the decoys plus one healthy one. */
  services: string[];
  decoyServices: string[];
  /** The decoys whose flood starts with the fault. */
  timedDecoyServices: string[];
  refs: LineRef[];
  note: () => string;
}

/**
 * Add the decoys and the healthy auxiliary service. `pathErrors` is the highest
 * ERROR/FATAL count of any service so far; each decoy logs more than that.
 */
export function plantDecoys(c: Ctx, rootCause: RootCauseCategory, confusableWith: RootCauseCategory[], pathErrors: number): PlantedDecoys {
  const r = c.hard.rng;
  const plan = DECOY_PLAN[c.difficulty];
  const count = plan.chronic + plan.timed;
  const pool = r.shuffle(DECOYS.filter((d) => d.mimics !== rootCause));
  pool.sort((a, b) => Number(confusableWith.includes(b.mimics)) - Number(confusableWith.includes(a.mimics)));
  const chosen = pool.slice(0, count);
  // The healthy one borrows a decoy's name and routine, so no service name is always a decoy.
  const healthy = pool[count];

  // When the fault shows itself: its first cause line, and its first loud line (cause or symptom).
  const firstCause = c.b.earliest((d) => d.role === "cause") ?? c.onset;
  const firstLoud = c.b.earliest((d) => (d.role === "cause" || d.role === "symptom") && (d.level === "ERROR" || d.level === "FATAL")) ?? c.onset;
  // Timed: after the first cause line (never more than a minute before onset), ahead of the loud part where possible.
  const timedStart = () => {
    const lo = Math.max(firstCause, c.onset - 60) + 5;
    const hi = Math.max(lo + 20, firstLoud);
    return r.float(lo, lo + (hi - lo) * 0.6);
  };

  const routine = (d: Decoy) => {
    for (let at = r.float(0, 120 / c.hard.volume); at < c.end; at += r.float(60 / c.hard.volume, 150 / c.hard.volume)) c.b.log(at, d.service, "INFO", d.routine(r));
  };

  // Highest-priority (most confusable) decoys are the timed ones: they are the stronger bait.
  const applied = chosen.map((d, i) => {
    const timed = i < plan.timed;
    routine(d);
    const start = timed ? timedStart() : c.end * r.float(0.1, 0.3);
    const n = pathErrors + r.int(3, 8);
    const refs = spread(r, start, c.end, n).map((at, k) => c.b.log(at, d.service, "ERROR", d.error(r, k), { role: "herring" }));
    return { d, refs, timed };
  });
  routine(healthy);

  return {
    services: [...chosen.map((d) => d.service), healthy.service],
    decoyServices: chosen.map((d) => d.service),
    timedDecoyServices: applied.filter((a) => a.timed).map((a) => a.d.service),
    refs: applied.flatMap((a) => a.refs),
    note: () =>
      applied
        .map(({ d, refs, timed }) => {
          const first = [...refs].sort((x, y) => x.n - y.n).slice(0, 3);
          const when = timed
            ? "starting just after the fault began, but no failing request passes through it"
            : "starting before onset";
          return ` Loud decoy: ${d.service} logs a ${timed ? "flood of errors" : "chronic error"} (${cite(first)} and ${refs.length - first.length} more, ${when}), ${d.why}.`;
        })
        .join(""),
  };
}
