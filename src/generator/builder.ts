import type { LogLevel, LogLine } from "../types.js";
import type { Phrased } from "./hardness.js";
import type { Rng } from "./rng.js";

/**
 * Why a line exists. Only `cause` lines become the label's evidence; the rest
 * let us reason about (and test) what a scenario put in the haystack.
 * - cause:   establishes the root cause — what a correct triage should cite
 * - symptom: downstream effect of the fault (5xx at the edge, saturated pools)
 * - herring: plausible-looking anomaly unrelated to this incident
 * - noise:   healthy background traffic and housekeeping
 * - secondary: cause line of a second, unrelated fault running at the same time (v2 hard)
 */
export type Role = "cause" | "symptom" | "herring" | "noise" | "secondary";

/**
 * Handle to an emitted line. `n` is filled in by `build()` once lines are
 * sorted, so scenario explanations can cite final line numbers lazily.
 */
export interface LineRef {
  n: number;
  readonly at: number;
  readonly role: Role;
}

interface Draft extends LineRef {
  seq: number;
  service: string;
  level: LogLevel;
  traceId?: string;
  msg: string;
  origin: boolean;
  family?: string;
  variant?: number;
}

export interface LogOpts {
  trace?: string;
  role?: Role;
  /**
   * An originating cause line: the first sign of the fault (the lock holder,
   * the slow calls, the heap warnings). Generator v2 can log these quietly.
   */
  origin?: boolean;
}

/** Bookkeeping about the generated log that the agent never sees. */
export interface BuildInfo {
  /** Line numbers of originating cause lines. */
  origins: number[];
  /** Paraphrased message families: line number and variant of each line. */
  families: Record<string, { n: number; variant: number }[]>;
  /** Generator v2: auxiliary services carrying a loud decoy (set by the generator after build). */
  decoyServices: string[];
  /** Window seconds when each fault began (set by the generator after build). */
  onsets: { primary: number; secondary?: number };
}

/** While a second, unrelated fault is generated: how its lines are tagged. */
export interface Scope {
  /** Role remapping, e.g. its cause lines become `secondary`. */
  roles: Partial<Record<Role, Role>>;
  /** Whether its originating lines are logged quietly (its own difficulty decides). */
  quietOrigins: boolean;
  /** Prefix for its message families, so they don't merge with the primary's. */
  familyPrefix: string;
}

const QUIET: Partial<Record<LogLevel, LogLevel>> = { WARN: "INFO", ERROR: "INFO", FATAL: "INFO" };

export class IncidentBuilder {
  private drafts: Draft[] = [];
  private seq = 0;
  private tokenSeq = 0;
  private traceSeq: number;
  private entitySeq: number;
  /** Placeholder token → final id, filled during `build()`. */
  private ids = new Map<string, string>();
  /** Generator v2: log originating cause lines at INFO. Off for v1. */
  quietOrigins = false;
  private scope: Scope | null = null;

  /** Generate a second, unrelated fault: its lines are retagged per `scope`. */
  within<T>(scope: Scope, fn: () => T): T {
    const outer = this.scope;
    this.scope = scope;
    try {
      return fn();
    } finally {
      this.scope = outer;
    }
  }

  constructor(
    private readonly rng: Rng,
    /** Epoch ms of offset 0. */
    readonly startMs: number,
  ) {
    this.traceSeq = rng.int(1000, 8000);
    this.entitySeq = rng.int(1000, 9000);
  }

  /**
   * A fresh trace id. Returns a placeholder; real ids (`t-5012`) are assigned in
   * `build()` in order of first appearance, so ids increase down the log like a
   * real system's — regardless of which part of the generator emitted the line.
   */
  trace(): string {
    return `\u27e6T${this.tokenSeq++}\u27e7`;
  }

  /** A fresh business entity id, e.g. `o-5012`. Numbered in log order, like `trace()`. */
  entity(prefix: string): string {
    return `${prefix}\u27e6E${this.tokenSeq++}\u27e7`;
  }

  /** Emit a line `at` seconds after the window start. Role defaults to noise. */
  log(at: number, service: string, level: LogLevel, msg: string | Phrased, opts: LogOpts = {}): LineRef {
    const phrased = typeof msg === "string" ? null : msg;
    const baseRole = opts.role ?? "noise";
    const role = this.scope?.roles[baseRole] ?? baseRole;
    const quiet = this.scope ? this.scope.quietOrigins : this.quietOrigins;
    const isOrigin = opts.origin === true;
    const draft: Draft = {
      n: 0,
      at: Math.max(0, at),
      role,
      seq: this.seq++,
      service,
      level: isOrigin && quiet ? (QUIET[level] ?? level) : level,
      traceId: opts.trace,
      msg: phrased ? phrased.msg : (msg as string),
      // Only the incident's own fault counts as "origin"; a second fault's first signs are just secondary lines.
      origin: isOrigin && role === "cause",
      family: phrased ? `${this.scope?.familyPrefix ?? ""}${phrased.family}` : undefined,
      variant: phrased?.variant,
    };
    this.drafts.push(draft);
    return draft;
  }

  /** The highest ERROR/FATAL line count of any one service emitted so far. */
  maxErrorsPerService(): number {
    const counts = new Map<string, number>();
    for (const d of this.drafts) if (d.level === "ERROR" || d.level === "FATAL") counts.set(d.service, (counts.get(d.service) ?? 0) + 1);
    return Math.max(0, ...counts.values());
  }

  /** Sort by time (stable by emission order), assign 1-indexed line numbers. */
  build(): { logs: LogLine[]; evidence: number[]; roles: Role[]; info: BuildInfo } {
    const sorted = [...this.drafts].sort((a, b) => {
      const sa = Math.floor(a.at);
      const sb = Math.floor(b.at);
      return sa - sb || a.at - b.at || a.seq - b.seq;
    });
    sorted.forEach((d, i) => (d.n = i + 1));

    // Number placeholder ids in the order they first appear in the final log.
    const resolveIds = (text: string) =>
      text.replace(/\u27e6([TE])\d+\u27e7/g, (token, kind: string) => {
        let id = this.ids.get(token);
        if (!id) {
          if (kind === "T") {
            this.traceSeq += this.rng.int(1, 4);
            id = `t-${this.traceSeq}`;
          } else {
            this.entitySeq += this.rng.int(1, 3);
            id = String(this.entitySeq);
          }
          this.ids.set(token, id);
        }
        return id;
      });

    const logs: LogLine[] = sorted.map((d) => {
      const line: LogLine = {
        n: d.n,
        ts: new Date(this.startMs + Math.floor(d.at) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
        service: d.service,
        level: d.level,
        msg: resolveIds(d.msg),
      };
      if (d.traceId) line.traceId = resolveIds(d.traceId);
      return line;
    });
    const evidence = sorted.filter((d) => d.role === "cause").map((d) => d.n);
    const families: BuildInfo["families"] = {};
    for (const d of sorted) if (d.family !== undefined) (families[d.family] ??= []).push({ n: d.n, variant: d.variant ?? 0 });
    const info: BuildInfo = { origins: sorted.filter((d) => d.origin).map((d) => d.n), families, decoyServices: [], onsets: { primary: 0 } };
    return { logs, evidence, roles: sorted.map((d) => d.role), info };
  }

  /** Resolve placeholder ids in free text (e.g. an explanation). Call after `build()`. */
  resolve(text: string): string {
    return text.replace(/\u27e6[TE]\d+\u27e7/g, (token) => this.ids.get(token) ?? token);
  }
}

/** "line 7" / "lines 7, 8, 12" — for explanations written before numbering exists. */
export function cite(refs: LineRef | LineRef[]): string {
  const list = (Array.isArray(refs) ? refs : [refs]).map((r) => r.n).sort((a, b) => a - b);
  if (list.length === 0) return "(no lines)";
  return list.length === 1 ? `line ${list[0]}` : `lines ${list.join(", ")}`;
}
