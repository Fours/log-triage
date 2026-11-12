import { cite, type LineRef } from "../builder.js";
import { byDifficulty, isHard, type Scenario } from "../context.js";
import { hex } from "../noise.js";
import { spread } from "../rng.js";
import { cap } from "../topologies.js";
import { edgeFailures, symptomCount, version } from "./shared.js";

// ---------------------------------------------------------------------------
// bad_deploy

/** A new app release throws on a code path some requests hit. */
export const newVersionException: Scenario = {
  key: "bad_deploy/new-version-exception",
  rootCause: "bad_deploy",
  confusableWith: ["data_integrity", "config_error"],
  run(c) {
    const { b, t, rng } = c;
    const v = version(c);
    const field = rng.pick(["currency", "locale", "region", "tier"]);
    const file = `${t.entity.noun}-formatter.ts:${rng.int(40, 220)}`;
    const deployAt = c.onset - rng.float(30, 90);

    const deploy: LineRef[] = [
      b.log(deployAt, t.app, "INFO", `deploy: rolling out ${t.app} ${v.next} (build ${hex(c)}), replacing ${v.prev}`, { role: "cause" }),
      b.log(deployAt + rng.float(20, 40), t.app, "INFO", `started ${t.app} ${v.next}, pid 1, ready`, { role: "cause" }),
    ];

    const errors: LineRef[] = spread(rng, c.onset, c.onset + 240, byDifficulty(c, 3, 4, 4)).map((at) =>
      b.log(
        at,
        t.app,
        "ERROR",
        `unhandled error in ${t.route} (${b.entity(t.entity.prefix)}): TypeError: Cannot read properties of undefined (reading '${field}') at format (${file}) [${v.next}]`,
        { trace: b.trace(), role: "cause" },
      ),
    );

    const edge = edgeFailures(c, c.onset + 2, symptomCount(c), 500, `upstream ${t.app} returned 500 Internal Server Error`);

    return {
      title: `Partial 500s on ${t.route}`,
      alert: `${t.edge}: 500 rate on ${t.route} at ${rng.int(8, 20)}% (baseline <0.5%) for 5 minutes.`,
      traffic: { healthyAfterOnset: isHard(c) ? 0.7 : 0.5 },
      explain: () =>
        `${t.app} ${v.next} rolled out shortly before onset (${cite(deploy)}). Right after, ${t.app} started throwing a TypeError in the new formatter code, tagged with ${v.next} (${cite(errors)}). ` +
        `Only requests that hit that path fail, so most traffic still succeeds and the ${t.edge} 500s are partial (${cite(edge)}). ` +
        `It looks like bad input data, but the field is missing for any ${t.entity.noun} without '${field}' — a code regression. Roll back to ${v.prev}.`,
    };
  },
};

/** The dependency ships a release that changes its response shape; the app can't decode it. */
export const contractChange: Scenario = {
  key: "bad_deploy/dependency-contract-change",
  rootCause: "bad_deploy",
  confusableWith: ["data_integrity", "config_error", "dependency_timeout"],
  run(c) {
    const { b, t, rng } = c;
    const v = version(c);
    const deployAt = c.onset - rng.float(20, 60);

    const deploy: LineRef[] = [
      b.log(deployAt, t.dep, "INFO", `deploy: rolling out ${t.dep} ${v.next} (build ${hex(c)}), replacing ${v.prev}`, { role: "cause" }),
      b.log(deployAt + rng.float(15, 30), t.dep, "INFO", `started ${t.dep} ${v.next}: response serializer v2 enabled`, { role: "cause" }),
    ];

    const decode: LineRef[] = spread(rng, c.onset, c.onset + 240, byDifficulty(c, 3, 4, 4)).map((at) => {
      const id = b.entity(t.entity.prefix);
      return b.log(
        at,
        t.app,
        "ERROR",
        `failed to decode ${t.dep} ${t.depCall} response for ${id}: missing required field "status" (got keys: id, state, updatedAt)`,
        { trace: b.trace(), role: "cause" },
      );
    });

    const edge = edgeFailures(c, c.onset + 2, symptomCount(c), 502, `upstream ${t.app} returned 502 Bad Gateway`);

    return {
      title: `${t.route} 502s`,
      alert: `${t.edge}: 502 rate on ${t.route} above 40% for 3 minutes.`,
      traffic: { healthyAfterOnset: 0.15 },
      explain: () =>
        `${t.dep} ${v.next} rolled out with a new response serializer (${cite(deploy)}) that renamed "status" to "state". ` +
        `From then on ${t.app} cannot decode ${t.dep}'s responses (${cite(decode)}), which surfaces as ${t.edge} 502s (${cite(edge)}). ` +
        `${t.dep} itself logs no errors — the break is the contract, introduced by the release. Roll back ${t.dep}.`,
    };
  },
};

// ---------------------------------------------------------------------------
// config_error

/** A config push points the app at the wrong port for the dependency. */
export const wrongEndpoint: Scenario = {
  key: "config_error/wrong-endpoint",
  rootCause: "config_error",
  confusableWith: ["dependency_timeout", "external_outage", "bad_deploy"],
  run(c) {
    const { b, t, rng } = c;
    const rev = rng.int(300, 900);
    const key = `${t.dep.replace(/-/g, "_").toUpperCase()}_URL`;
    const port = rng.pick([8081, 9090, 8443]);
    const ip = `10.${rng.int(0, 40)}.${rng.int(0, 255)}.${rng.int(2, 250)}`;
    const at0 = c.onset - rng.float(5, 20);
    // In hard mode the config change rides along with a deploy, so bad_deploy is defensible.
    const v = version(c);

    const change: LineRef[] = [];
    if (isHard(c)) {
      change.push(b.log(at0 - 25, t.app, "INFO", `deploy: rolling out ${t.app} ${v.next} (build ${hex(c)}) with config revision ${rev}`, { role: "cause" }));
    }
    change.push(
      b.log(at0, t.app, "INFO", `config reloaded from config-service (revision ${rev}): 1 key changed: ${key}=http://${t.dep}.internal:${port}`, { role: "cause" }),
    );

    const refused: LineRef[] = spread(rng, c.onset, c.onset + 240, byDifficulty(c, 3, 4, 4)).map((at) =>
      b.log(at, t.app, "ERROR", `${t.depClient} failed: connect ECONNREFUSED ${ip}:${port} (${t.dep}.internal)`, { trace: b.trace(), role: "cause" }),
    );

    const edge = edgeFailures(c, c.onset + 1, symptomCount(c), 503, `upstream ${t.app} returned 503 Service Unavailable`);

    return {
      title: `${t.route} hard down`,
      alert: `${t.edge}: ${t.route} success rate dropped to ${rng.int(0, 5)}% within one minute.`,
      acceptableCauses: isHard(c) ? ["bad_deploy"] : [],
      traffic: { healthyAfterOnset: 0.03 },
      explain: () =>
        `${cap(t.app)} picked up config revision ${rev}, which changed ${key} to port ${port} (${cite(change)}). ` +
        `${t.dep} doesn't listen there, so every call is refused immediately (${cite(refused)}) — not a timeout, and ${t.dep} itself is healthy (its routine logs continue). ` +
        `The ${t.edge} 503s are the symptom (${cite(edge)}).` +
        (isHard(c) ? ` The config revision shipped with the ${t.app} ${v.next} deploy, so bad_deploy is defensible, but the fault is the config value.` : ""),
    };
  },
};

/** A credential rotation leaves the dependency using a key the third party rejects. */
export const rotatedCredential: Scenario = {
  key: "config_error/rotated-credential",
  rootCause: "config_error",
  confusableWith: ["external_outage", "dependency_timeout"],
  run(c) {
    const { b, t, rng } = c;
    const x = t.external;
    const hostParts = x.host.split(".");
    const secret = `${(hostParts[0] === "api" ? hostParts[1] : hostParts[0]).toUpperCase()}_API_KEY`;
    const ver = rng.int(5, 40);

    const rotation: LineRef[] = [
      b.log(c.onset - rng.float(10, 40), t.dep, isHard(c) ? "DEBUG" : "INFO", `secrets: reloaded ${secret} from secrets store (version ${ver}, previous ${ver - 1} revoked)`, {
        role: "cause",
      }),
    ];

    const rejected: LineRef[] = spread(rng, c.onset, c.onset + 240, byDifficulty(c, 3, 4, 4)).map((at) =>
      b.log(at, t.dep, "ERROR", `${x.label} rejected request: 401 Unauthorized (invalid API key) POST https://${x.host}${x.path}`, {
        trace: b.trace(),
        role: "cause",
      }),
    );

    const app: LineRef[] = spread(rng, c.onset + 3, c.end, byDifficulty(c, 2, 4, 6)).map((at) =>
      b.log(at, t.app, "ERROR", `${t.depClient} failed: ${t.dep} returned 502 (upstream ${x.label} error)`, { trace: b.trace(), role: "symptom" }),
    );
    const edge = edgeFailures(c, c.onset + 4, symptomCount(c), 502, `upstream ${t.app} returned 502 Bad Gateway`);

    return {
      title: `${t.route} failing across the board`,
      alert: `${t.edge}: 502 rate on ${t.route} above 60% for 3 minutes.`,
      traffic: { healthyAfterOnset: 0.05 },
      explain: () =>
        `${t.dep} reloaded ${secret} at version ${ver} and the previous version was revoked (${cite(rotation)}); the new value is not one the ${x.label} accepts, so every call gets 401 Unauthorized (${cite(rejected)}). ` +
        `A 401 is the provider answering correctly, not an outage. ${t.app}'s 502s (${cite(app)}) and ${t.edge}'s (${cite(edge)}) are symptoms.`,
    };
  },
};
