import { pct, results, run, secs, usd } from '../data'
import ModelChart from './ModelChart'
import SectionHeading from './SectionHeading'

export default function Models() {
  const rows = results.matrix.map(run)
  const haiku = run('haikuLowTest')
  const opus = run('opusLowTest')
  const sonnet = run('sonnetLowTest')
  return (
    <section id="models" className="section container">
      <SectionHeading
        eyebrow="Model comparison"
        title="The cheapest model was the right one"
        lede="Haiku, Sonnet and Opus 5.5 at low and medium effort, same prompt, same 48 held-out incidents, each run on a cold cache."
      />
      <ModelChart />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>model</th>
              <th>effort</th>
              <th className="num">top-1</th>
              <th className="num">lenient</th>
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
      <div className="cards">
        <div className="card">
          <h3>Haiku: cheapest, and thorough</h3>
          <p>
            Same accuracy and evidence as Opus, within noise, at {usd(haiku.meanUsd)} vs. {usd(opus.meanUsd)}. It gets there by reading more:
            {' '}{haiku.meanToolCalls.toFixed(0)} tool calls to Opus’s {opus.meanToolCalls.toFixed(0)}, so it’s a few seconds slower.
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
    </section>
  )
}
