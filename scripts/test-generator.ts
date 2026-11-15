import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { DATASETS, DEFAULT_SEED, TEST_SET, generateDataset, generateDatasetFor } from "../src/generator/index.js";
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

console.log(`\n${passed} checks passed.`);
