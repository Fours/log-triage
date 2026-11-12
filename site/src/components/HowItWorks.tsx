import SectionHeading from './SectionHeading'

/** Hand-placed diagram of the loop: the model never sees raw logs, only tool results. */
export default function HowItWorks() {
  return (
    <section id="how" className="section container">
      <SectionHeading
        eyebrow="Architecture"
        title="The model reasons; code does the rest"
        lede="Log parsing, filtering and trace correlation are plain, tested TypeScript. The model only decides what to look at next and what it means."
      />
      <figure className="arch">
        <svg viewBox="0 0 900 300" role="img" aria-label="Diagram: an incident's logs sit behind four deterministic tools. The agent loop sends the alert to Claude, runs the tools Claude asks for, and returns their output. Claude ends by calling submit_triage, whose verdict goes to a scorer that compares it with the hidden label.">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)" />
            </marker>
          </defs>

          <g className="arch-box is-store">
            <rect x="20" y="40" width="190" height="150" rx="10" />
            <text x="115" y="68" textAnchor="middle" className="arch-title">Incident</text>
            <text x="115" y="96" textAnchor="middle">alert + 120–410 log lines</text>
            <text x="115" y="122" textAnchor="middle" className="arch-dim">label (root cause,</text>
            <text x="115" y="140" textAnchor="middle" className="arch-dim">evidence lines) hidden</text>
            <text x="115" y="158" textAnchor="middle" className="arch-dim">from the agent</text>
          </g>

          <g className="arch-box is-tool">
            <rect x="260" y="20" width="200" height="190" rx="10" />
            <text x="360" y="48" textAnchor="middle" className="arch-title">Deterministic tools</text>
            <text x="360" y="78" textAnchor="middle" className="mono">list_services</text>
            <text x="360" y="104" textAnchor="middle" className="mono">search_logs</text>
            <text x="360" y="130" textAnchor="middle" className="mono">get_context</text>
            <text x="360" y="156" textAnchor="middle" className="mono">correlate_trace</text>
            <text x="360" y="186" textAnchor="middle" className="arch-dim">capped output, pure functions</text>
          </g>

          <g className="arch-box is-loop">
            <rect x="510" y="20" width="180" height="190" rx="10" />
            <text x="600" y="48" textAnchor="middle" className="arch-title">Agent loop</text>
            <text x="600" y="78" textAnchor="middle">turn, token, tool</text>
            <text x="600" y="98" textAnchor="middle">and time budgets</text>
            <text x="600" y="126" textAnchor="middle">parallel tool calls</text>
            <text x="600" y="154" textAnchor="middle">validates the verdict:</text>
            <text x="600" y="174" textAnchor="middle">cited lines must exist</text>
          </g>

          <g className="arch-box is-model">
            <rect x="740" y="60" width="140" height="110" rx="10" />
            <text x="810" y="98" textAnchor="middle" className="arch-title">Claude</text>
            <text x="810" y="124" textAnchor="middle">Opus, Sonnet</text>
            <text x="810" y="144" textAnchor="middle">or Haiku 5.5</text>
          </g>

          <g className="arch-box is-score">
            <rect x="420" y="240" width="300" height="50" rx="10" />
            <text x="570" y="270" textAnchor="middle">
              <tspan className="arch-title">Scorer</tspan> · plain code vs. the label, no LLM judge
            </text>
          </g>

          <line className="arch-edge" x1="210" y1="115" x2="256" y2="115" markerEnd="url(#arrow)" />
          <line className="arch-edge" x1="506" y1="100" x2="464" y2="100" markerEnd="url(#arrow)" />
          <line className="arch-edge" x1="464" y1="130" x2="506" y2="130" markerEnd="url(#arrow)" />
          <line className="arch-edge" x1="690" y1="100" x2="736" y2="100" markerEnd="url(#arrow)" />
          <line className="arch-edge" x1="736" y1="130" x2="690" y2="130" markerEnd="url(#arrow)" />
          <polyline className="arch-edge" points="600,210 600,236" fill="none" markerEnd="url(#arrow)" />
          <polyline className="arch-edge is-dashed" points="115,190 115,265 416,265" fill="none" markerEnd="url(#arrow)" />
          <text x="618" y="228" className="arch-dim">submit_triage</text>
          <text x="130" y="258" className="arch-dim">label</text>
        </svg>
      </figure>
      <div className="cards">
        <div className="card">
          <h3>Small context by design</h3>
          <p>The agent never gets the whole log. It asks for what it needs, a page at a time, which keeps each turn cheap and makes retrieval testable without an API key.</p>
        </div>
        <div className="card">
          <h3>Every failure is an outcome</h3>
          <p>Budgets, refusals, malformed tool calls, rate limits and running out of credits all end as a recorded outcome, never a crash, so a 48-incident run always finishes or resumes.</p>
        </div>
        <div className="card">
          <h3>Answers must cite evidence</h3>
          <p>A verdict naming log lines that don't exist, or a top hypothesis with no evidence, is sent back to the model to fix before it counts.</p>
        </div>
      </div>
    </section>
  )
}
