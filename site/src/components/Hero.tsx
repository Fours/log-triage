import { pct, results, run, usd } from '../data'

const REPO = 'https://github.com/Fours/log-triage'

export default function Hero() {
  const haiku = run('haikuLowTest')
  const v1 = run('opusV1Test')
  const v3 = run('opusMediumTest')
  const baseline = run('baselineTest')
  const v2 = [...results.v2.matrix, ...results.v2.repeats].map(run)
  const v2Lo = Math.min(...v2.map((r) => r.top1))
  const v2Hi = Math.max(...v2.map((r) => r.top1))
  return (
    <header className="hero container">
      <p className="eyebrow">log-triage · an LLM agent, measured</p>
      <h1>
        An on-call triage agent that reads the logs, names the root cause, and <em>shows its evidence</em>.
      </h1>
      <p className="lede">
        Given an alert and a few hundred log lines it can only reach through tools, the agent investigates and returns ranked root-cause
        hypotheses, each citing the exact log lines behind it. The point of the project is the eval harness around it: a generated, labeled
        incident set with red herrings, deterministic scoring, a held-out test set, and error bars.
      </p>
      <div className="stats">
        <div className="stat">
          <span className="stat-value">{pct(haiku.top1)}</span>
          <span className="stat-label">root cause right on {haiku.n} unseen incidents (Haiku 5.5; keyword baseline {pct(baseline.top1)})</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {pct(v1.evidencePrecision)} → {pct(v3.evidencePrecision)}
          </span>
          <span className="stat-label">of cited log lines that are real evidence, from prompt iteration</span>
        </div>
        <div className="stat">
          <span className="stat-value">{usd(haiku.meanUsd)}</span>
          <span className="stat-label">per incident on Haiku, 1/15 the cost of Opus at the same accuracy</span>
        </div>
      </div>
      <p className="hero-note">
        <strong>Then a harder incident set.</strong> Generator v2 buries quiet causes in {results.v2.dataset.minLines.toLocaleString()}–
        {results.v2.dataset.maxLines.toLocaleString()} log lines with decoys, lookalike events and a second incident running at the same time.
        Every model still found the root cause {pct(v2Lo)}–{pct(v2Hi)} of the time, so no model wins on diagnosis.{' '}
        <a href="#models">See the v2 comparison</a>.
      </p>
      <div className="hero-links">
        <a className="button" href="#replay">
          Watch an investigation
        </a>
        <a className="button is-quiet" href={REPO}>
          Code on GitHub
        </a>
      </div>
    </header>
  )
}
