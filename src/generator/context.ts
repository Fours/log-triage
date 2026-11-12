import type { RootCauseCategory } from "../types.js";
import type { IncidentBuilder } from "./builder.js";
import type { Rng } from "./rng.js";
import type { Topology } from "./topologies.js";

export type Difficulty = "easy" | "medium" | "hard";

/** Everything a scenario needs to write its incident into the builder. */
export interface Ctx {
  b: IncidentBuilder;
  t: Topology;
  rng: Rng;
  difficulty: Difficulty;
  /** Seconds from window start when the fault begins. */
  onset: number;
  /** Window length in seconds. */
  end: number;
}

export interface ScenarioResult {
  title: string;
  /** The page. Describes the symptom only — never the cause. */
  alert: string;
  /** Called after line numbering so it can cite final line numbers. */
  explain: () => string;
  acceptableCauses?: RootCauseCategory[];
  /** How the scenario's fault affects background traffic after onset. */
  traffic?: {
    /** Fraction of normal healthy request volume that still succeeds (default 0.35). */
    healthyAfterOnset?: number;
    /** Services whose routine housekeeping logs stop at onset (crashed, wedged, ...). */
    quietAfterOnset?: string[];
  };
}

export interface Scenario {
  /** "<category>/<variant>", e.g. "resource_exhaustion/memory-leak-oom". */
  key: string;
  rootCause: RootCauseCategory;
  /** Categories this incident is easy to misread as — hard mode picks herrings that mimic these. */
  confusableWith: RootCauseCategory[];
  run(c: Ctx): ScenarioResult;
}

export const isHard = (c: Ctx) => c.difficulty === "hard";
export const byDifficulty = <T>(c: Ctx, easy: T, medium: T, hard: T): T =>
  c.difficulty === "easy" ? easy : c.difficulty === "medium" ? medium : hard;
