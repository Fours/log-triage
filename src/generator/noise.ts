import type { RootCauseCategory } from "../types.js";
import { cite, type LineRef } from "./builder.js";
import { byDifficulty, type Ctx } from "./context.js";

/**
 * Background traffic and red herrings: the haystack. Without it every log line
 * is relevant and the eval measures nothing. Volume and herring count scale with
 * difficulty so a 25-line search cap actually forces the agent to be selective.
 */

export interface TrafficOpts {
  healthyAfterOnset: number;
  quietAfterOnset: Set<string>;
}

/** Healthy requests through edge → app (→ dep) plus routine housekeeping on every service. */
export function backgroundTraffic(c: Ctx, opts: TrafficOpts): void {
  const { b, t, rng } = c;
  const interval = byDifficulty(c, 35, 20, 13);

  // Healthy requests: full rate before onset, a fraction after.
  for (let at = rng.float(0, interval); at < c.end; at += rng.float(interval * 0.5, interval * 1.5)) {
    if (at >= c.onset && !rng.chance(opts.healthyAfterOnset)) continue;
    const tr = b.trace();
    const id = b.entity(t.entity.prefix);
    if (!opts.quietAfterOnset.has(t.app) || at < c.onset) {
      b.log(at, t.app, "INFO", `${t.entity.noun} ${id} accepted, calling ${t.dep} ${t.depCall}`, { trace: tr });
    }
    if (rng.chance(0.5) && (!opts.quietAfterOnset.has(t.dep) || at < c.onset)) {
      b.log(at + 0.1, t.dep, "INFO", `${t.depCall} ${id} ok ${rng.int(20, 90)}ms`, { trace: tr });
    }
    const latency = Math.round(t.baseLatency * rng.float(0.7, 1.6));
    b.log(at + 0.2, t.edge, "INFO", `${t.route} 200 ${latency}ms`, { trace: tr });
  }

  const periodic = (
    service: string,
    every: [number, number],
    make: () => { level: "DEBUG" | "INFO"; msg: string },
    preOnsetOnly = false,
  ) => {
    for (let at = rng.float(0, every[1]); at < c.end; at += rng.float(every[0], every[1])) {
      if (at >= c.onset && (preOnsetOnly || opts.quietAfterOnset.has(service))) break;
      const { level, msg } = make();
      b.log(at, service, level, msg);
    }
  };

  periodic(t.db, [90, 160], () =>
    t.dbKind === "postgres"
      ? rng.chance(0.6)
        ? { level: "INFO", msg: `checkpoint complete: wrote ${rng.int(200, 1400)} buffers (${rng.float(1, 8).toFixed(1)}%)` }
        : { level: "INFO", msg: `automatic vacuum of table "${t.table}": index scans: 1, pages removed ${rng.int(0, 40)}` }
      : { level: "INFO", msg: `InnoDB: page cleaner flushed ${rng.int(100, 900)} pages, buffer pool hit rate ${rng.int(985, 999) / 10}%` },
  );
  periodic(t.cache, [60, 100], () => ({
    level: "INFO",
    msg: `stats: hits=${rng.int(8000, 20000)} misses=${rng.int(200, 900)} evicted=0 connected_clients=${rng.int(30, 60)}`,
  }));
  periodic(t.consumer, [30, 55], () => ({
    level: "INFO",
    msg: `processed batch of ${rng.int(20, 120)} messages from ${t.queue} (lag ${rng.int(40, 400)}ms)`,
  }));
  periodic(t.app, [100, 200], () => ({ level: "DEBUG", msg: `GC pause ${rng.int(4, 25)}ms (young), heap ${rng.int(30, 48)}%` }));
  periodic(t.dep, [100, 200], () => ({ level: "DEBUG", msg: `GC pause ${rng.int(4, 25)}ms (young), heap ${rng.int(28, 45)}%` }));
  // The edge's upstream health summary would contradict the outage, so it only runs before onset.
  periodic(t.edge, [120, 240], () => ({ level: "DEBUG", msg: `upstream health: ${t.app} ok, ${t.dep} ok` }), true);
}

// ---------------------------------------------------------------------------
// Red herrings

export interface Herring {
  key: string;
  /** The category a careless reader might mistake this for. */
  mimics: RootCauseCategory;
  /** Emit the herring; return its line(s) and a sentence on why it's irrelevant. */
  apply(c: Ctx): { refs: LineRef[]; why: string };
}

/** Somewhere well before onset, so timing alone rules it out. */
const before = (c: Ctx) => c.rng.float(c.onset * 0.1, c.onset * 0.6);
/** Close to onset — only the content rules it out. Used in hard mode. */
const near = (c: Ctx) => c.onset + c.rng.float(-90, 60);

export const HERRINGS: readonly Herring[] = [
  {
    key: "unrelated-slow-query",
    mimics: "dependency_timeout",
    apply(c) {
      const at = c.difficulty === "hard" ? near(c) : before(c);
      const r = c.b.log(at, c.t.db, "WARN", `slow query ${c.rng.int(1100, 2600)}ms: SELECT * FROM audit_log WHERE created_at > $1 ORDER BY id (seq scan)`, { role: "herring" });
      return { refs: [r], why: "a one-off slow reporting query on audit_log, not on the failing request path" };
    },
  },
  {
    key: "unrelated-deploy",
    mimics: "bad_deploy",
    apply(c) {
      const at = c.difficulty === "hard" ? c.onset - c.rng.float(60, 180) : before(c);
      const v = `v${c.rng.int(1, 4)}.${c.rng.int(0, 20)}.${c.rng.int(0, 9)}`;
      const r1 = c.b.log(at, c.t.consumer, "INFO", `deploy: rolling out ${c.t.consumer} ${v} (build ${hex(c)})`, { role: "herring" });
      const r2 = c.b.log(at + c.rng.float(15, 40), c.t.consumer, "INFO", `started ${c.t.consumer} ${v}, pid 1, ready`, { role: "herring" });
      return { refs: [r1, r2], why: `a deploy of ${c.t.consumer}, which is not on the failing request path and kept processing normally` };
    },
  },
  {
    key: "gc-pause",
    mimics: "resource_exhaustion",
    apply(c) {
      const at = c.difficulty === "hard" ? near(c) : before(c);
      const r = c.b.log(at, c.t.consumer, "WARN", `GC pause ${c.rng.int(600, 1100)}ms (G1 Old Gen), heap ${c.rng.int(55, 68)}% after collection`, { role: "herring" });
      return { refs: [r], why: "a single long GC pause in a healthy service, with heap well below limits" };
    },
  },
  {
    key: "disk-usage-warning",
    mimics: "resource_exhaustion",
    apply(c) {
      const r = c.b.log(before(c), c.t.edge, "WARN", `disk usage ${c.rng.int(76, 84)}% on /var/log (threshold 75%)`, { role: "herring" });
      return { refs: [r], why: "a routine disk usage warning on the log volume, nowhere near full" };
    },
  },
  {
    key: "noop-config-reload",
    mimics: "config_error",
    apply(c) {
      const at = c.difficulty === "hard" ? near(c) : before(c);
      const r = c.b.log(at, c.t.dep, "INFO", `config reloaded from config-service (revision ${c.rng.int(300, 900)}): 0 keys changed`, { role: "herring" });
      return { refs: [r], why: "a config reload that changed nothing" };
    },
  },
  {
    key: "cert-expiry",
    mimics: "config_error",
    apply(c) {
      const r = c.b.log(before(c), c.t.edge, "WARN", `TLS certificate for *.internal.example expires in ${c.rng.int(12, 28)} days`, { role: "herring" });
      return { refs: [r], why: "a certificate expiry reminder weeks out" };
    },
  },
  {
    key: "single-dead-letter",
    mimics: "poison_message",
    apply(c) {
      const at = c.difficulty === "hard" ? near(c) : before(c);
      const id = `msg-${c.rng.int(100000, 999999)}`;
      const r = c.b.log(at, c.t.consumer, "WARN", `${id} from ${c.t.queue} failed schema validation (missing field "version"), moved to ${c.t.queue}.dlq`, { role: "herring" });
      return { refs: [r], why: "one malformed message that was dead-lettered correctly; the consumer kept going" };
    },
  },
  {
    key: "client-validation-400",
    mimics: "data_integrity",
    apply(c) {
      const at = c.difficulty === "hard" ? near(c) : before(c);
      const r = c.b.log(at, c.t.edge, "WARN", `${c.t.route} 400 ${c.rng.int(3, 12)}ms: request validation failed: field "email" is not a valid address`, { trace: c.b.trace(), role: "herring" });
      return { refs: [r], why: "a client sending one invalid request, rejected correctly with a 400" };
    },
  },
  {
    key: "recovered-external-blip",
    mimics: "external_outage",
    apply(c) {
      const at = before(c);
      const tr = c.b.trace();
      const x = c.t.external;
      const r1 = c.b.log(at, c.t.dep, "WARN", `${x.label} call failed: connection reset by peer POST https://${x.host}${x.path}, retry 1/3`, { trace: tr, role: "herring" });
      const r2 = c.b.log(at + 0.4, c.t.dep, "INFO", `${x.label} call ok on retry 2/3 (${c.rng.int(80, 200)}ms)`, { trace: tr, role: "herring" });
      return { refs: [r1, r2], why: `a single ${x.label} connection reset that succeeded on retry, minutes before onset` };
    },
  },
  {
    key: "client-rate-limited",
    mimics: "cascading_failure",
    apply(c) {
      const at = c.difficulty === "hard" ? near(c) : before(c);
      const r = c.b.log(at, c.t.edge, "WARN", `rate limiter: client key k-${c.rng.int(1000, 9999)} throttled (429), ${c.rng.int(80, 200)} req/s over quota`, { role: "herring" });
      return { refs: [r], why: "a single API client being rate-limited, which is the limiter working as intended" };
    },
  },
];

/**
 * Pick herrings for an incident. Never one that mimics the true root cause (that
 * would make the label debatable); in hard mode, prefer ones that mimic the
 * categories this scenario is most easily confused with.
 */
export function plantHerrings(
  c: Ctx,
  rootCause: RootCauseCategory,
  confusableWith: RootCauseCategory[],
): { refs: LineRef[]; note: () => string } {
  const count = byDifficulty(c, c.rng.int(0, 1), c.rng.int(1, 2), c.rng.int(3, 4));
  const pool = c.rng.shuffle(HERRINGS.filter((h) => h.mimics !== rootCause));
  if (c.difficulty === "hard") {
    pool.sort((a, b) => Number(confusableWith.includes(b.mimics)) - Number(confusableWith.includes(a.mimics)));
  }
  const chosen = pool.slice(0, count);
  const applied = chosen.map((h) => ({ h, ...h.apply(c) }));
  const refs = applied.flatMap((a) => a.refs);
  const note = () =>
    applied.length
    ? ` Red herrings: ${applied.map((a) => `${cite(a.refs)} (${a.why})`).join("; ")}.`
    : "";
  return { refs, note };
}

export function hex(c: Ctx): string {
  return c.rng.int(0, 0xfffffff).toString(16).padStart(7, "0");
}
