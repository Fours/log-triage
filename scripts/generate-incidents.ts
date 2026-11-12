import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SEED, GENERATOR_VERSION, TEST_SET, generateDataset, type DatasetOptions } from "../src/generator/index.js";

/**
 * Regenerate a labeled incident set. Deterministic: the same seed produces
 * byte-identical files, so the datasets are committed and diffs show exactly
 * what a generator change did.
 *
 *   npm run generate              # dev set (default seed) → incidents/generated/
 *   npm run generate -- --test    # held-out test set      → incidents/test/
 *   npm run generate -- my-seed   # a different (but still reproducible) dev-style set
 */

const here = dirname(fileURLToPath(import.meta.url));
const isTest = process.argv.includes("--test");
const outDir = resolve(here, isTest ? "../incidents/test" : "../incidents/generated");
const seed = isTest ? TEST_SET.seed : (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_SEED);
const options: DatasetOptions = isTest ? { idPrefix: TEST_SET.idPrefix, topologyShift: TEST_SET.topologyShift } : {};

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.endsWith(".json")) rmSync(resolve(outDir, f));
}

const dataset = generateDataset(seed, options);
for (const { incident } of dataset) {
  writeFileSync(resolve(outDir, `${incident.id}.json`), JSON.stringify(incident, null, 2) + "\n");
}

const manifest = {
  generatorVersion: GENERATOR_VERSION,
  seed,
  ...options,
  count: dataset.length,
  incidents: dataset.map(({ incident, meta }) => ({
    id: incident.id,
    file: `${incident.id}.json`,
    rootCause: incident.label.rootCause,
    acceptableCauses: incident.label.acceptableCauses,
    scenario: incident.label.scenario,
    difficulty: incident.label.difficulty,
    ...meta,
  })),
};
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
console.log(`Generated ${dataset.length} incidents (seed "${seed}") → ${outDir}\n`);
console.table(Object.fromEntries(rows));
const lines = manifest.incidents.map((m) => m.lines);
const adversarial = manifest.incidents.filter((m) => !m.firstErrorIsEvidence).length;
console.log(
  `lines/incident: min ${Math.min(...lines)}, median ${lines.sort((a, b) => a - b)[Math.floor(lines.length / 2)]}, max ${Math.max(...lines)}` +
    ` · first ERROR line is not evidence in ${adversarial}/${dataset.length}`,
);
