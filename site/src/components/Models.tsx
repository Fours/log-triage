import { useState } from 'react'
import { pct, results, run, secs, usd } from '../data'
import { track } from '../analytics'
import DiffChart from './DiffChart'
import ModelChart from './ModelChart'
import SectionHeading from './SectionHeading'

type Dataset = 'v1' | 'v2'

const SWITCH: { id: Dataset; label: string }[] = [
  { id: 'v1', label: 'v1 incidents' },
  { id: 'v2', label: 'v2: harder incidents' },
]

const NOISE_FLOOR = 'Haiku low, run 1 → run 2 (identical)'

export default function Models() {
  const [dataset, setDataset] = useState<Dataset>('v1')
  const pick = (d: Dataset) => {
    setDataset(d)
    track('models_dataset_selected', { dataset: d })
  }
  const rows = (dataset === 'v1' ? results.matrix : results.v2.matrix).map(run)
  const v1 = results.dataset
  const v2 = results.v2.dataset

  return (
    <section id="models" className="section container">
      <SectionHeading
        eyebrow="Model comparison"
        title="The cheapest model was the right one"
        lede="Haiku, Sonnet and Opus 5.5 at low and medium effort, same prompt, same 48 held-out incidents, each run on a cold cache. Then the same matrix again on a harder incident set built to break the shortcuts the agents were using."
      />
      <div className="dataset-switch" role="tablist" aria-label="Incident set">
        <span className="dataset-switch-label">Incident set:</span>
        {SWITCH.map((s) => (
          <button key={s.id} role="tab" aria-selected={dataset === s.id} className={`chip${dataset === s.id ? ' is-active' : ''}`} onClick={() => pick(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {dataset === 'v1' ? (
        <p className="dataset-note">
          Generator v1: {v1.incidents} incidents of {v1.minLines}–{v1.maxLines} log lines, one fault each, the cause usually logged as a warning or
          error near onset.
        </p>
      ) : (
        <p className="dataset-note">
          Generator v2: {v2.incidents} incidents of {v2.minLines.toLocaleString()}–{v2.maxLines.toLocaleString()} log lines. Causes logged quietly
          and in several wordings, error floods on unrelated services, a harmless deploy or config change on the failing path just before the
          fault, and a second, unrelated incident at the same time. The keyword baseline drops from {pct(run('baselineTest').top1)} to{' '}
          {pct(run(results.v2.baseline).top1)}.
        </p>
      )}

      <ModelChart
        keys={dataset === 'v1' ? results.matrix : results.v2.matrix}
        subtitle={dataset === 'v1' ? 'v1 held-out test set, prompt v3 · all six reach 98–100% top-1' : 'v2 held-out test set, prompt v3 · all six reach 94–100% top-1'}
        ariaLabel={
          dataset === 'v1'
            ? 'Scatter plot of cost per incident against evidence recall on the v1 test set. Haiku is cheapest at about a quarter of a cent with 87–88% recall; Sonnet is mid-priced with 73–74% recall; Opus is most expensive with 85–89% recall.'
            : 'Scatter plot of cost per incident against evidence recall on the v2 test set. Haiku is cheapest at under half a cent with 88–89% recall; Sonnet is mid-priced with 71–75% recall; Opus is most expensive with 80–89% recall.'
        }
      />
      <ModelTable rows={rows} />
      {dataset === 'v1' ? <V1Cards /> : <V2Findings />}
    </section>
  )
}

function ModelTable({ rows }: { rows: ReturnType<typeof run>[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>model</th>
            <th>effort</th>
            <th className="num">top-1</th>
            <th className="num">lenient</th>
            <th className="num">hard top-1</th>
            <th className="num">evidence P / R</th>
            <th className="num">ECE</th>
            <th className="num">cost / incident</th>
            <th className="num">p50 latency</th>
            <th className="num">tool calls</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.modelName}</td>
              <td>{r.effort}</td>
              <td className="num">{pct(r.top1)}</td>
              <td className="num">{pct(r.top1Lenient)}</td>
              <td className="num">{r.hardTop1 === null ? '—' : pct(r.hardTop1)}</td>
              <td className="num">
                {pct(r.evidencePrecision)} / {pct(r.evidenceRecall)}
              </td>
              <td className="num">{r.ece.toFixed(2)}</td>
              <td className="num">{usd(r.meanUsd)}</td>
              <td className="num">{secs(r.p50Ms)}</td>
              <td className="num">{r.meanToolCalls.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function V1Cards() {
  const haiku = run('haikuLowTest')
  const opus = run('opusLowTest')
  const sonnet = run('sonnetLowTest')
  return (
    <div className="cards">
      <div className="card">
        <h3>Haiku: cheapest, and thorough</h3>
        <p>
          Same accuracy and evidence as Opus, within noise, at {usd(haiku.meanUsd)} vs. {usd(opus.meanUsd)}. It gets there by reading more:{' '}
          {haiku.meanToolCalls.toFixed(0)} tool calls to Opus’s {opus.meanToolCalls.toFixed(0)}, so it’s a few seconds slower.
        </p>
      </div>
      <div className="card">
        <h3>Sonnet: fastest, least diligent</h3>
        <p>
          {secs(sonnet.p50Ms)} median and {sonnet.meanToolCalls.toFixed(1)} tool calls, but it cites fewer lines than the evidence holds, so recall
          is {pct(opus.evidenceRecall - sonnet.evidenceRecall)} below Opus’s. Its confidence is the most informative: its one miss was its only
          answer below 0.8.
        </p>
      </div>
      <div className="card">
        <h3>Nobody was confidently wrong</h3>
        <p>
          Every miss across all six runs picked the labeled acceptable alternative on an ambiguous incident. Haiku’s higher calibration error is
          under-confidence: right on all {haiku.n}, at 0.84 average confidence.
        </p>
      </div>
    </div>
  )
}

function V2Findings() {
  const matrix = results.v2.matrix.map(run)
  const repeats = results.v2.repeats.map(run)
  const all = [...new Map([...matrix, ...repeats].map((r) => [r.key, r])).values()]
  const lo = Math.min(...all.map((r) => r.top1))
  const hi = Math.max(...all.map((r) => r.top1))
  const repLo = Math.min(...repeats.map((r) => r.top1))
  const repHi = Math.max(...repeats.map((r) => r.top1))
  const opusLow = run('v2OpusLow')
  const opusMed = run('v2OpusMedium')
  const sonnetLow = run('v2SonnetLow')
  const haiku = run('v2HaikuLow')
  const floor = results.v2.paired.find((p) => p.label === NOISE_FLOOR)!
  const floorTop1 = floor.diffs.find((d) => d.metric === 'top1')!
  const fmt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}`
  return (
    <>
      <div className="cards">
        <div className="card">
          <h3>No model wins on diagnosis</h3>
          <p>
            Every run lands at {pct(lo)}–{pct(hi)} top-1. The planted bait didn't work: in {all.length * 48} investigations, no top hypothesis cited a
            lookalike, a decoy or the second incident. The one bait-driven miss came from an older herring (see the crash-loop replay). The models follow the failing request’s chain and ignore what isn’t on it.
          </p>
        </div>
        <div className="card">
          <h3>Same model, same settings, different answers</h3>
          <p>
            Three identical Haiku runs scored {repeats.map((r) => pct(r.top1)).join(', ')}: a {Math.round((repHi - repLo) * 100)}-point spread,
            wider than any gap between models. The paired test calls run 1 vs. run 2 a real difference ({fmt(floorTop1.diff)} pts, 95% [
            {fmt(floorTop1.ci[0])}, {fmt(floorTop1.ci[1])}]). It resamples incidents, not reruns, so it understates noise.
          </p>
        </div>
        <div className="card">
          <h3>What still separates them</h3>
          <p>
            Cost: Haiku at {usd(haiku.meanUsd)} is 1/{Math.round(opusLow.meanUsd! / haiku.meanUsd!)} of Opus low. Speed: Sonnet answers in{' '}
            {secs(sonnetLow.p50Ms)}. Evidence: Sonnet low recalls {pct(opusLow.evidenceRecall - sonnetLow.evidenceRecall)} less than Opus low, and
            Opus medium {pct(opusMed.evidenceRecall - opusLow.evidenceRecall)} more, at {usd(opusMed.meanUsd)}.
          </p>
        </div>
      </div>
      <DiffChart
        rows={results.v2.paired}
        title="v2, with the noise floor"
        subtitle="paired over the same 48 v2 test incidents · 95% bootstrap intervals, in points"
        noiseFloor={NOISE_FLOOR}
        note="The highlighted top row compares Haiku with itself: two runs, identical settings. Its top-1 interval excludes zero anyway, so on top-1 a model-vs-model gap is only trustworthy if it's larger than that row's. None is. The recall gaps for Sonnet and Opus medium are larger than the spread across Haiku's three runs."
      />
    </>
  )
}
