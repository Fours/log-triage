import { useEffect, useMemo, useState } from 'react'
import { category, pct, replays, secs, usd, type Replay as ReplayData, type ReplayRun } from '../data'
import { track } from '../analytics'
import SectionHeading from './SectionHeading'

const SUBMIT = 'submit_triage'

type LineRole = 'evidence' | 'herring' | null

function verdictMark(run: ReplayRun): { symbol: string; label: string; tone: string } {
  if (run.score.top1) return { symbol: '✓', label: 'Correct', tone: 'good' }
  if (run.score.top1Lenient) return { symbol: '~', label: 'Acceptable alternative', tone: 'warn' }
  return { symbol: '✗', label: 'Wrong', tone: 'bad' }
}

function describeInput(tool: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
  return `${tool}(${parts.join(', ')})`
}

/** One tool output, with each log line tagged by what the label says it is. */
function ToolOutput({ text, roleOf }: { text: string; roleOf: (n: number) => LineRole }) {
  const rows = text.split('\n')
  return (
    <pre className="replay-output">
      {rows.map((row, i) => {
        const m = row.match(/^#(\d+) /)
        const role = m ? roleOf(Number(m[1])) : null
        return (
          <span key={i} className={`replay-line${role ? ` is-${role}` : ''}`}>
            {row}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

function RunPicker({ replay, active, onPick }: { replay: ReplayData; active: number; onPick: (i: number) => void }) {
  return (
    <div className="replay-runs" role="tablist" aria-label="Investigations of this incident">
      {replay.runs.map((r, i) => {
        const mark = verdictMark(r)
        const toolCalls = r.steps.filter((s) => s.tool !== SUBMIT).length
        return (
          <button
            key={r.key}
            role="tab"
            aria-selected={i === active}
            className={`replay-run${i === active ? ' is-active' : ''}`}
            onClick={() => onPick(i)}
          >
            <span className="replay-run-name">
              {r.modelName}
              <span className="replay-run-meta">
                {r.effort} effort · prompt {r.prompt}
              </span>
            </span>
            <span className={`replay-run-verdict tone-${mark.tone}`}>
              <span aria-hidden="true">{mark.symbol}</span> {category(r.score.predicted)}
            </span>
            <span className="replay-run-stats">
              {toolCalls} tool call{toolCalls === 1 ? '' : 's'} · evidence {r.score.correct}/{replay.label.evidenceLines.length} · {usd(r.costUsd)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Verdict({ run, replay, lineText }: { run: ReplayRun; replay: ReplayData; lineText: Map<number, string> }) {
  const evidence = new Set(replay.label.evidenceLines)
  const herrings = new Set(replay.label.herringLines)
  const mark = verdictMark(run)
  if (!run.verdict) return <p className="muted">No verdict.</p>
  return (
    <div className="replay-verdict">
      <div className="replay-verdict-head">
        <span className={`replay-badge tone-${mark.tone}`}>
          <span aria-hidden="true">{mark.symbol}</span> {mark.label}
        </span>
        <span className="muted">
          Labeled root cause: <strong>{category(replay.label.rootCause)}</strong>
          {replay.label.acceptableCauses.length > 0 && <> (also accepted: {replay.label.acceptableCauses.map(category).join(', ')})</>}
        </span>
      </div>
      <ol className="replay-hypotheses">
        {run.verdict.hypotheses.map((h, i) => (
          <li key={i}>
            <div className="replay-hypothesis-head">
              <strong>{category(h.rootCause)}</strong>
              <span className="replay-confidence" aria-label={`confidence ${pct(h.confidence)}`}>
                <span className="replay-confidence-bar" style={{ width: `${h.confidence * 100}%` }} />
              </span>
              <span className="mono">{h.confidence.toFixed(2)}</span>
            </div>
            <p>{h.reasoning}</p>
            {i === 0 && (
              <ul className="replay-cited">
                {h.evidenceLines.map((n) => {
                  const role = evidence.has(n) ? 'evidence' : herrings.has(n) ? 'herring' : 'other'
                  return (
                    <li key={n} className={`replay-line is-${role}`}>
                      <span className="replay-cited-tag">{role === 'evidence' ? 'evidence' : role === 'herring' ? 'red herring' : 'not evidence'}</span>
                      <span className="mono">{lineText.get(n) ?? `#${n}`}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <p className="replay-score">
        Top hypothesis evidence: {run.score.correct} of {run.score.cited} cited lines are labeled evidence (precision {pct(run.score.precision)}),
        covering {pct(run.score.recall)} of the {replay.label.evidenceLines.length} labeled lines · {secs(run.durationMs)} · {usd(run.costUsd)}
      </p>
      <details className="replay-label">
        <summary>What the label says</summary>
        <p>{replay.label.explanation}</p>
      </details>
    </div>
  )
}

export default function Replay() {
  const [incidentIdx, setIncidentIdx] = useState(0)
  const [runIdx, setRunIdx] = useState(0)
  const [shown, setShown] = useState(1)
  const [playing, setPlaying] = useState(false)

  const replay = replays[incidentIdx]
  const run = replay.runs[runIdx]
  const steps = run.steps.filter((s) => s.tool !== SUBMIT)
  const total = steps.length + 1 // + the verdict
  const done = shown >= total

  const roleOf = useMemo(() => {
    const evidence = new Set(replay.label.evidenceLines)
    const herrings = new Set(replay.label.herringLines)
    return (n: number): LineRole => (evidence.has(n) ? 'evidence' : herrings.has(n) ? 'herring' : null)
  }, [replay])
  const lineText = useMemo(
    () => new Map(replay.lines.map((l) => [l.n, `#${l.n} ${l.ts.slice(11, 19)} ${l.level} ${l.service} ${l.msg}`])),
    [replay],
  )

  useEffect(() => {
    if (!playing) return
    if (done) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setShown((s) => s + 1), 1400)
    return () => clearTimeout(t)
  }, [playing, shown, done])

  const pickIncident = (i: number) => {
    track('replay_incident_selected', { incident: replays[i].incidentId })
    setIncidentIdx(i)
    setRunIdx(0)
    setShown(1)
    setPlaying(false)
  }
  const pickRun = (i: number) => {
    track('replay_run_selected', { incident: replay.incidentId, run: replay.runs[i].key })
    setRunIdx(i)
    setShown(1)
    setPlaying(false)
  }

  return (
    <section id="replay" className="section container">
      <SectionHeading
        eyebrow="Recorded investigations"
        title="Watch it work"
        lede="Real runs from the held-out test set, replayed step by step: every tool call the agent made, what came back, and the verdict scored against the label. Nothing here is live or edited."
      />

      <div className="replay-incidents" role="tablist" aria-label="Incidents">
        {replays.map((r, i) => (
          <button key={r.incidentId} role="tab" aria-selected={i === incidentIdx} className={`chip${i === incidentIdx ? ' is-active' : ''}`} onClick={() => pickIncident(i)}>
            {r.title}
          </button>
        ))}
      </div>
      <p className="replay-why">{replay.why}</p>

      <div className="replay">
        <aside className="replay-brief">
          <h3>
            <span className="mono muted">{replay.incidentId}</span> {replay.incident.title}
          </h3>
          <p className="replay-alert">{replay.incident.alert}</p>
          <p className="muted small">
            {replay.incident.lineCount} log lines across {replay.incident.services.length} services · {replay.label.difficulty}. The agent
            starts with only this alert and a per-service summary, and pulls log lines through tools.
          </p>
          <details>
            <summary>Opening overview</summary>
            <pre className="replay-output">{replay.incident.overview}</pre>
          </details>
          <h4>Compare investigations</h4>
          <RunPicker replay={replay} active={runIdx} onPick={pickRun} />
          <ul className="replay-legend">
            <li className="replay-line is-evidence">labeled evidence</li>
            <li className="replay-line is-herring">planted red herring</li>
          </ul>
        </aside>

        <div className="replay-trace">
          <div className="replay-controls">
            <button
              className="button"
              onClick={() => {
                if (!playing) track('replay_played', { incident: replay.incidentId, run: run.key })
                setPlaying((p) => !p)
              }}
              disabled={done && !playing}
            >
              {playing ? 'Pause' : done ? 'Done' : shown > 1 ? 'Resume' : 'Play'}
            </button>
            <button className="button is-quiet" onClick={() => setShown((s) => Math.min(total, s + 1))} disabled={done}>
              Next step
            </button>
            <button className="button is-quiet" onClick={() => { setShown(total); setPlaying(false) }} disabled={done}>
              Show all
            </button>
            <button className="button is-quiet" onClick={() => { setShown(1); setPlaying(false) }} disabled={shown <= 1}>
              Restart
            </button>
            <span className="muted small replay-progress" aria-live="polite">
              {Math.min(shown, steps.length)} / {steps.length} tool call{steps.length === 1 ? '' : 's'}
              {done ? ' · verdict' : ''}
            </span>
          </div>

          <ol className="replay-steps">
            {steps.slice(0, shown).map((s, i) => (
              <li key={`${run.key}-${i}`} className="replay-step">
                <div className="replay-step-call mono">
                  <span className="replay-step-n">{i + 1}</span>
                  {describeInput(s.tool, s.input)}
                  {s.isError && <span className="replay-badge tone-bad">error</span>}
                </div>
                <ToolOutput text={s.output} roleOf={roleOf} />
              </li>
            ))}
            {done && (
              <li className="replay-step is-verdict">
                <div className="replay-step-call mono">
                  <span className="replay-step-n">✓</span>
                  submit_triage
                </div>
                <Verdict run={run} replay={replay} lineText={lineText} />
              </li>
            )}
          </ol>
        </div>
      </div>
    </section>
  )
}
