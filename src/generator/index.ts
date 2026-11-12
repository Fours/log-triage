import { ROOT_CAUSE_CATEGORIES, Incident, type RootCauseCategory } from "../types.js";
import { IncidentBuilder } from "./builder.js";
import type { Ctx, Difficulty, Scenario } from "./context.js";
import { backgroundTraffic, plantHerrings } from "./noise.js";
import { createRng } from "./rng.js";
import { TOPOLOGIES, servicesOf, type Topology } from "./topologies.js";
import { dbDiskFull, dbLockWait, externalHang, memoryLeakOom } from "./scenarios/timeouts-and-resources.js";
import { contractChange, newVersionException, rotatedCredential, wrongEndpoint } from "./scenarios/deploys-and-config.js";
import { crashLoop, deserializeLoop, duplicateKey, failedMigration } from "./scenarios/queues-and-data.js";
import { cacheStampede, cloudStorage, provider5xx, retryStorm } from "./scenarios/cascades-and-outages.js";

/**
 * Deterministic synthetic incident generator.
 *
 * Why code and not an LLM: the label must be *exactly* right, because the eval
 * scores the agent against it. Here the evidence lines are known by
 * construction (every line is emitted with a role), the dataset is reproducible
 * from one seed, and generating it costs nothing.
 */

export const GENERATOR_VERSION = 1;
export const DEFAULT_SEED = "log-triage-v1";

/** Two variants per category, so each root cause shows up in more than one shape. */
export const SCENARIOS: Record<RootCauseCategory, readonly [Scenario, Scenario]> = {
  dependency_timeout: [dbLockWait, externalHang],
  resource_exhaustion: [memoryLeakOom, dbDiskFull],
  bad_deploy: [newVersionException, contractChange],
  config_error: [wrongEndpoint, rotatedCredential],
  poison_message: [deserializeLoop, crashLoop],
  data_integrity: [failedMigration, duplicateKey],
  cascading_failure: [retryStorm, cacheStampede],
  external_outage: [provider5xx, cloudStorage],
};

export interface IncidentSpec {
  id: string;
  scenario: Scenario;
  topology: Topology;
  difficulty: Difficulty;
  seed: string;
}

export interface GeneratedIncident {
  incident: Incident;
  /** Bookkeeping the eval can slice on but the agent never sees. */
  meta: {
    topology: string;
    lines: number;
    errorLines: number;
    evidenceCount: number;
    herringLines: number;
    /** Would "cite the first ERROR line" find real evidence? False is what makes an incident adversarial. */
    firstErrorIsEvidence: boolean;
  };
}

export function generateIncident(spec: IncidentSpec): GeneratedIncident {
  const rng = createRng(spec.seed);
  const startMs = Date.UTC(2026, 9, 1) + rng.int(0, 60) * 86_400_000 + rng.int(0, 23) * 3_600_000 + rng.int(0, 59) * 60_000;
  const b = new IncidentBuilder(rng.fork("ids"), startMs);
  const end = rng.int(18, 30) * 60;
  const c: Ctx = {
    b,
    t: spec.topology,
    rng: rng.fork("scenario"),
    difficulty: spec.difficulty,
    onset: Math.round(end * rng.float(0.45, 0.6)),
    end,
  };

  const result = spec.scenario.run(c);
  const herrings = plantHerrings({ ...c, rng: rng.fork("herrings") }, spec.scenario.rootCause, spec.scenario.confusableWith);
  backgroundTraffic(
    { ...c, rng: rng.fork("noise") },
    {
      healthyAfterOnset: result.traffic?.healthyAfterOnset ?? 0.35,
      quietAfterOnset: new Set(result.traffic?.quietAfterOnset ?? []),
    },
  );

  const { logs, evidence, roles } = b.build();
  const errorIdx = logs.findIndex((l) => l.level === "ERROR" || l.level === "FATAL");

  const incident = Incident.parse({
    id: spec.id,
    title: result.title,
    alert: result.alert,
    services: servicesOf(spec.topology),
    logs,
    label: {
      rootCause: spec.scenario.rootCause,
      evidenceLines: evidence,
      explanation: b.resolve(result.explain() + herrings.note()),
      difficulty: spec.difficulty,
      acceptableCauses: result.acceptableCauses ?? [],
      herringLines: logs.filter((_, i) => roles[i] === "herring").map((l) => l.n),
      scenario: spec.scenario.key,
    },
  });

  return {
    incident,
    meta: {
      topology: spec.topology.key,
      lines: logs.length,
      errorLines: logs.filter((l) => l.level === "ERROR" || l.level === "FATAL").length,
      evidenceCount: evidence.length,
      herringLines: roles.filter((r) => r === "herring").length,
      firstErrorIsEvidence: errorIdx >= 0 && roles[errorIdx] === "cause",
    },
  };
}

/**
 * The full dataset: for each category, both variants at easy/medium/hard
 * (8 × 2 × 3 = 48 incidents). Topologies rotate so no service name predicts a
 * category, and the order is shuffled so ids don't either.
 */
export interface DatasetOptions {
  /** Incident id prefix: `gen` → gen-001…; a held-out set uses its own so ids never collide. */
  idPrefix?: string;
  /** Rotates which topology each scenario lands on, so a held-out set isn't the same scenarios on the same services. */
  topologyShift?: number;
}

export function planDataset(seed = DEFAULT_SEED, { idPrefix = "gen", topologyShift = 0 }: DatasetOptions = {}): IncidentSpec[] {
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];
  const specs: Omit<IncidentSpec, "id">[] = [];
  let i = 0;
  for (const category of ROOT_CAUSE_CATEGORIES) {
    for (const difficulty of difficulties) {
      for (const scenario of SCENARIOS[category]) {
        specs.push({
          scenario,
          difficulty,
          topology: TOPOLOGIES[(i * 3 + Math.floor(i / TOPOLOGIES.length) + topologyShift) % TOPOLOGIES.length],
          seed: `${seed}:${scenario.key}:${difficulty}`,
        });
        i++;
      }
    }
  }
  return createRng(`${seed}:order`)
    .shuffle(specs)
    .map((s, k) => ({ ...s, id: `${idPrefix}-${String(k + 1).padStart(3, "0")}` }));
}

export function generateDataset(seed = DEFAULT_SEED, opts: DatasetOptions = {}): GeneratedIncident[] {
  return planDataset(seed, opts).map(generateIncident);
}

/**
 * The held-out test set: a different seed, id prefix and topology rotation.
 * Prompt work is tuned on the default (dev) set only; this set is run once per
 * candidate at the end, so its number isn't inflated by tuning.
 */
export const TEST_SET = { seed: "log-triage-test-v1", idPrefix: "test", topologyShift: 2 } as const;
