import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASETS, generateDataset, generateDatasetFor, incidentFileContents, type DatasetDef } from "../src/generator/index.js";
import { buildManifest } from "../src/generator/manifest.js";

/**
 * Regenerate a labeled incident set. Deterministic: the same seed produces
 * byte-identical files.
 *
 *   npm run generate                  # v1 dev set      → incidents/generated/
 *   npm run generate -- --test        # v1 test set     → incidents/test/
 *   npm run generate -- --v2          # v2 dev set      → incidents/v2/dev/
 *   npm run generate -- --v2 --test   # v2 test set     → incidents/v2/test/
 *   npm run generate -- my-seed       # a different (but still reproducible) v1 dev-style set
 *
 * v1 sets are committed. v2 sets are too large to commit: only their
 * manifest.json is, with a SHA-256 per incident, and `npm run test:generator`
 * checks a fresh generation against it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const isTest = args.includes("--test");
const isV2 = args.includes("--v2");
const customSeed = args.find((a) => !a.startsWith("--"));

const def: DatasetDef = isV2 ? (isTest ? DATASETS.v2Test : DATASETS.v2Dev) : isTest ? DATASETS.test : DATASETS.dev;
if (customSeed && (isV2 || isTest)) {
  console.error("A custom seed only applies to the v1 dev set; the other sets have fixed seeds.");
  process.exit(1);
}
const seed = customSeed ?? def.seed;
const outDir = resolve(here, "..", def.dir);

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.endsWith(".json")) rmSync(resolve(outDir, f));
}

const dataset = customSeed ? generateDataset(seed) : generateDatasetFor(def);
for (const { incident } of dataset) {
  writeFileSync(resolve(outDir, `${incident.id}.json`), incidentFileContents(incident));
}

// The v1 dev manifest predates idPrefix/topologyShift and must stay byte-identical, so it omits them.
const manifest = buildManifest(dataset, {
  version: def.version,
  seed,
  ...(def === DATASETS.dev ? {} : { idPrefix: def.idPrefix, topologyShift: def.topologyShift }),
  hashes: !def.committed,
});
writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// Summary
const rows = new Map<string, { n: number; easy: number; medium: number; hard: number; ambiguous: number }>();
for (const m of manifest.incidents) {
  const r = rows.get(m.rootCause) ?? { n: 0, easy: 0, medium: 0, hard: 0, ambiguous: 0 };
  r.n++;
  r[m.difficulty]++;
  if (m.acceptableCauses.length) r.ambiguous++;
  rows.set(m.rootCause, r);
}
console.log(`Generated ${dataset.length} incidents (generator v${def.version}, seed "${seed}") → ${outDir}\n`);
console.table(Object.fromEntries(rows));
const lines = manifest.incidents.map((m) => m.lines);
const adversarial = manifest.incidents.filter((m) => !m.firstErrorIsEvidence).length;
console.log(
  `lines/incident: min ${Math.min(...lines)}, median ${lines.sort((a, b) => a - b)[Math.floor(lines.length / 2)]}, max ${Math.max(...lines)}` +
    ` · first ERROR line is not evidence in ${adversarial}/${dataset.length}`,
);
