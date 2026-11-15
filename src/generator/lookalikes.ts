import type { RootCauseCategory } from "../types.js";
import { cite, type LineRef } from "./builder.js";
import type { Ctx } from "./context.js";
import type { Rng } from "./rng.js";

/**
 * Generator v2's lookalike events (T6 redesign, docs/milestone-7.md): one
 * harmless event *on the paged request's own path*, 2–6 minutes before the
 * fault's first sign, that looks like a different category's cause. A deploy
 * of the app right before things broke is the classic bait.
 *
 * The fair clue is what happens next: requests keep succeeding on that service
 * for minutes after the event, and the real fault's first signs come later.
 * Lines are labeled `herring`. A lookalike never mimics the true root cause or
 * one of its acceptable answers, so the label stays unambiguous.
 *
 * All randomness comes from `c.hard.rng`; v1 never calls this.
 */

export interface Lookalike {
  key: string;
  mimics: RootCauseCategory;
  /** Emit the event at `at` on the path; return its lines, the service, and why it's harmless. */
  apply(c: Ctx, r: Rng, at: number): { refs: LineRef[]; service: string; why: string };
}

const hex = (r: Rng) => r.int(0, 0xfffffff).toString(16).padStart(7, "0");

export const LOOKALIKES: readonly Lookalike[] = [
  {
    key: "app-deploy",
    mimics: "bad_deploy",
    apply(c, r, at) {
      const { t, b } = c;
      const v = `v${r.int(2, 6)}.${r.int(10, 40)}.${r.int(0, 9)}`;
      const pods = r.int(3, 6);
      return {
        service: t.app,
        refs: [
          b.log(at, t.app, "INFO", `deploy: rolling out ${t.app} ${v} (build ${hex(r)}), ${pods} pods`, { role: "herring" }),
          b.log(at + r.float(40, 80), t.app, "INFO", `rollout of ${t.app} ${v} complete: ${pods}/${pods} pods ready, readiness checks passing`, { role: "herring" }),
        ],
        why: `a routine deploy of ${t.app}, after which it kept serving requests normally for minutes`,
      };
    },
  },
  {
    key: "config-reload",
    mimics: "config_error",
    apply(c, r, at) {
      const { t, b } = c;
      const flag = r.pick(["recs_widget_v2", "search_typeahead", "new_receipt_email", "promo_banner"]);
      return {
        service: t.dep,
        refs: [
          b.log(
            at,
            t.dep,
            "INFO",
            `config reloaded from config-service (revision ${r.int(300, 900)}): 3 keys changed: log.level info→debug, metrics.sample_rate 0.1→0.2, feature.${flag} off→on`,
            { role: "herring" },
          ),
        ],
        why: `a config reload on ${t.dep} that only changed logging, metrics sampling and a UI flag, followed by normal traffic`,
      };
    },
  },
  {
    key: "heap-pressure",
    mimics: "resource_exhaustion",
    apply(c, r, at) {
      const { t, b } = c;
      const mib = r.pick([1024, 2048, 4096]);
      return {
        service: t.app,
        refs: [
          b.log(at, t.app, "WARN", `heap usage ${r.int(80, 86)}% of ${mib}MiB (threshold 80%), starting concurrent mark cycle`, { role: "herring" }),
          b.log(at + r.float(4, 12), t.app, "INFO", `concurrent mark cycle complete in ${r.int(300, 900)}ms: heap ${r.int(38, 50)}% of ${mib}MiB`, { role: "herring" }),
        ],
        why: `a heap warning on ${t.app} that a normal GC cycle cleared within seconds`,
      };
    },
  },
  {
    key: "one-slow-call",
    mimics: "dependency_timeout",
    apply(c, r, at) {
      const { t, b } = c;
      return {
        service: t.app,
        refs: [
          b.log(at, t.app, "WARN", `${t.depClient} slow: ${r.int(2200, 3400)}ms calling ${t.dep} ${t.depCall} (soft threshold 2000ms)`, { trace: b.trace(), role: "herring" }),
        ],
        why: `one slow call from ${t.app} to ${t.dep}, with the calls after it back to normal latency`,
      };
    },
  },
  {
    key: "breaker-flap",
    mimics: "cascading_failure",
    apply(c, r, at) {
      const { t, b } = c;
      return {
        service: t.app,
        refs: [
          b.log(at, t.app, "WARN", `circuit breaker for ${t.dep} OPEN: 5 failures in 10s, shedding calls for 15s`, { role: "herring" }),
          b.log(at + r.float(16, 25), t.app, "INFO", `circuit breaker for ${t.dep} CLOSED: half-open probe ok (${r.int(20, 80)}ms)`, { role: "herring" }),
        ],
        why: `a circuit breaker on ${t.app} that tripped briefly and closed again on its first probe`,
      };
    },
  },
  {
    key: "provider-status-notice",
    mimics: "external_outage",
    apply(c, r, at) {
      const { t, b } = c;
      const x = t.external;
      const region = r.pick(["eu-west-1", "ap-southeast-2", "sa-east-1"]);
      return {
        service: t.dep,
        refs: [
          b.log(at, t.dep, "INFO", `${x.label} status feed: incident opened "Elevated API latency in ${region}" (our region us-east-1 not listed)`, { role: "herring" }),
        ],
        why: `a ${x.label} status notice about another region, while ${t.dep}'s calls kept succeeding`,
      };
    },
  },
  {
    key: "single-redelivery",
    mimics: "poison_message",
    apply(c, r, at) {
      const { t, b } = c;
      const id = `msg-${r.int(100000, 999999)}`;
      return {
        service: t.consumer,
        refs: [
          b.log(at, t.consumer, "WARN", `handler error on ${id} from ${t.queue} (attempt 1/5): connection reset by peer, scheduling redelivery`, { role: "herring" }),
          b.log(at + r.float(5, 15), t.consumer, "INFO", `${id} from ${t.queue} processed on attempt 2/5`, { role: "herring" }),
        ],
        why: `one message on ${t.consumer} that failed once and went through on redelivery`,
      };
    },
  },
  {
    key: "index-migration",
    mimics: "data_integrity",
    apply(c, r, at) {
      const { t, b } = c;
      const name = `2026_11_${String(r.int(1, 14)).padStart(2, "0")}_add_index_${t.table}_created_at`;
      const ddl =
        t.dbKind === "postgres"
          ? `CREATE INDEX CONCURRENTLY idx_${t.table}_created_at ON ${t.table} (created_at)`
          : `ALTER TABLE ${t.table} ADD INDEX idx_${t.table}_created_at (created_at), ALGORITHM=INPLACE, LOCK=NONE`;
      return {
        service: t.db,
        refs: [
          b.log(at, t.db, "INFO", `schema migration ${name} started: ${ddl}`, { role: "herring" }),
          b.log(at + r.float(20, 60), t.db, "INFO", `schema migration ${name} applied in ${r.int(8, 40)}s; 0 pending`, { role: "herring" }),
        ],
        why: `an online index migration on ${t.db} that finished cleanly, with no lock taken and writes continuing`,
      };
    },
  },
];

export interface PlantedLookalike {
  key: string;
  mimics: RootCauseCategory;
  service: string;
  refs: LineRef[];
  note: () => string;
}

/**
 * Plant one lookalike. It mimics one of the scenario's confusable categories
 * when it can (any other category otherwise), never the root cause or an
 * acceptable answer. It lands 2–6 minutes before the fault's first cause line.
 */
export function plantLookalike(c: Ctx, rootCause: RootCauseCategory, confusableWith: RootCauseCategory[], acceptable: RootCauseCategory[]): PlantedLookalike {
  const r = c.hard.rng;
  const allowed = LOOKALIKES.filter((l) => l.mimics !== rootCause && !acceptable.includes(l.mimics));
  const preferred = allowed.filter((l) => confusableWith.includes(l.mimics));
  const chosen = r.pick(preferred.length ? preferred : allowed);
  const firstCause = Math.min(c.b.earliest((d) => d.role === "cause") ?? c.onset, c.onset);
  const at = Math.max(20, firstCause - r.float(120, 360));
  const { refs, service, why } = chosen.apply(c, r, at);
  return {
    key: chosen.key,
    mimics: chosen.mimics,
    service,
    refs,
    note: () => ` Lookalike: ${cite(refs)} on ${service} (${why}). It precedes the fault's first sign by minutes, and nothing failed in between.`,
  };
}
