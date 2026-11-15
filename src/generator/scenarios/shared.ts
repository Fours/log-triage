import type { LineRef } from "../builder.js";
import { byDifficulty, type Ctx } from "../context.js";
import type { Phrased } from "../hardness.js";
import { spread } from "../rng.js";

/** How many symptom lines to emit: harder incidents bury the cause under more of them. */
export const symptomCount = (c: Ctx) => byDifficulty(c, 4, 7, 12);

/**
 * User-facing failures at the edge — what usually pages. Always a symptom:
 * the edge is downstream of every fault in these topologies.
 */
export function edgeFailures(c: Ctx, from: number, count: number, status: number, detail: string): LineRef[] {
  const { b, t, rng } = c;
  return spread(rng, from, c.end, count).map((at) =>
    b.log(at, t.edge, "ERROR", `${t.route} ${status} ${rng.int(4900, 30100)}ms: ${detail}`, {
      trace: b.trace(),
      role: "symptom",
    }),
  );
}

/** The app's outbound HTTP pool to the dependency filling up — a classic secondary symptom. */
export function poolSaturation(c: Ctx, from: number, count: number): LineRef[] {
  const { b, t, rng } = c;
  let queued = rng.int(8, 20);
  return spread(rng, from, Math.min(c.end, from + 240), count).map((at, i, all) => {
    queued += rng.int(10, 30);
    const last = i === all.length - 1;
    return last
      ? b.log(at, t.app, "ERROR", `pool checkout timeout: no connection to ${t.dep} available after 5000ms`, { role: "symptom" })
      : b.log(at, t.app, "WARN", `HTTP connection pool to ${t.dep} at capacity (50/50 in use), ${queued} requests queued`, { role: "symptom" });
  });
}

/**
 * The app's call to the dependency timing out, worded the way different HTTP
 * clients log it. Variant 0 is the v1 message.
 */
export function appTimeout(c: Ctx, ms: number): (id: string) => Phrased {
  const { t } = c;
  return c.hard.phrases("app-timeout", [
    (id: string) => `${t.depClient} timed out after ${ms}ms calling ${t.dep} ${t.depCall} (${id})`,
    (id: string) => `upstream request to ${t.dep} failed: ReadTimeout (read timeout=${ms / 1000}s) [${id}]`,
    (id: string) => `${t.depCall} -> ${t.dep}: context deadline exceeded after ${(ms / 1000).toFixed(1)}s (${id})`,
    (id: string) => `gave up waiting on ${t.dep} for ${id}: no response in ${ms} ms`,
  ]);
}

/** The dependency's call to the third party hanging until its timeout. Variant 0 is the v1 message. */
export function externalTimeout(c: Ctx, ms: number): () => Phrased {
  const x = c.t.external;
  const url = `POST https://${x.host}${x.path}`;
  return c.hard.phrases("external-timeout", [
    () => `${x.label} call FAILED: upstream timeout after ${ms}ms ${url}`,
    // Only variants 0 and 2 name the host, so neither cycling pair shares a host-name search.
    () => `call to the ${x.label} aborted: no response within ${ms / 1000}s`,
    () => `HTTP client: read timed out after ${ms} ms waiting for ${x.host}`,
    () => `${x.label} request abandoned, socket idle ${(ms / 1000).toFixed(1)}s`,
  ]);
}

export function version(c: Ctx): { prev: string; next: string } {
  const major = c.rng.int(1, 5);
  const minor = c.rng.int(2, 30);
  const patch = c.rng.int(0, 9);
  return { prev: `v${major}.${minor}.${patch}`, next: `v${major}.${minor + 1}.0` };
}

export function pid(c: Ctx): number {
  return c.rng.int(1000, 60000);
}
