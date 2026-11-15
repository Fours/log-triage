import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { DATASETS, DEFAULT_SEED, QUIETABLE, SCENARIOS, TEST_SET, generateDataset, generateDatasetFor, type GeneratedIncident } from "../src/generator/index.js";
import { quietAtMedium } from "../src/generator/hardness.js";
import { DECOYS } from "../src/generator/decoys.js";
import { TOPOLOGIES, servicesOf } from "../src/generator/topologies.js";
import { buildManifest } from "../src/generator/manifest.js";
import { ROOT_CAUSE_CATEGORIES } from "../src/types.js";
import { loadIncident } from "../src/tools.js";

/**
 * Checks the generated dataset is a fair test: balanced, reproducible, labels
 * internally consistent, and nothing in what the agent sees gives the answer
 * away. No API key needed. Run: npm run test:generator
 */

const here = dirname(fileURLToPath(import.meta.url));
const genDir = resolve(here, "../incidents/generated");
const dataset = generateDataset();
const incidents = dataset.map((d) => d.incident);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log(`Generated ${incidents.length} incidents (seed "${DEFAULT_SEED}")`);

check("40–60 incidents, every category equally represented at every difficulty", () => {
  assert.ok(incidents.length >= 40 && incidents.length <= 60);
  for (const cat of ROOT_CAUSE_CATEGORIES) {
    const ofCat = incidents.filter((i) => i.label.rootCause === cat);
    assert.equal(ofCat.length, 6, cat);
    for (const d of ["easy", "medium", "hard"] as const) {
      assert.equal(ofCat.filter((i) => i.label.difficulty === d).length, 2, `${cat}/${d}`);
    }
    assert.equal(new Set(ofCat.map((i) => i.label.scenario)).size, 2, `${cat} has two scenario variants`);
  }
});

check("generation is deterministic", () => {
  assert.deepEqual(generateDataset(), dataset);
});

check("a different seed produces a different dataset", () => {
  const other = generateDataset("another-seed");
  assert.notDeepEqual(other.map((d) => d.incident.logs), dataset.map((d) => d.incident.logs));
});

check("committed incidents/generated/ is in sync with the generator", () => {
  const files = readdirSync(genDir).filter((f) => f.startsWith("gen-") && f.endsWith(".json"));
  assert.equal(files.length, incidents.length, "run `npm run generate`");
  for (const inc of incidents) {
    const onDisk = loadIncident(resolve(genDir, `${inc.id}.json`));
    assert.deepEqual(onDisk, inc, `${inc.id} is stale — run \`npm run generate\``);
  }
  const manifest = JSON.parse(readFileSync(resolve(genDir, "manifest.json"), "utf8"));
  assert.equal(manifest.count, incidents.length);
});

check("line numbers are contiguous and timestamps never go backwards", () => {
  for (const inc of incidents) {
    inc.logs.forEach((l, i) => {
      assert.equal(l.n, i + 1, inc.id);
      if (i > 0) assert.ok(l.ts >= inc.logs[i - 1].ts, `${inc.id} #${l.n} out of order`);
    });
  }
});

check("trace and entity ids increase down the log, with no unresolved placeholders", () => {
  for (const inc of incidents) {
    const firstSeen = (re: RegExp) => {
      const seen: number[] = [];
      const known = new Set<string>();
      for (const l of inc.logs) {
        for (const m of `${l.traceId ?? ""} ${l.msg}`.matchAll(re)) {
          if (!known.has(m[0])) {
            known.add(m[0]);
            seen.push(Number(m[1]));
          }
        }
      }
      return seen;
    };
    for (const ids of [firstSeen(/\bt-(\d+)\b/g), firstSeen(/\b[opmue]-(\d+)\b/g)]) {
      ids.forEach((id, i) => i > 0 && assert.ok(id > ids[i - 1], `${inc.id}: id ${id} appears after ${ids[i - 1]}`));
    }
    const all = JSON.stringify(inc);
    assert.ok(!all.includes("\u27e6"), `${inc.id} has an unresolved id placeholder`);
  }
});

check("every service that logs is listed, and every listed service logs", () => {
  for (const inc of incidents) {
    const logging = new Set(inc.logs.map((l) => l.service));
    assert.deepEqual([...logging].sort(), [...inc.services].sort(), inc.id);
  }
});

check("evidence lines exist, and the explanation only cites real lines", () => {
  for (const inc of incidents) {
    const { evidenceLines, explanation } = inc.label;
    assert.ok(evidenceLines.length >= 3, `${inc.id} has too little evidence`);
    for (const n of evidenceLines) assert.ok(n >= 1 && n <= inc.logs.length, `${inc.id} cites #${n}`);
    // Only numbers in "line N" / "lines N, M" lists are line refs.
    for (const list of explanation.matchAll(/lines? ((?:\d+(?:, )?)+)/g)) {
      for (const n of list[1].split(", ").map(Number)) {
        assert.ok(n >= 1 && n <= inc.logs.length, `${inc.id} explanation cites missing line ${n}`);
      }
    }
    for (const n of evidenceLines) assert.ok(new RegExp(`\\b${n}\\b`).test(explanation), `${inc.id} evidence #${n} unexplained`);
  }
});

check("the answer isn't just 'every ERROR line': each incident has error-level symptoms outside the evidence", () => {
  for (const inc of incidents) {
    const evidence = new Set(inc.label.evidenceLines);
    const errorsOutside = inc.logs.filter((l) => (l.level === "ERROR" || l.level === "FATAL") && !evidence.has(l.n));
    assert.ok(errorsOutside.length >= 3, `${inc.id}: only ${errorsOutside.length} non-evidence errors`);
  }
});

check("nothing the agent sees names a category or labels a line", () => {
  const banned = [...ROOT_CAUSE_CATEGORIES, "root cause", "red herring", "symptom", "herring"];
  for (const inc of incidents) {
    const visible = [inc.id, inc.title, inc.alert, ...inc.logs.map((l) => l.msg)].join("\n").toLowerCase();
    for (const word of banned) assert.ok(!visible.includes(word.toLowerCase()), `${inc.id} leaks "${word}"`);
  }
});

check("ids are opaque and don't encode the category", () => {
  for (const inc of incidents) assert.match(inc.id, /^gen-\d{3}$/);
});

check("acceptable causes never repeat the primary root cause; some incidents are ambiguous", () => {
  for (const inc of incidents) assert.ok(!inc.label.acceptableCauses.includes(inc.label.rootCause), inc.id);
  const ambiguous = incidents.filter((i) => i.label.acceptableCauses.length > 0).length;
  assert.ok(ambiguous >= 6, `only ${ambiguous} ambiguous incidents`);
});

check("difficulty scales the haystack: hard incidents are bigger and carry ≥3 red-herring lines", () => {
  const avg = (d: string) => {
    const xs = dataset.filter((g) => g.incident.label.difficulty === d).map((g) => g.meta.lines);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  assert.ok(avg("easy") < avg("medium") && avg("medium") < avg("hard"), `easy ${avg("easy")} medium ${avg("medium")} hard ${avg("hard")}`);
  for (const g of dataset.filter((g) => g.incident.label.difficulty === "hard")) {
    assert.ok(g.meta.herringLines >= 3, `${g.incident.id} has ${g.meta.herringLines} herring lines`);
  }
});

check("logs exceed one search page, so the agent must filter", () => {
  for (const inc of incidents) assert.ok(inc.logs.length > 100, `${inc.id} has only ${inc.logs.length} lines`);
});

check("a 'first ERROR line' heuristic misses in a meaningful share of incidents", () => {
  const misses = dataset.filter((g) => !g.meta.firstErrorIsEvidence).length;
  assert.ok(misses >= incidents.length / 4, `first-error heuristic only misses ${misses}/${incidents.length}`);
});

check("held-out test set: in sync on disk, distinct ids, no incident shared with the dev set", () => {
  const test = generateDataset(TEST_SET.seed, TEST_SET).map((d) => d.incident);
  const testDir = resolve(here, "../incidents/test");
  for (const inc of test) {
    assert.match(inc.id, /^test-\d{3}$/);
    assert.deepEqual(loadIncident(resolve(testDir, `${inc.id}.json`)), inc, `${inc.id} is stale — run \`npm run generate -- --test\``);
  }
  // Same balance as the dev set.
  for (const cat of ROOT_CAUSE_CATEGORIES) assert.equal(test.filter((i) => i.label.rootCause === cat).length, 6, cat);
  // No dev incident reappears: different logs, and each scenario × difficulty sits on a different topology.
  const devLogs = new Set(incidents.map((i) => JSON.stringify(i.logs.map((l) => l.msg))));
  for (const inc of test) assert.ok(!devLogs.has(JSON.stringify(inc.logs.map((l) => l.msg))), `${inc.id} duplicates a dev incident`);
  const placement = (i: (typeof incidents)[number]) => `${i.label.scenario}/${i.label.difficulty}/${[...i.services].sort().join(",")}`;
  const devPlacements = new Set(incidents.map(placement));
  assert.equal(test.filter((i) => devPlacements.has(placement(i))).length, 0, "a scenario landed on the same services as in the dev set");
});

console.log("\nGenerator v2 (sets are generated, not committed: only their manifests are)");

check("version 1 is the default, and asking for it explicitly changes nothing", () => {
  assert.deepEqual(generateDataset(DEFAULT_SEED, { version: 1 }), dataset);
  assert.deepEqual(generateDatasetFor(DATASETS.dev), dataset);
});

for (const key of ["v2Dev", "v2Test"] as const) {
  const def = DATASETS[key];
  const v2 = generateDatasetFor(def);
  const prefix = new RegExp(`^${def.idPrefix}-\\d{3}$`);

  check(`${def.dir}: deterministic, balanced, ids its own`, () => {
    assert.deepEqual(generateDatasetFor(def), v2, "same seed, same set");
    assert.equal(v2.length, 48);
    for (const { incident } of v2) assert.match(incident.id, prefix);
    for (const cat of ROOT_CAUSE_CATEGORIES) {
      for (const d of ["easy", "medium", "hard"] as const) {
        assert.equal(v2.filter((g) => g.incident.label.rootCause === cat && g.incident.label.difficulty === d).length, 2, `${cat}/${d}`);
      }
    }
    const v1Ids = new Set([...incidents, ...generateDataset(TEST_SET.seed, TEST_SET).map((g) => g.incident)].map((i) => i.id));
    assert.ok(v2.every((g) => !v1Ids.has(g.incident.id)), "no id shared with a v1 set");
  });

  check(`${def.dir}: committed manifest matches a fresh generation, hash for hash`, () => {
    const committed = JSON.parse(readFileSync(resolve(here, "..", def.dir, "manifest.json"), "utf8"));
    const fresh = buildManifest(v2, { version: 2, seed: def.seed, idPrefix: def.idPrefix, topologyShift: def.topologyShift, hashes: true });
    assert.equal(committed.generatorVersion, 2);
    assert.ok(committed.incidents.every((m: { sha256?: string }) => /^[0-9a-f]{64}$/.test(m.sha256 ?? "")), "every incident hashed");
    assert.deepEqual(committed, JSON.parse(JSON.stringify(fresh)), `stale: run \`npm run generate -- --v2${key === "v2Test" ? " --test" : ""}\``);
  });
}

console.log("\nGenerator v2: quiet causes and paraphrased evidence (T2)");

const LOUD = new Set(["WARN", "ERROR", "FATAL"]);
const scenarioByKey = new Map(Object.values(SCENARIOS).flat().map((sc) => [sc.key, sc]));
const v2Sets = (["v2Dev", "v2Test"] as const).map((k) => ({ def: DATASETS[k], set: generateDatasetFor(DATASETS[k]) }));
const v2All: GeneratedIncident[] = v2Sets.flatMap((x) => x.set);
const originLevels = (g: GeneratedIncident) => g.info.origins.map((n) => g.incident.logs[n - 1].level);

/**
 * A run of `min` characters shared by every line, after masking numbers (ids,
 * timings, counts) and service names (the `service` filter already finds those,
 * so a shared service name gives a phrase search no extra reach).
 */
function sharedRun(lines: string[], min: number, services: string[]): string | null {
  const byLength = [...services].sort((x, y) => y.length - x.length);
  const masked = lines.map((l) => byLength.reduce((acc, svc) => acc.split(svc).join("<svc>"), l).replace(/\d+/g, "#"));
  const shortest = [...masked].sort((x, y) => x.length - y.length)[0];
  for (let i = 0; i + min <= shortest.length; i++) {
    const w = shortest.slice(i, i + min);
    if (masked.every((m) => m.includes(w))) return w;
  }
  return null;
}

check("v1 is untouched by the new features: original wording everywhere, origin lines at their v1 levels", () => {
  for (const g of [...dataset, ...generateDataset(TEST_SET.seed, TEST_SET)]) {
    for (const lines of Object.values(g.info.families)) for (const l of lines) assert.equal(l.variant, 0, g.incident.id);
  }
});

check("every scenario says whether it can be quiet, and only quietable ones mark origin lines", () => {
  assert.equal(QUIETABLE.length, 9);
  for (const g of v2All) {
    const sc = scenarioByKey.get(g.incident.label.scenario!)!;
    if (sc.quietable) assert.ok(g.info.origins.length >= 1, `${g.incident.id} (${sc.key}) has no origin lines`);
    else assert.equal(g.info.origins.length, 0, `${g.incident.id} (${sc.key}) isn't quietable but marks origin lines`);
    for (const n of g.info.origins) assert.ok(g.incident.label.evidenceLines.includes(n), `${g.incident.id}: origin line ${n} isn't evidence`);
  }
});

check("hard: every quietable scenario's origin lines are below WARN, and there are at most 3", () => {
  for (const g of v2All.filter((x) => x.incident.label.difficulty === "hard" && x.info.origins.length)) {
    const levels = originLevels(g);
    assert.ok(levels.every((l) => !LOUD.has(l)), `${g.incident.id}: origin levels ${levels}`);
    assert.ok(g.info.origins.length <= 3, `${g.incident.id}: ${g.info.origins.length} origin lines`);
  }
});

check("medium: exactly the chosen half of the quietable scenarios is quiet, the same in both sets; easy: none", () => {
  const quietKeys = QUIETABLE.filter((k) => quietAtMedium(k, QUIETABLE));
  assert.equal(quietKeys.length, 5);
  for (const g of v2All.filter((x) => x.info.origins.length && x.incident.label.difficulty !== "hard")) {
    const key = g.incident.label.scenario!;
    const quiet = g.incident.label.difficulty === "medium" && quietKeys.includes(key);
    const loud = originLevels(g).some((l) => LOUD.has(l));
    assert.equal(loud, !quiet, `${g.incident.id} (${key}, ${g.incident.label.difficulty}): expected ${quiet ? "quiet" : "loud"} origin lines`);
  }
});

check("every incident has paraphrased evidence; on medium and hard each family mixes wordings", () => {
  for (const g of v2All) {
    const families = Object.entries(g.info.families);
    assert.ok(families.length >= 1, `${g.incident.id} has no paraphrased family`);
    if (g.incident.label.difficulty === "easy") continue;
    for (const [family, lines] of families) {
      if (lines.length < 2) continue;
      assert.ok(new Set(lines.map((l) => l.variant)).size >= 2, `${g.incident.id}: family ${family} uses one wording`);
    }
  }
});

check("medium and hard: no single phrase (20+ characters, numbers and service names masked) matches every line of a family", () => {
  for (const g of v2All.filter((x) => x.incident.label.difficulty !== "easy")) {
    for (const [family, lines] of Object.entries(g.info.families)) {
      if (lines.length < 2) continue;
      const shared = sharedRun(lines.map((l) => g.incident.logs[l.n - 1].msg), 20, g.incident.services);
      assert.equal(shared, null, `${g.incident.id}: every "${family}" line contains "${shared}"`);
    }
  }
});

check("v2 incidents stay valid: evidence present, explanations cite real lines", () => {
  for (const g of v2All) {
    const { logs, label } = g.incident;
    assert.ok(label.evidenceLines.length >= 2, g.incident.id);
    const cited = [...label.explanation.matchAll(/lines? ([\d, ]+)/g)].flatMap((m) => m[1].split(",").map((x) => Number(x.trim())).filter(Boolean));
    assert.ok(cited.length > 0, `${g.incident.id}: explanation cites nothing`);
    for (const n of cited) assert.ok(n >= 1 && n <= logs.length, `${g.incident.id}: cites line ${n} of ${logs.length}`);
  }
});

console.log("\nGenerator v2: loud decoys (T3)");

const isErr = (level: string) => level === "ERROR" || level === "FATAL";
const errorsBy = (g: GeneratedIncident) => {
  const m = new Map<string, number>();
  for (const l of g.incident.logs) if (isErr(l.level)) m.set(l.service, (m.get(l.service) ?? 0) + 1);
  return m;
};
const decoyService = new Map(DECOYS.map((d) => [d.service, d]));

check("decoy services are never topology services, and v1 has none", () => {
  const topo = new Set(TOPOLOGIES.flatMap(servicesOf));
  for (const d of DECOYS) assert.ok(!topo.has(d.service), `${d.service} collides with a topology service`);
  assert.equal(new Set(DECOYS.map((d) => d.service)).size, DECOYS.length);
  for (const g of dataset) {
    assert.deepEqual(g.info.decoyServices, []);
    assert.deepEqual(g.incident.services, servicesOf(TOPOLOGIES.find((t) => t.key === g.meta.topology)!));
  }
});

check("easy and medium get one decoy, hard two, plus one healthy auxiliary service; none mimics the root cause", () => {
  for (const g of v2All) {
    const want = g.incident.label.difficulty === "hard" ? 2 : 1;
    assert.equal(g.info.decoyServices.length, want, g.incident.id);
    const aux = g.incident.services.filter((svc) => decoyService.has(svc));
    assert.equal(aux.length, want + 1, `${g.incident.id}: aux services ${aux}`);
    const healthy = aux.filter((svc) => !g.info.decoyServices.includes(svc));
    assert.equal(healthy.length, 1);
    assert.equal(errorsBy(g).get(healthy[0]) ?? 0, 0, `${g.incident.id}: healthy aux ${healthy[0]} logs errors`);
    for (const svc of g.info.decoyServices) assert.notEqual(decoyService.get(svc)!.mimics, g.incident.label.rootCause, g.incident.id);
  }
});

check("the overview misleads: the top service by errors is a decoy, never a service with cause lines", () => {
  for (const g of v2All) {
    const causeServices = new Set(g.incident.label.evidenceLines.map((n) => g.incident.logs[n - 1].service));
    const [top] = [...errorsBy(g).entries()].sort((x, y) => y[1] - x[1]);
    assert.ok(g.info.decoyServices.includes(top[0]), `${g.incident.id}: top by errors is ${top[0]} (${top[1]})`);
    assert.ok(!causeServices.has(top[0]));
    // Strictly more errors than any service on the real path, so it isn't a tie the ordering happens to break.
    const pathMax = Math.max(0, ...[...errorsBy(g).entries()].filter(([svc]) => !decoyService.has(svc)).map(([, n]) => n));
    for (const svc of g.info.decoyServices) assert.ok((errorsBy(g).get(svc) ?? 0) > pathMax, `${g.incident.id}: ${svc} doesn't out-shout the path`);
  }
});

check("decoys stay off the path, are labeled herrings, and start before onset and keep going after", () => {
  for (const g of v2All) {
    const { logs, label } = g.incident;
    const herrings = new Set(label.herringLines);
    const onPath = new Set([...label.evidenceLines].map((n) => logs[n - 1].service));
    // Onset isn't in the log, so use the fault's first direct failure: the first ERROR/FATAL evidence line,
    // or (retry storms log no errors) the first evidence line that isn't an originating one. Some
    // evidence, like disk usage creeping up, deliberately predates onset.
    const direct = label.evidenceLines.filter((n) => isErr(logs[n - 1].level));
    const firstFailure = direct.length ? Math.min(...direct) : Math.min(...label.evidenceLines.filter((n) => !g.info.origins.includes(n)));
    for (const svc of g.info.decoyServices) {
      assert.ok(!onPath.has(svc), `${g.incident.id}: ${svc} has cause lines`);
      const errs = logs.filter((l) => l.service === svc && isErr(l.level));
      for (const l of errs) assert.ok(herrings.has(l.n), `${g.incident.id}: decoy line ${l.n} isn't a labeled herring`);
      assert.ok(errs[0].n < firstFailure, `${g.incident.id}: ${svc} starts after the fault's first failure`);
      assert.ok(errs.at(-1)!.n > firstFailure, `${g.incident.id}: ${svc} stops before the incident`);
    }
    assert.match(label.explanation, /Loud decoy: /);
  }
});

check("auxiliary services aren't a giveaway: the services list is shuffled", () => {
  const lastIsAux = v2All.filter((g) => decoyService.has(g.incident.services.at(-1)!)).length;
  assert.ok(lastIsAux < v2All.length * 0.6, `${lastIsAux}/${v2All.length} incidents list an auxiliary service last`);
});

check("'the first ERROR line is evidence' is now rarely true", () => {
  const firstErrorIsEvidence = v2All.filter((g) => g.meta.firstErrorIsEvidence).length;
  assert.ok(firstErrorIsEvidence <= v2All.length * 0.1, `${firstErrorIsEvidence}/${v2All.length}`);
});

console.log("\nGenerator v2: concurrent incidents (T4)");

const v2Hard = v2All.filter((g) => g.incident.label.difficulty === "hard");

check("every v2 hard incident has a second fault; nothing else does (v1 labels don't even have the field)", () => {
  for (const g of v2All) {
    const has = !!g.incident.label.secondaryLines?.length;
    assert.equal(has, g.incident.label.difficulty === "hard", g.incident.id);
    assert.equal(g.info.onsets.secondary !== undefined, has, g.incident.id);
  }
  for (const g of [...dataset, ...generateDataset(TEST_SET.seed, TEST_SET)]) {
    assert.ok(!("secondaryLines" in g.incident.label) && !("secondaryScenario" in g.incident.label), g.incident.id);
  }
});

check("a fair pairing: different category, not an acceptable answer, onset within 5 minutes", () => {
  for (const g of v2Hard) {
    const { label } = g.incident;
    const second = scenarioByKey.get(label.secondaryScenario!)!;
    assert.notEqual(second.rootCause, label.rootCause, g.incident.id);
    assert.ok(!label.acceptableCauses.includes(second.rootCause), `${g.incident.id}: ${second.rootCause} is an acceptable answer`);
    assert.ok(Math.abs(g.info.onsets.secondary! - g.info.onsets.primary) <= 300, `${g.incident.id}: onsets ${JSON.stringify(g.info.onsets)}`);
  }
});

check("it can't explain the alert: other services only, never named in the alert, never evidence", () => {
  for (const g of v2Hard) {
    const { logs, label, alert } = g.incident;
    const primary = new Set(servicesOf(TOPOLOGIES.find((t) => t.key === g.meta.topology)!));
    const secondServices = new Set(label.secondaryLines!.map((n) => logs[n - 1].service));
    for (const svc of secondServices) {
      assert.ok(!primary.has(svc), `${g.incident.id}: second fault on ${svc}, a primary service`);
      assert.ok(!alert.includes(svc), `${g.incident.id}: alert names ${svc}`);
      assert.ok(g.incident.services.includes(svc), `${g.incident.id}: ${svc} missing from the services list`);
    }
    const evidence = new Set(label.evidenceLines);
    for (const n of label.secondaryLines!) assert.ok(!evidence.has(n) && !label.herringLines.includes(n), `${g.incident.id}: line ${n}`);
    // Its first signs don't count as the incident's own origin lines.
    for (const n of g.info.origins) assert.ok(evidence.has(n));
    assert.match(label.explanation, /unrelated incident at about the same time/);
  }
});

console.log(`\n${passed} checks passed.`);
