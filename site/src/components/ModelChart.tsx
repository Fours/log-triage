import { useState } from 'react'
import { pct, results, run, secs, usd, type RunSummary } from '../data'

/**
 * Cost per incident (log scale) vs. evidence recall, one point per model ×
 * effort. Color = model (validated 3-slot dark palette), fill = effort
 * (solid low, hollow medium), and every point is direct-labeled, so identity
 * never rests on color alone. The table below the chart is the table view.
 */

const MODEL_SLOT: Record<string, string> = {
  'claude-haiku-5-5': 'var(--series-1)',
  'claude-sonnet-5-5': 'var(--series-2)',
  'claude-opus-5-5': 'var(--series-3)',
}

const W = 1000
const H = 440
const M = { top: 20, right: 28, bottom: 52, left: 56 }
const X_MIN = 0.0015
const X_MAX = 0.1
const Y_MIN = 0.6
const Y_MAX = 1

const x = (usdValue: number) =>
  M.left + ((Math.log10(usdValue) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN))) * (W - M.left - M.right)
const y = (r: number) => M.top + ((Y_MAX - r) / (Y_MAX - Y_MIN)) * (H - M.top - M.bottom)

const X_TICKS = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1]
const Y_TICKS = [0.6, 0.7, 0.8, 0.9, 1]

// Label offsets so the six direct labels don't collide (points are hand-checked).
const LABEL_POS: Record<string, { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }> = {
  haikuLowTest: { dx: -12, dy: 4, anchor: 'end' },
  haikuMediumTest: { dx: 12, dy: -10, anchor: 'start' },
  sonnetLowTest: { dx: -12, dy: 4, anchor: 'end' },
  sonnetMediumTest: { dx: 12, dy: 16, anchor: 'start' },
  opusLowTest: { dx: -12, dy: -8, anchor: 'end' },
  opusMediumTest: { dx: 0, dy: -16, anchor: 'middle' },
}

export default function ModelChart() {
  const points = results.matrix.map(run)
  const [hover, setHover] = useState<RunSummary | null>(null)

  return (
    <figure className="chart">
      <figcaption className="chart-title">
        Cost per incident vs. evidence recall
        <span className="muted"> · held-out test set, prompt v3 · all six reach 98–100% top-1</span>
      </figcaption>
      <div className="chart-legend" aria-hidden="true">
        {['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'].map((m) => (
          <span key={m} className="chart-legend-item">
            <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={MODEL_SLOT[m]} /></svg>
            {points.find((p) => p.model === m)?.modelName}
          </span>
        ))}
        <span className="chart-legend-item">
          <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--text-muted)" /></svg>low effort
        </span>
        <span className="chart-legend-item">
          <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="2" /></svg>medium effort
        </span>
      </div>
      <div className="chart-plot-scroll">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter plot of cost per incident against evidence recall for three models at two effort levels. Haiku is cheapest at about a quarter of a cent with 87–88% recall; Sonnet is mid-priced with 73–74% recall; Opus is most expensive with 85–89% recall.">
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={M.left - 10} y={y(t) + 4} textAnchor="end">{pct(t)}</text>
            </g>
          ))}
          {X_TICKS.map((t) => (
            <text key={t} className="chart-tick" x={x(t)} y={H - M.bottom + 20} textAnchor="middle">
              {t < 0.01 ? `$${t.toFixed(3)}` : `$${t.toFixed(2)}`}
            </text>
          ))}
          <line className="chart-axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
          <text className="chart-axis-label" x={(M.left + W - M.right) / 2} y={H - 8} textAnchor="middle">
            cost per incident (log scale) →
          </text>
          <text className="chart-axis-label" transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
            evidence recall →
          </text>

          {points.map((p) => {
            const cx = x(p.meanUsd!)
            const cy = y(p.evidenceRecall)
            const low = p.effort === 'low'
            const pos = LABEL_POS[p.key]
            return (
              <g key={p.key} className="chart-point" onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)} tabIndex={0}>
                {/* Interval on recall, so the gap between models reads against the noise. */}
                {p.intervals && (
                  <line className="chart-ci" x1={cx} x2={cx} y1={y(p.intervals.evidenceRecall[0])} y2={y(p.intervals.evidenceRecall[1])} stroke={MODEL_SLOT[p.model]} />
                )}
                <circle cx={cx} cy={cy} r="16" fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={low ? 7 : 6}
                  fill={low ? MODEL_SLOT[p.model] : 'var(--surface)'}
                  stroke={low ? 'var(--surface)' : MODEL_SLOT[p.model]}
                  strokeWidth={low ? 2 : 2.5}
                />
                <text className="chart-label" x={cx + pos.dx} y={cy + pos.dy} textAnchor={pos.anchor}>
                  {p.modelName.split(' ')[0]} {p.effort}
                </text>
              </g>
            )
          })}
        </svg>
        {hover && (
          <div className="chart-tooltip" style={{ left: `${(x(hover.meanUsd!) / W) * 100}%`, top: `${(y(hover.evidenceRecall) / H) * 100}%` }} role="status">
            <strong>
              {hover.modelName}, {hover.effort} effort
            </strong>
            <span>top-1 {pct(hover.top1)} · lenient {pct(hover.top1Lenient)}</span>
            <span>
              evidence P {pct(hover.evidencePrecision)} / R {pct(hover.evidenceRecall)}
              {hover.intervals && ` (R ${pct(hover.intervals.evidenceRecall[0])}–${pct(hover.intervals.evidenceRecall[1])})`}
            </span>
            <span>
              {usd(hover.meanUsd)} · {secs(hover.p50Ms)} p50 · {hover.meanToolCalls.toFixed(1)} tool calls
            </span>
          </div>
        )}
      </div>
      </div>
      <p className="chart-note muted small">Vertical lines are 95% bootstrap intervals on recall.</p>
    </figure>
  )
}
