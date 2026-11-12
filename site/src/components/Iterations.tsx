import { pct, results, run, usd } from '../data'
import DiffChart from './DiffChart'
import SectionHeading from './SectionHeading'

const STORY: Record<string, { change: string; verdict: 'start' | 'kept' | 'rejected'; note: string }> = {
  devV1: {
    change: 'Starting prompt',
    verdict: 'start',
    note: 'Right root cause almost every time, but a third of the cited lines were downstream symptoms: gateway 504s, saturated pools.',
  },
  devV2: {
    change: 'Say what counts as evidence; add a confidence rubric',
    verdict: 'kept',
    note: 'Cite the fault and what fails directly because of it, and describe the spread in the reasoning. Evidence precision jumped, and calibration error fell to a quarter.',
  },
  devV3: {
    change: 'Define the eight categories, with tie-break rules',
    verdict: 'kept',
    note: 'The prompt had listed bare category names. Every remaining miss was a boundary case: a lock wait vs. pool exhaustion, a hung third party vs. an outage.',
  },
  devV3Low: {
    change: 'Same prompt, low effort',
    verdict: 'kept',
    note: 'Half the tool calls and lower latency, at the same accuracy. Recall slips a few points. This run read cache left by the run before it, so its cost is understated.',
  },
  devV4Low: {
    change: 'Seed the overview with each service’s earliest warning',
    verdict: 'rejected',
    note: 'It anchored the agent on whatever warned first, which here is often a planted red herring. Recall fell and herring citations rose.',
  },
}

export default function Iterations() {
  return (
    <section id="iterations" className="section container">
      <SectionHeading
        eyebrow="Prompt iteration"
        title="Four versions, one rejected, one claim walked back"
        lede="Each attempt is a new versioned prompt and a full eval run; old versions are never edited, so every row can be reproduced. Dev-set numbers, Opus 5.5."
      />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>version</th>
              <th>change</th>
              <th className="num">top-1</th>
              <th className="num">evidence P / R</th>
              <th className="num">ECE</th>
              <th className="num">cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.iterations.map((key) => {
              const r = run(key)
              const s = STORY[key]
              return (
                <tr key={key} className={s.verdict === 'rejected' ? 'is-rejected' : ''}>
                  <td className="mono">
                    {r.prompt}
                    {r.effort === 'low' ? ' · low' : ''}
                  </td>
                  <td>
                    <strong>{s.change}</strong>
                    <span className="table-note">{s.note}</span>
                  </td>
                  <td className="num">{pct(r.top1)}</td>
                  <td className="num">
                    {pct(r.evidencePrecision)} / {pct(r.evidenceRecall)}
                  </td>
                  <td className="num">{r.ece.toFixed(2)}</td>
                  <td className="num">
                    {usd(r.meanUsd)}
                    {key === 'devV3Low' ? '*' : ''}
                  </td>
                  <td>
                    <span className={`tag is-${s.verdict}`}>{s.verdict === 'start' ? 'baseline' : s.verdict}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        * Runs that share a prompt and start within five minutes read each other’s prompt cache, so this one looks cheaper than it is. Cold, the
        same configuration cost {usd(run('opusLowTest').meanUsd)} on the held-out set. All held-out runs were ordered so none could share cache.
      </p>

      <div className="callout">
        <h3>What held up, and what didn’t</h3>
        <p>
          On the held-out set, v1’s three misses were exactly the boundary cases v3’s definitions address, and v3 fixed all three. That looked like
          a top-1 win. With paired error bars, it isn’t one: two incidents out of 48 is consistent with no change. The evidence-precision gain is
          large and certain. The write-up was corrected to say so.
        </p>
      </div>
      <DiffChart />
    </section>
  )
}
