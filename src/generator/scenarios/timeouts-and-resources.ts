import { cite, type LineRef } from "../builder.js";
import { byDifficulty, isHard, type Scenario } from "../context.js";
import { spread } from "../rng.js";
import { appTimeout, edgeFailures, externalTimeout, pid, poolSaturation, symptomCount } from "./shared.js";

// ---------------------------------------------------------------------------
// dependency_timeout

/** The dependency's queries block on a lock held by an idle-in-transaction session, so app → dep calls time out. */
export const dbLockWait: Scenario = {
  key: "dependency_timeout/db-lock-wait",
  rootCause: "dependency_timeout",
  confusableWith: ["resource_exhaustion", "data_integrity"],
  quietable: true,
  run(c) {
    const { b, t, rng } = c;
    const xid = rng.int(80000, 99999);
    const pg = t.dbKind === "postgres";
    const holderAt = c.onset - rng.float(20, 60);

    const holder = b.log(
      holderAt,
      t.db,
      isHard(c) ? "INFO" : "WARN",
      pg
        ? `transaction ${xid} (application_name=${t.dep}-reconciler) idle in transaction, holding RowExclusiveLock on "${t.table}"`
        : `TRANSACTION ${xid}, ACTIVE ${rng.int(60, 120)} sec, ${t.dep}-reconciler holding 1 row lock(s) on ${t.table}, undo log entries 1`,
      { role: "cause", origin: true },
    );

    const waits: LineRef[] = spread(rng, c.onset, c.onset + 120, byDifficulty(c, 2, 2, 3)).map((at) =>
      b.log(
        at,
        t.db,
        pg ? "WARN" : "ERROR",
        pg
          ? `process ${pid(c)} still waiting for ShareLock on transaction ${xid} after 1000.000 ms (UPDATE ${t.table} SET ...)`
          : `Lock wait timeout exceeded; try restarting transaction (UPDATE ${t.table} SET ...)`,
        { role: "cause" },
      ),
    );

    const canceled = c.hard.phrases("statement-timeout", [
      (id: string) => `query canceled: statement timeout 10000ms (UPDATE ${t.table} WHERE id = ${id})`,
      (id: string) => `canceling UPDATE on ${t.table} for ${id} due to statement_timeout`,
      (id: string) => `db write ${t.table}/${id} aborted: QueryCanceled after 10.0s`,
      (id: string) => `${t.table} update (${id}) exceeded the 10000 ms limit and was cancelled`,
    ]);
    const appTimedOut = appTimeout(c, 15000);
    const timeouts: LineRef[] = [];
    for (const at of spread(rng, c.onset + 15, c.onset + 200, byDifficulty(c, 2, 3, 3))) {
      const tr = b.trace();
      const id = b.entity(t.entity.prefix);
      timeouts.push(b.log(at, t.dep, "ERROR", canceled(id), { trace: tr, role: "cause" }));
      timeouts.push(b.log(at + 5, t.app, "ERROR", appTimedOut(id), { trace: tr, role: "cause" }));
    }

    const pool = poolSaturation(c, c.onset + 150, byDifficulty(c, 2, 3, 4));
    const edge = edgeFailures(c, c.onset + 160, symptomCount(c), 504, `upstream ${t.app} timed out`);

    return {
      title: `${t.route} latency spike and 504s`,
      alert: `${t.edge}: p95 latency on ${t.route} above 10s and 504 rate over 15% for 5 minutes.`,
      traffic: { healthyAfterOnset: 0.3 },
      explain: () =>
        `A ${t.dep} reconciler session opened transaction ${xid} on ${t.db} and left it open holding a row lock on ${t.table} (${cite(holder)}). ` +
        `Subsequent updates queued behind that lock (${cite(waits)}), so ${t.dep}'s queries hit their statement timeout and ${t.app}'s calls to ${t.dep} timed out (${cite(timeouts)}). ` +
        `${t.app}'s connection pool to ${t.dep} saturating (${cite(pool)}) and the ${t.edge} 504s (${cite(edge)}) are downstream symptoms. ` +
        `The fix is to kill the idle-in-transaction session, not to add capacity.`,
    };
  },
};

/** The dependency's call to a third party hangs until a 30s timeout; the hang propagates up. Echoes the hand-built sample. */
export const externalHang: Scenario = {
  key: "dependency_timeout/external-hang",
  rootCause: "dependency_timeout",
  confusableWith: ["resource_exhaustion", "cascading_failure"],
  quietable: true,
  run(c) {
    const { b, t, rng } = c;
    const x = t.external;
    const url = `POST https://${x.host}${x.path}`;

    const slow: LineRef[] = spread(rng, c.onset, c.onset + 60, c.hard.count(byDifficulty(c, 2, 2, 3))).map((at, i) =>
      b.log(at, t.dep, "WARN", `${x.label} call slow: ${rng.int(3500, 6000) * (i + 1)}ms (soft threshold 2000ms) ${url}`, {
        trace: b.trace(),
        role: "cause",
        origin: true,
      }),
    );

    const depTimedOut = externalTimeout(c, 30000);
    const appTimedOut = appTimeout(c, 30000);
    const hung: LineRef[] = [];
    for (const at of spread(rng, c.onset + 60, c.onset + 260, byDifficulty(c, 2, 3, 3))) {
      const tr = b.trace();
      const id = b.entity(t.entity.prefix);
      hung.push(b.log(at, t.dep, "ERROR", depTimedOut(), { trace: tr, role: "cause" }));
      hung.push(b.log(at + 0.3, t.app, "ERROR", appTimedOut(id), { trace: tr, role: "cause" }));
    }

    const pool = poolSaturation(c, c.onset + 200, byDifficulty(c, 2, 3, 5));
    const edge = edgeFailures(c, c.onset + 210, symptomCount(c), 503, `upstream ${t.app} returned 503 Service Unavailable`);

    return {
      title: `${t.route} 5xx spike`,
      alert: `${t.edge}: error rate on ${t.route} exceeded 25% for 3 minutes. Customers report failures.`,
      acceptableCauses: ["external_outage"],
      traffic: { healthyAfterOnset: 0.3 },
      explain: () =>
        `The ${x.label} (${x.host}) started responding slowly (${cite(slow)}) and then hanging until ${t.dep}'s 30s timeout, which made ${t.app}'s calls to ${t.dep} time out too (${cite(hung)}). ` +
        `Pool saturation in ${t.app} (${cite(pool)}) is resource_exhaustion but secondary, and the ${t.edge} 503s (${cite(edge)}) are the paging symptom. ` +
        `external_outage is defensible since the third party is degraded, but the observable failure is hanging calls, so dependency_timeout is the best label.`,
    };
  },
};

// ---------------------------------------------------------------------------
// resource_exhaustion

/** A slow heap leak in the app ends in OOM kills and a crash loop. */
export const memoryLeakOom: Scenario = {
  key: "resource_exhaustion/memory-leak-oom",
  rootCause: "resource_exhaustion",
  confusableWith: ["bad_deploy", "cascading_failure", "dependency_timeout"],
  quietable: true,
  run(c) {
    const { b, t, rng } = c;
    // Heap creeps up well before the crash — the earliest, quietest signal.
    const heapStart = Math.max(30, c.onset - rng.float(300, 500));
    const heap: LineRef[] = spread(rng, heapStart, c.onset, c.hard.count(byDifficulty(c, 2, 3, 3))).map((at, i, all) =>
      b.log(
        at,
        t.app,
        "WARN",
        `heap usage ${78 + Math.round((i / all.length) * 18)}% after full GC (old gen not reclaimed), GC overhead ${20 + i * 15}%`,
        { role: "cause", origin: true },
      ),
    );

    const crashes: LineRef[] = [];
    const restarts: LineRef[] = [];
    let at = c.onset;
    const ver = `v${rng.int(1, 4)}.${rng.int(2, 30)}.${rng.int(0, 9)}`;
    const noun = t.entity.noun;
    const oom = c.hard.phrases("out-of-memory", [
      () => `java.lang.OutOfMemoryError: Java heap space (at ${noun}Cache.put)`,
      () => `Exception in thread "worker-${c.hard.rng.int(1, 16)}" java.lang.OutOfMemoryError: Java heap space`,
      () => `fatal: heap exhausted while growing ${noun}Cache (requested 64MB, max 1536MB)`,
      () => `JVM terminating after OutOfMemoryError in ${noun}Cache.put; heap dump written to /tmp/heap.hprof`,
    ]);
    const killed = c.hard.phrases("oom-killed", [
      (pod: string, n: number) => `container ${pod} killed: OOMKilled (memory limit 2Gi), restart count ${n}`,
      (pod: string, n: number) => `kubelet: ${pod} terminated (reason OOMKilled, exit code 137), restarts=${n}`,
      (pod: string, n: number) => `pod ${pod} exceeded its 2Gi memory limit and was killed (restart #${n})`,
      (pod: string, n: number) => `oom-killer: killed process 1 in ${pod}, cgroup memory limit reached (restart ${n})`,
    ]);
    for (let i = 0; i < byDifficulty(c, 2, 3, 3); i++) {
      crashes.push(b.log(at, t.app, "FATAL", oom(), { role: "cause" }));
      const pod = `${t.app}-${rng.int(0, 2)}`;
      crashes.push(b.log(at + 1, t.app, "ERROR", killed(pod, i + 1), { role: "cause" }));
      restarts.push(b.log(at + rng.float(20, 35), t.app, "INFO", `started ${t.app} ${ver}, pid 1, warming ${t.entity.noun} cache`, { role: "symptom" }));
      at += rng.float(140, 220);
    }

    const edge = edgeFailures(c, c.onset + 2, symptomCount(c), 502, `upstream ${t.app} connection reset (no healthy upstream)`);

    return {
      title: `Intermittent 502s on ${t.route}`,
      alert: `${t.edge}: 502 rate on ${t.route} above 10% in repeated bursts over the last 15 minutes.`,
      traffic: { healthyAfterOnset: 0.4 },
      explain: () =>
        `${t.app}'s heap filled steadily with old-gen objects that full GCs could not reclaim (${cite(heap)}) until it hit OutOfMemoryError and was OOMKilled, repeatedly (${cite(crashes)}). ` +
        `The "started ${t.app}" lines (${cite(restarts)}) are crash-loop restarts of the same version ${ver}, not a deploy. ` +
        `The bursts of ${t.edge} 502s (${cite(edge)}) line up with each crash.`,
    };
  },
};

/** The database's data volume fills up; writes fail. */
export const dbDiskFull: Scenario = {
  key: "resource_exhaustion/db-disk-full",
  rootCause: "resource_exhaustion",
  confusableWith: ["data_integrity", "dependency_timeout", "config_error"],
  quietable: true,
  run(c) {
    const { b, t, rng } = c;
    const pg = t.dbKind === "postgres";
    const vol = pg ? "/var/lib/postgresql/data" : "/var/lib/mysql";

    const usage: LineRef[] = spread(rng, c.onset - 400, c.onset - 20, c.hard.count(byDifficulty(c, 2, 2, 3))).map((at, i, all) =>
      b.log(at, t.db, "WARN", `disk usage ${90 + Math.round(((i + 1) / all.length) * 9)}% on ${vol} (WAL/binlog growth ${rng.int(400, 900)}MB/h)`, {
        role: "cause",
        origin: true,
      }),
    );

    const full: LineRef[] = spread(rng, c.onset, c.onset + 200, byDifficulty(c, 2, 3, 3)).map((at) =>
      b.log(
        at,
        t.db,
        "ERROR",
        pg
          ? `could not extend file "base/16384/${rng.int(20000, 40000)}": No space left on device`
          : `[ERROR] [MY-012639] InnoDB: Write to file ./${t.table}.ibd failed: No space left on device`,
        { role: "cause" },
      ),
    );

    const insertFailed = c.hard.phrases("insert-failed", [
      (id: string) => `insert into ${t.table} failed for ${id}: ${pg ? "could not extend file" : "error 1114: The table is full"}`,
      (id: string) => `could not save ${t.entity.noun} ${id}: database rejected the write (${pg ? "disk full" : "table full"})`,
      (id: string) => `${t.table}.insert(${id}) -> ${pg ? "DiskFullError" : "ER_RECORD_FILE_FULL"}`,
      (id: string) => `write path failed for ${id}: ${t.db} returned ${pg ? "SQLSTATE 53100" : "errno 1114"}`,
    ]);
    const writes: LineRef[] = spread(rng, c.onset + 1, c.onset + 220, byDifficulty(c, 2, 3, 3)).map((at) =>
      b.log(at, t.app, "ERROR", insertFailed(b.entity(t.entity.prefix)), {
        trace: b.trace(),
        role: "cause",
      }),
    );

    const edge = edgeFailures(c, c.onset + 5, symptomCount(c), 500, `upstream ${t.app} returned 500 Internal Server Error`);

    return {
      title: `${t.route} returning 500s`,
      alert: `${t.edge}: 500 rate on ${t.route} above 30% for 4 minutes. Reads look healthy.`,
      traffic: { healthyAfterOnset: 0.5 },
      explain: () =>
        `${t.db}'s data volume climbed past 90% (${cite(usage)}) and then filled, so every write failed with "No space left on device" (${cite(full)}). ` +
        `${t.app}'s ${t.table} inserts fail as a direct result (${cite(writes)}); reads keep working, which is why only writes surface as ${t.edge} 500s (${cite(edge)}). ` +
        `The insert errors look like data problems but the data is fine; it is storage.`,
    };
  },
};
