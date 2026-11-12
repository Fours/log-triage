import { cite, type LineRef } from "../builder.js";
import { byDifficulty, isHard, type Scenario } from "../context.js";
import { spread } from "../rng.js";
import { edgeFailures, symptomCount, version } from "./shared.js";

// ---------------------------------------------------------------------------
// poison_message

/** One malformed message fails to parse, is redelivered forever, and blocks its partition. */
export const deserializeLoop: Scenario = {
  key: "poison_message/redelivery-loop",
  rootCause: "poison_message",
  confusableWith: ["resource_exhaustion", "data_integrity", "dependency_timeout"],
  run(c) {
    const { b, t, rng } = c;
    const msg = `msg-${rng.int(100000, 999999)}`;
    const partition = rng.int(0, 11);
    const offset = rng.int(100000, 900000);
    const pos = rng.int(200, 2000);

    const failures: LineRef[] = [];
    let attempt = 1;
    for (const at of spread(rng, c.onset, c.onset + 300, byDifficulty(c, 3, 4, 5))) {
      failures.push(
        b.log(at, t.consumer, "ERROR", `failed to process ${msg} (partition ${partition}, offset ${offset}): JSON parse error: unexpected token '\\u0000' at position ${pos}`, {
          role: "cause",
        }),
      );
      attempt += rng.int(3, 9);
      failures.push(b.log(at + 0.5, t.consumer, "WARN", `nack ${msg}, redelivering (attempt ${attempt}, no max-retries configured)`, { role: "cause" }));
    }

    const lag: LineRef[] = spread(rng, c.onset + 120, c.end, symptomCount(c)).map((at, i) =>
      b.log(at, t.consumer, "WARN", `consumer lag on ${t.queue} partition ${partition}: ${(i + 1) * rng.int(600, 1400)} messages behind (${(i + 1) * rng.int(40, 90)}s)`, {
        role: "symptom",
      }),
    );
    const stale: LineRef[] = spread(rng, c.onset + 200, c.end, byDifficulty(c, 3, 4, 6)).map((at) =>
      b.log(at, t.app, "ERROR", `${t.entity.noun} ${b.entity(t.entity.prefix)} timed out waiting for downstream confirmation (120s), marked failed`, {
        trace: b.trace(),
        role: "symptom",
      }),
    );

    return {
      title: `${t.queue} backlog growing`,
      alert: `Queue monitor: consumer lag on ${t.queue} above 5 minutes and rising. ${t.consumer} CPU normal.`,
      traffic: { healthyAfterOnset: 1, quietAfterOnset: [t.consumer] },
      explain: () =>
        `${msg} at partition ${partition} offset ${offset} contains bytes ${t.consumer} cannot parse. It is nacked and redelivered forever because no max-retries/DLQ is configured (${cite(failures)}). ` +
        `That message blocks its partition, so lag grows (${cite(lag)}) and downstream work stalls (${cite(stale)}). ` +
        `The consumer has capacity — it's stuck on one message. Dead-letter ${msg} and add a retry limit.`,
    };
  },
};

/** A message triggers an unhandled exception that crashes the consumer; on restart it resumes at the same offset. */
export const crashLoop: Scenario = {
  key: "poison_message/consumer-crash-loop",
  rootCause: "poison_message",
  confusableWith: ["resource_exhaustion", "bad_deploy"],
  run(c) {
    const { b, t, rng } = c;
    const msg = `msg-${rng.int(100000, 999999)}`;
    const offset = rng.int(100000, 900000);
    const v = version(c).prev;

    const crashes: LineRef[] = [];
    const restarts: LineRef[] = [];
    let at = c.onset;
    for (let i = 0; i < byDifficulty(c, 3, 3, 4); i++) {
      crashes.push(
        b.log(at, t.consumer, "FATAL", `unhandled exception processing ${msg} (offset ${offset}): RangeError: Maximum call stack size exceeded at expandReferences`, {
          role: "cause",
        }),
      );
      restarts.push(b.log(at + 0.3, t.consumer, "ERROR", `process exited with code 1, restarting (restart ${i + 1}, backoff ${10 * 2 ** i}s)`, { role: "symptom" }));
      restarts.push(b.log(at + 10 * 2 ** i, t.consumer, "INFO", `started ${t.consumer} ${v}, pid 1`, { role: "symptom" }));
      crashes.push(b.log(at + 10 * 2 ** i + 1, t.consumer, "INFO", `resuming ${t.queue} at committed offset ${offset}`, { role: "cause" }));
      at += 10 * 2 ** i + rng.float(3, 8);
    }

    const lag: LineRef[] = spread(rng, c.onset + 60, c.end, symptomCount(c)).map((a, i) =>
      b.log(a, t.app, "WARN", `publish to ${t.queue} slow: broker reports consumer group ${t.consumer} lag ${(i + 1) * rng.int(800, 2000)}`, { role: "symptom" }),
    );

    return {
      title: `${t.consumer} restarting repeatedly`,
      alert: `Kubernetes: ${t.consumer} in CrashLoopBackOff; ${t.queue} lag rising.`,
      traffic: { healthyAfterOnset: 1, quietAfterOnset: [t.consumer] },
      explain: () =>
        `${t.consumer} crashes with an unhandled exception every time it processes ${msg} at offset ${offset}, and on each restart resumes at that same committed offset (${cite(crashes)}). ` +
        `The restarts (${cite(restarts)}) run the same version ${v} — not a deploy — and the lag (${cite(lag)}) is the consequence. ` +
        `Skip/dead-letter offset ${offset} and harden the handler.`,
    };
  },
};

// ---------------------------------------------------------------------------
// data_integrity

/** A schema migration fails half-applied; the app queries a column that doesn't exist. */
export const failedMigration: Scenario = {
  key: "data_integrity/partial-migration",
  rootCause: "data_integrity",
  confusableWith: ["bad_deploy", "config_error"],
  run(c) {
    const { b, t, rng } = c;
    const num = String(rng.int(30, 140)).padStart(4, "0");
    const col = rng.pick(["currency_code", "region_id", "status_v2", "tenant_id"]);
    const name = `${num}_add_${col}`;
    const pg = t.dbKind === "postgres";
    const at0 = c.onset - rng.float(20, 60);

    const migration: LineRef[] = [
      b.log(at0, t.app, "INFO", `migrate: applying ${name} (3 steps) to ${t.db}`, { role: "cause" }),
      b.log(at0 + 2, t.app, "INFO", `migrate: ${name} step 1/3 ok: renamed column ${t.table}.${col} -> ${col}_old`, { role: "cause" }),
      b.log(
        at0 + rng.float(8, 20),
        t.app,
        isHard(c) ? "WARN" : "ERROR",
        `migrate: ${name} step 2/3 failed: lock timeout on ${t.table}; step 1 already committed (non-transactional DDL), not rolled back`,
        { role: "cause" },
      ),
    ];

    const missing: LineRef[] = spread(rng, c.onset, c.onset + 240, byDifficulty(c, 3, 4, 4)).map((at) =>
      b.log(
        at,
        t.db,
        "ERROR",
        pg ? `column "${col}" of relation "${t.table}" does not exist at character ${rng.int(30, 140)}` : `Unknown column '${col}' in 'field list'`,
        { role: "cause" },
      ),
    );
    const appErrors: LineRef[] = spread(rng, c.onset + 1, c.end, byDifficulty(c, 2, 4, 6)).map((at) =>
      b.log(at, t.app, "ERROR", `query on ${t.table} failed for ${b.entity(t.entity.prefix)}: ${pg ? `column "${col}" does not exist` : `Unknown column '${col}'`}`, {
        trace: b.trace(),
        role: "symptom",
      }),
    );
    const edge = edgeFailures(c, c.onset + 2, symptomCount(c), 500, `upstream ${t.app} returned 500 Internal Server Error`);

    return {
      title: `${t.route} mostly failing`,
      alert: `${t.edge}: 500 rate on ${t.route} above 50% for 2 minutes.`,
      acceptableCauses: ["bad_deploy"],
      traffic: { healthyAfterOnset: 0.1 },
      explain: () =>
        `Migration ${name} renamed ${t.table}.${col} in step 1, then failed in step 2 without rolling back (${cite(migration)}). ` +
        `The schema is now in a state no code version expects: the column "${col}" no longer exists (${cite(missing)}), so ${t.app}'s queries fail (${cite(appErrors)}) and ${t.edge} returns 500s (${cite(edge)}). ` +
        `Migrations ship with releases, so bad_deploy is defensible, but the fault is the half-applied schema change. Finish or revert step 1.`,
    };
  },
};

/** After a table restore, the id sequence is behind existing rows; inserts collide. */
export const duplicateKey: Scenario = {
  key: "data_integrity/sequence-collision",
  rootCause: "data_integrity",
  confusableWith: ["bad_deploy", "config_error", "dependency_timeout"],
  run(c) {
    const { b, t, rng } = c;
    const pg = t.dbKind === "postgres";
    const rows = rng.int(200000, 4000000);
    const restoreAt = c.onset - rng.float(30, 120);

    const restore: LineRef[] = [
      b.log(restoreAt, t.db, isHard(c) ? "INFO" : "WARN", `restore: table ${t.table} reloaded from snapshot (${rows} rows); ${pg ? `sequence ${t.table}_id_seq` : "AUTO_INCREMENT"} left at ${rows - rng.int(5000, 20000)}`, {
        role: "cause",
      }),
    ];

    let id = rows - rng.int(3000, 4000);
    const collisions: LineRef[] = spread(rng, c.onset, c.onset + 260, byDifficulty(c, 3, 4, 5)).map((at) => {
      id += rng.int(1, 5);
      return b.log(
        at,
        t.db,
        "ERROR",
        pg
          ? `duplicate key value violates unique constraint "${t.table}_pkey" DETAIL: Key (id)=(${id}) already exists.`
          : `Duplicate entry '${id}' for key '${t.table}.PRIMARY'`,
        { role: "cause" },
      );
    });

    const appErrors: LineRef[] = spread(rng, c.onset + 1, c.end, byDifficulty(c, 2, 4, 6)).map((at) =>
      b.log(at, t.app, "ERROR", `create ${t.entity.noun} failed: unique violation on ${t.table}.id, returning 409`, { trace: b.trace(), role: "symptom" }),
    );
    const edge = edgeFailures(c, c.onset + 2, symptomCount(c), 500, `upstream ${t.app} returned 500 (create failed)`);

    return {
      title: `New ${t.entity.noun}s failing to save`,
      alert: `${t.edge}: error rate on ${t.route} above 20%; customers report "could not save" errors.`,
      traffic: { healthyAfterOnset: 0.5 },
      explain: () =>
        `${t.table} was restored from a snapshot but its id ${pg ? "sequence" : "AUTO_INCREMENT"} was left behind the restored rows (${cite(restore)}). ` +
        `New inserts are handed ids that already exist and violate the primary key (${cite(collisions)}). ` +
        `${t.app}'s create failures (${cite(appErrors)}) and ${t.edge} errors (${cite(edge)}) follow. Reset the sequence past max(id).`,
    };
  },
};
