import type { LineRef } from "../builder.js";
import { byDifficulty, type Ctx } from "../context.js";
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

export function version(c: Ctx): { prev: string; next: string } {
  const major = c.rng.int(1, 5);
  const minor = c.rng.int(2, 30);
  const patch = c.rng.int(0, 9);
  return { prev: `v${major}.${minor}.${patch}`, next: `v${major}.${minor + 1}.0` };
}

export function pid(c: Ctx): number {
  return c.rng.int(1000, 60000);
}
