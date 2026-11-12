import { results, type PairedDiff } from '../data'

/**
 * Paired differences between runs on the same 48 incidents: one row per
 * comparison, one small multiple per metric on a shared ±30-point axis. A bar
 * that crosses zero is within noise; that state is carried by the "noise"
 * label as well as by tone. Drawn as one SVG so labels and rows stay aligned.
 */

const METRICS: { key: string; label: string }[] = [
  { key: 'top1', label: 'top-1 accuracy' },
  { key: 'evidencePrecision', label: 'evidence precision' },
  { key: 'evidenceRecall', label: 'evidence recall' },
]

const LABEL_W = 230
const PANEL_W = 240
const GAP = 24
const ROW = 52
const HEAD = 44
const RANGE = 0.3
const W = LABEL_W + METRICS.length * PANEL_W + (METRICS.length - 1) * GAP + 16

const panelX = (i: number) => LABEL_W + i * (PANEL_W + GAP)
const sx = (i: number, v: number) => panelX(i) + 8 + ((Math.max(-RANGE, Math.min(RANGE, v)) + RANGE) / (2 * RANGE)) * (PANEL_W - 16)
const fmt = (v: number) => (Math.round(v * 100) === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}`)

export default function DiffChart() {
  const rows = results.paired
  const H = HEAD + rows.length * ROW + 24
  return (
    <figure className="chart">
      <figcaption className="chart-title">
        What changed, with error bars
        <span className="muted"> · paired over the same 48 held-out incidents · 95% bootstrap intervals, in points</span>
      </figcaption>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="diff-svg" role="img" aria-label="Paired differences with 95% intervals for top-1 accuracy, evidence precision and evidence recall across four comparisons.">
          {METRICS.map((m, i) => (
            <g key={m.key}>
              <text className="diff-panel-title" x={panelX(i) + PANEL_W / 2} y={18} textAnchor="middle">
                {m.label}
              </text>
              {[-RANGE, 0, RANGE].map((t) => (
                <text key={t} className="chart-tick" x={sx(i, t)} y={H - 4} textAnchor="middle">
                  {fmt(t)}
                </text>
              ))}
              <line className="chart-axis" x1={panelX(i)} x2={panelX(i) + PANEL_W} y1={H - 20} y2={H - 20} />
              <line className="chart-zero" x1={sx(i, 0)} x2={sx(i, 0)} y1={HEAD - 10} y2={H - 20} />
            </g>
          ))}
          {rows.map((r, j) => {
            const cy = HEAD + j * ROW + ROW / 2
            return (
              <g key={r.label}>
                <text className="diff-row-label" x={0} y={cy + 4}>
                  {r.label}
                </text>
                {METRICS.map((m, i) => {
                  const d = r.diffs.find((x: PairedDiff) => x.metric === m.key)
                  if (!d) return null
                  return (
                    <g key={m.key} className={`diff-mark ${d.significant ? 'is-clear' : 'is-noise'}`}>
                      <title>{`${r.label}: ${m.label} ${fmt(d.diff)} pts, 95% [${fmt(d.ci[0])}, ${fmt(d.ci[1])}] ${d.significant ? '(clear)' : '(within noise)'}`}</title>
                      <line x1={sx(i, d.ci[0])} x2={sx(i, d.ci[1])} y1={cy} y2={cy} strokeWidth="4" strokeLinecap="round" />
                      <circle cx={sx(i, d.diff)} cy={cy} r="6" />
                      <text className="diff-value" x={sx(i, d.diff)} y={cy - 12} textAnchor="middle">
                        {fmt(d.diff)}
                        {d.significant ? '' : ' · noise'}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="chart-note muted small">
        A bar that crosses the dashed zero line is consistent with no change. Only intervals that exclude zero are drawn in the accent color, and
        every within-noise value is also labeled “noise”. Cost and latency differences, all clear, are in the model table below.
      </p>
    </figure>
  )
}
