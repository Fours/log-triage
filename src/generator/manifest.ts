import { createHash } from "node:crypto";
import type { Difficulty, GeneratorVersion } from "./context.js";
import { incidentFileContents, type GeneratedIncident } from "./index.js";

/**
 * A dataset's manifest.json: what's in it, and for sets that aren't committed
 * (v2), a SHA-256 of each incident file, so a regenerated set can be checked
 * byte for byte against the committed manifest.
 *
 * Key order matters: v1 manifests are committed and must not change.
 */

export interface ManifestEntry {
  id: string;
  file: string;
  rootCause: string;
  acceptableCauses: string[];
  scenario: string | undefined;
  difficulty: Difficulty;
  lines: number;
  errorLines: number;
  evidenceCount: number;
  herringLines: number;
  firstErrorIsEvidence: boolean;
  topology: string;
  sha256?: string;
}

export interface Manifest {
  generatorVersion: GeneratorVersion;
  seed: string;
  idPrefix?: string;
  topologyShift?: number;
  count: number;
  incidents: ManifestEntry[];
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function buildManifest(
  dataset: GeneratedIncident[],
  opts: { version: GeneratorVersion; seed: string; idPrefix?: string; topologyShift?: number; hashes: boolean },
): Manifest {
  return {
    generatorVersion: opts.version,
    seed: opts.seed,
    ...(opts.idPrefix !== undefined ? { idPrefix: opts.idPrefix, topologyShift: opts.topologyShift } : {}),
    count: dataset.length,
    incidents: dataset.map(({ incident, meta }) => ({
      id: incident.id,
      file: `${incident.id}.json`,
      rootCause: incident.label.rootCause,
      acceptableCauses: incident.label.acceptableCauses,
      scenario: incident.label.scenario,
      difficulty: incident.label.difficulty,
      ...meta,
      ...(opts.hashes ? { sha256: sha256(incidentFileContents(incident)) } : {}),
    })),
  };
}
