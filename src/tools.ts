import { readFileSync } from "node:fs";
import { Incident, type LogLine, type LogLevel } from "./types.js";

/**
 * Deterministic log access. The LLM reasons; it does not parse timestamps,
 * filter levels, or correlate traces — that is all plain code here. This is
 * the boundary that keeps the agent's context small (it pulls only what it
 * asks for) and makes retrieval cheap and testable. These functions are pure
 * over the log array, so the eval harness exercises them with no API key.
 */

const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

export function loadIncident(path: string): Incident {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Incident.parse(raw);
}

function formatLine(l: LogLine): string {
  const trace = l.traceId ? ` [${l.traceId}]` : "";
  return `#${l.n} ${l.ts} ${l.level} ${l.service}${trace} ${l.msg}`;
}

/** Overview: which services emitted logs, how many, at what levels, over what window. */
export function listServices(logs: LogLine[]): string {
  if (logs.length === 0) return "no logs";
  const byService = new Map<string, { count: number; errors: number; first: string; last: string }>();
  for (const l of logs) {
    const s = byService.get(l.service) ?? { count: 0, errors: 0, first: l.ts, last: l.ts };
    s.count += 1;
    if (LEVEL_RANK[l.level] >= LEVEL_RANK.ERROR) s.errors += 1;
    if (l.ts < s.first) s.first = l.ts;
    if (l.ts > s.last) s.last = l.ts;
    byService.set(l.service, s);
  }
  const window = `window ${logs[0].ts} .. ${logs[logs.length - 1].ts}, ${logs.length} lines total`;
  const rows = [...byService.entries()]
    .sort((a, b) => b[1].errors - a[1].errors || b[1].count - a[1].count)
    .map(([service, s]) => `- ${service}: ${s.count} lines, ${s.errors} error+ (${s.first} .. ${s.last})`);
  return `${window}\n${rows.join("\n")}`;
}

/**
 * Each service's earliest WARN-or-worse line, in log order: a starting map of
 * where trouble appeared first. Not an answer: in many incidents the earliest
 * warning is a red herring or background noise.
 */
export function firstAnomalies(logs: LogLine[]): string {
  const first = new Map<string, LogLine>();
  for (const l of logs) {
    if (LEVEL_RANK[l.level] >= LEVEL_RANK.WARN && !first.has(l.service)) first.set(l.service, l);
  }
  if (first.size === 0) return "no WARN or worse lines";
  return [...first.values()].sort((a, b) => a.n - b.n).map(formatLine).join("\n");
}

export interface SearchArgs {
  query?: string;
  service?: string;
  level?: LogLevel;
  traceId?: string;
  limit?: number;
}

/** Filter logs by substring, service, minimum level, and/or trace id. Capped output. */
export function searchLogs(logs: LogLine[], args: SearchArgs): string {
  const limit = args.limit ?? 25;
  const q = args.query?.toLowerCase();
  const minRank = args.level ? LEVEL_RANK[args.level] : undefined;

  const matches = logs.filter((l) => {
    if (q && !l.msg.toLowerCase().includes(q)) return false;
    if (args.service && l.service !== args.service) return false;
    if (minRank !== undefined && LEVEL_RANK[l.level] < minRank) return false;
    if (args.traceId && l.traceId !== args.traceId) return false;
    return true;
  });

  if (matches.length === 0) return "no matching log lines";
  const shown = matches.slice(0, limit);
  const header = `${matches.length} match(es)${matches.length > limit ? `, showing first ${limit}` : ""}:`;
  return `${header}\n${shown.map(formatLine).join("\n")}`;
}

/** Return the lines surrounding a given line number, to see what happened around it. */
export function getContext(logs: LogLine[], line: number, before = 3, after = 3): string {
  const lo = line - Math.max(0, before);
  const hi = line + Math.max(0, after);
  const window = logs.filter((l) => l.n >= lo && l.n <= hi);
  if (window.length === 0) return `no log lines near #${line}`;
  return window.map(formatLine).join("\n");
}

/** All lines sharing a trace id, across services, in order — follows one request's path. */
export function correlateTrace(logs: LogLine[], traceId: string): string {
  const window = logs.filter((l) => l.traceId === traceId).sort((a, b) => a.n - b.n);
  if (window.length === 0) return `no log lines with traceId ${traceId}`;
  return `${window.length} line(s) for ${traceId}:\n${window.map(formatLine).join("\n")}`;
}
