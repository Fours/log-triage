import { cite, type LineRef } from "../builder.js";
import { byDifficulty, isHard, type Scenario } from "../context.js";
import { hex } from "../noise.js";
import { spread } from "../rng.js";
import { edgeFailures, symptomCount, version } from "./shared.js";

// ---------------------------------------------------------------------------
// cascading_failure

/**
 * A brief blip in the dependency triggers immediate, unbounded retries from the
 * app; the retry load keeps the dependency overloaded long after the blip ends.
 */
export const retryStorm: Scenario = {
  key: "cascading_failure/retry-storm",
  rootCause: "cascading_failure",
  confusableWith: ["dependency_timeout", "resource_exhaustion", "bad_deploy"],
  run(c) {
    const { b, t, rng } = c;
    const inst = `${t.dep}-${rng.int(0, 3)}`;
    const v = version(c);

    // The trigger. In hard mode it's a dependency deploy, so bad_deploy is defensible.
    const trigger: LineRef[] = isHard(c)
      ? [
          b.log(c.onset - 5, t.dep, "INFO", `deploy: rolling out ${t.dep} ${v.next} (build ${hex(c)}), 1 of 4 instances at a time`, { role: "cause" }),
          b.log(c.onset, t.dep, "WARN", `instance ${inst} draining for rollout, capacity 3/4`, { role: "cause" }),
        ]
      : [b.log(c.onset, t.dep, "WARN", `instance ${inst} restarting (liveness probe failed), capacity 3/4`, { role: "cause" })];
    const recovered = b.log(c.onset + rng.float(30, 50), t.dep, "INFO", `instance ${inst} ready, capacity 4/4`, { role: "cause" });

    const retries: LineRef[] = spread(rng, c.onset + 2, c.onset + 200, byDifficulty(c, 3, 4, 4)).map((at, i) =>
      b.log(at, t.app, "WARN", `${t.depClient} got 503, retrying immediately (attempt ${2 + (i % 3)}/4, backoff disabled)`, {
        trace: b.trace(),
        role: "cause",
      }),
    );
    const overload: LineRef[] = spread(rng, c.onset + 40, c.onset + 300, byDifficulty(c, 2, 3, 3)).map((at, i) =>
      b.log(at, t.dep, "WARN", `inbound request rate ${(3.2 + i * 0.9).toFixed(1)}x baseline (inflight ${rng.int(400, 900)}), shedding load with 503`, {
        role: "cause",
      }),
    );

    const shed: LineRef[] = spread(rng, c.onset + 60, c.end, byDifficulty(c, 3, 5, 8)).map((at) =>
      b.log(at, t.dep, "ERROR", `load shed: rejected ${t.depCall} with 503 (queue full)`, { trace: b.trace(), role: "symptom" }),
    );
    const edge = edgeFailures(c, c.onset + 30, symptomCount(c), 503, `upstream ${t.app} returned 503 (retries exhausted)`);

    return {
      title: `${t.route} errors not recovering`,
      alert: `${t.edge}: 503 rate on ${t.route} above 30% for 8 minutes and not recovering.`,
      acceptableCauses: isHard(c) ? ["bad_deploy"] : [],
      traffic: { healthyAfterOnset: 0.25 },
      explain: () =>
        `${t.dep} briefly lost one of four instances (${cite(trigger)}) and was back within a minute (${cite(recovered)}). ` +
        `But ${t.app} retries 503s immediately with backoff disabled (${cite(retries)}), multiplying load on ${t.dep} past its capacity so it keeps shedding (${cite(overload)}). ` +
        `The overload sustains itself long after the trigger; the shed requests (${cite(shed)}) and edge 503s (${cite(edge)}) are symptoms. Fix the retry policy / add a retry budget.` +
        (isHard(c) ? ` The trigger was the ${t.dep} rollout, so bad_deploy is defensible, but a 1-of-4 rolling restart is routine — the retry amplification is the failure.` : ""),
    };
  },
};

/** The cache restarts empty; every request falls through to the database, which buckles. */
export const cacheStampede: Scenario = {
  key: "cascading_failure/cache-stampede",
  rootCause: "cascading_failure",
  confusableWith: ["resource_exhaustion", "dependency_timeout"],
  run(c) {
    const { b, t, rng } = c;
    const pg = t.dbKind === "postgres";

    const flush: LineRef[] = [
      b.log(c.onset, t.cache, "WARN", `restarted after node replacement; no RDB snapshot found, starting with 0 keys`, { role: "cause" }),
    ];
    const misses: LineRef[] = spread(rng, c.onset + 5, c.onset + 120, byDifficulty(c, 1, 2, 2)).map((at) =>
      b.log(at, t.app, isHard(c) ? "INFO" : "WARN", `${t.cache} miss ratio ${rng.int(92, 99)}% over last 30s (baseline ${rng.int(2, 6)}%), loading from ${t.db}`, {
        role: "cause",
      }),
    );
    const dbLoad: LineRef[] = spread(rng, c.onset + 30, c.onset + 200, byDifficulty(c, 2, 2, 3)).map((at) =>
      b.log(at, t.db, "WARN", pg ? `connections ${rng.int(470, 499)}/500 (active ${rng.int(380, 470)}), CPU ${rng.int(94, 100)}%` : `Threads_connected ${rng.int(470, 499)}/500, CPU ${rng.int(94, 100)}%`, {
        role: "cause",
      }),
    );

    const slow: LineRef[] = spread(rng, c.onset + 60, c.end, byDifficulty(c, 3, 5, 8)).map((at) =>
      b.log(at, t.db, "WARN", `slow query ${rng.int(2500, 9000)}ms: SELECT * FROM ${t.table} WHERE id = $1`, { role: "symptom" }),
    );
    const timeouts: LineRef[] = spread(rng, c.onset + 90, c.end, byDifficulty(c, 2, 3, 5)).map((at) =>
      b.log(at, t.app, "ERROR", `query on ${t.table} timed out after 5000ms (${b.entity(t.entity.prefix)})`, { trace: b.trace(), role: "symptom" }),
    );
    const edge = edgeFailures(c, c.onset + 90, symptomCount(c), 504, `upstream ${t.app} timed out`);

    return {
      title: `${t.route} slow and timing out`,
      alert: `${t.edge}: p99 latency on ${t.route} above 8s and 504s above 10% for 5 minutes.`,
      acceptableCauses: isHard(c) ? ["resource_exhaustion"] : [],
      traffic: { healthyAfterOnset: 0.4, quietAfterOnset: [t.cache] },
      explain: () =>
        `${t.cache} came back empty after a node replacement (${cite(flush)}). With ~every lookup missing (${cite(misses)}), ${t.app} sent its whole read load to ${t.db}, saturating its connections and CPU (${cite(dbLoad)}). ` +
        `The slow queries (${cite(slow)}), ${t.app} query timeouts (${cite(timeouts)}) and ${t.edge} 504s (${cite(edge)}) are the cascade, not separate problems. Warm the cache / rate-limit fills.` +
        (isHard(c) ? ` ${t.db} is genuinely exhausted, so resource_exhaustion is defensible, but it was pushed there by the empty cache.` : ""),
    };
  },
};

// ---------------------------------------------------------------------------
// external_outage

/** The third-party provider returns 5xx; the dependency's circuit breaker opens. */
export const provider5xx: Scenario = {
  key: "external_outage/provider-5xx",
  rootCause: "external_outage",
  confusableWith: ["dependency_timeout", "config_error", "cascading_failure"],
  run(c) {
    const { b, t, rng } = c;
    const x = t.external;
    const url = `POST https://${x.host}${x.path}`;

    const errors: LineRef[] = spread(rng, c.onset, c.onset + 90, byDifficulty(c, 3, 4, 4)).map((at, i) => {
      // Hard mode mixes in timeouts, so dependency_timeout is defensible.
      const timeout = isHard(c) && i % 2 === 1;
      return b.log(
        at,
        t.dep,
        "ERROR",
        timeout
          ? `${x.label} call FAILED: upstream timeout after 10000ms ${url}`
          : `${x.label} returned ${rng.pick([502, 503])} ${rng.pick(["Service Unavailable", "Bad Gateway"])} ${url} (x-request-id ${hex(c)})`,
        { trace: b.trace(), role: "cause" },
      );
    });
    const breaker = b.log(c.onset + rng.float(95, 120), t.dep, "WARN", `circuit breaker OPEN for ${x.host} (failure rate ${rng.int(85, 99)}% over 20 calls), failing fast for 30s`, {
      role: "cause",
    });
    const probes: LineRef[] = spread(rng, c.onset + 160, c.end, byDifficulty(c, 1, 2, 2)).map((at) =>
      b.log(at, t.dep, "WARN", `circuit breaker half-open probe to ${x.host} failed: ${rng.pick([502, 503])}, re-opening`, { role: "cause" }),
    );

    const app: LineRef[] = spread(rng, c.onset + 100, c.end, byDifficulty(c, 2, 4, 6)).map((at) =>
      b.log(at, t.app, "ERROR", `${t.depClient} failed: ${t.dep} returned 503 (circuit open)`, { trace: b.trace(), role: "symptom" }),
    );
    const edge = edgeFailures(c, c.onset + 5, symptomCount(c), 503, `upstream ${t.app} returned 503 Service Unavailable`);

    return {
      title: `${t.route} failing; ${t.dep} degraded`,
      alert: `${t.edge}: 503 rate on ${t.route} above 35% for 4 minutes.`,
      acceptableCauses: isHard(c) ? ["dependency_timeout"] : [],
      traffic: { healthyAfterOnset: 0.15 },
      explain: () =>
        `The ${x.label} (${x.host}) began returning 5xx${isHard(c) ? " and timing out" : ""} (${cite(errors)}); ${t.dep}'s circuit breaker opened (${cite(breaker)}) and its probes keep failing (${cite(probes)}). ` +
        `Nothing on our side changed. ${t.app}'s errors (${cite(app)}) and the ${t.edge} 503s (${cite(edge)}) are symptoms. Fail over or degrade gracefully until the provider recovers.` +
        (isHard(c) ? ` Some calls time out rather than error, so dependency_timeout is defensible, but the provider is returning hard 5xx errors: it is down.` : ""),
    };
  },
};

/** Cloud object storage in one region errors on writes. */
export const cloudStorage: Scenario = {
  key: "external_outage/cloud-object-storage",
  rootCause: "external_outage",
  confusableWith: ["config_error", "dependency_timeout", "resource_exhaustion"],
  run(c) {
    const { b, t, rng } = c;
    const bucket = `${t.key}-artifacts-prod`;

    const errors: LineRef[] = spread(rng, c.onset, c.onset + 240, byDifficulty(c, 3, 4, 5)).map((at) => {
      const id = b.entity(t.entity.prefix);
      return b.log(
        at,
        t.dep,
        "ERROR",
        `PutObject s3://${bucket}/${id}.json failed: ${rng.pick(["500 InternalError: We encountered an internal error. Please try again.", "503 ServiceUnavailable: Please reduce your request rate."])} (region us-east-1, request-id ${hex(c).toUpperCase()})`,
        { trace: b.trace(), role: "cause" },
      );
    });
    const sdk = b.log(c.onset + rng.float(100, 140), t.dep, "WARN", `aws-sdk: retry quota exhausted for s3.us-east-1.amazonaws.com (${rng.int(40, 90)} failed attempts in 60s)`, {
      role: "cause",
    });

    const app: LineRef[] = spread(rng, c.onset + 5, c.end, byDifficulty(c, 2, 4, 6)).map((at) =>
      b.log(at, t.app, "ERROR", `${t.depClient} failed: ${t.dep} returned 500 (storage write failed)`, { trace: b.trace(), role: "symptom" }),
    );
    const edge = edgeFailures(c, c.onset + 6, symptomCount(c), 500, `upstream ${t.app} returned 500 Internal Server Error`);

    return {
      title: `${t.route} failing intermittently`,
      alert: `${t.edge}: 500 rate on ${t.route} above 20% for 6 minutes.`,
      traffic: { healthyAfterOnset: 0.4 },
      explain: () =>
        `Writes from ${t.dep} to S3 in us-east-1 fail with 500 InternalError / 503 ServiceUnavailable (${cite(errors)}) until the SDK's retry quota is exhausted (${cite(sdk)}). ` +
        `These are server-side errors from the cloud provider — not a credential (403) or configuration problem — and nothing on our side changed. ` +
        `${t.app}'s errors (${cite(app)}) and the ${t.edge} 500s (${cite(edge)}) are symptoms.`,
    };
  },
};
