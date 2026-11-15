import type { Difficulty, GeneratorVersion } from "./context.js";
import type { Rng } from "./rng.js";

/**
 * Generator v2's difficulty features (docs/milestone-7.md), as one object each
 * scenario reads through `c.hard`. For v1 every method is the identity and
 * nothing draws randomness, so v1 incidents stay byte-identical.
 *
 * All v2 randomness comes from `rng` here, a stream forked off the incident's
 * seed that v1 never touches.
 */

/** A message plus which family and variant it came from (for tests and analysis; never shown to the agent). */
export interface Phrased {
  msg: string;
  family: string;
  variant: number;
}

export interface Hardness {
  version: GeneratorVersion;
  /** Originating cause lines are logged quietly (INFO instead of WARN/ERROR) and there are fewer of them. */
  quietCauses: boolean;
  /** How many of a family's message variants are in play (1 = always the original wording). */
  phrasings: number;
  /** v2-only randomness. Never use it in a v1 code path. */
  rng: Rng;
  /** Size of a group of originating cause lines: 1–2 when quiet, unchanged otherwise. */
  count(normal: number): number;
  /**
   * A message family: call the returned function once per line. Cycles through
   * the first `phrasings` variants from a random start, so several wordings
   * always appear. Variant 0 must be the v1 message, exactly.
   */
  phrases<A extends unknown[]>(family: string, variants: ReadonlyArray<(...args: A) => string>): (...args: A) => Phrased;
}

/** Number of message variants in play per difficulty (spec: 2 / 3 / 4). */
const PHRASINGS: Record<Difficulty, number> = { easy: 2, medium: 3, hard: 4 };

/**
 * Scenarios whose originating cause lines can be quieted. At medium, half of
 * them are: every other one in sorted order, so the dev and test sets quiet
 * the same scenarios and stay equally hard.
 */
export function quietAtMedium(scenarioKey: string, quietable: readonly string[]): boolean {
  const sorted = [...quietable].sort();
  const i = sorted.indexOf(scenarioKey);
  return i >= 0 && i % 2 === 0;
}

export function createHardness(opts: {
  version: GeneratorVersion;
  difficulty: Difficulty;
  scenarioKey: string;
  quietable: boolean;
  allQuietable: readonly string[];
  rng: Rng;
}): Hardness {
  const { version, difficulty, rng } = opts;
  const v2 = version >= 2;
  const quietCauses =
    v2 && opts.quietable && (difficulty === "hard" || (difficulty === "medium" && quietAtMedium(opts.scenarioKey, opts.allQuietable)));
  const phrasings = v2 ? PHRASINGS[difficulty] : 1;

  return {
    version,
    quietCauses,
    phrasings,
    rng,
    count: (normal) => (quietCauses ? Math.min(normal, rng.int(1, 2)) : normal),
    phrases<A extends unknown[]>(family: string, variants: ReadonlyArray<(...args: A) => string>) {
      const n = Math.min(phrasings, variants.length);
      // v1: always variant 0, and no draw.
      const start = n > 1 ? rng.int(0, n - 1) : 0;
      let k = 0;
      return (...args: A): Phrased => {
        const variant = (start + k++) % n;
        return { msg: variants[variant](...args), family, variant };
      };
    },
  };
}
