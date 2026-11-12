import SectionHeading from './SectionHeading'

export default function Limits() {
  return (
    <section id="limits" className="section container">
      <SectionHeading eyebrow="Limitations" title="What this doesn’t show yet" />
      <ul className="limits">
        <li>
          <strong>The incidents are too easy now.</strong> Every model scores 98–100% on root cause, so the eval ranks them on cost, speed and
          evidence, but not on diagnosis. The next step is a harder generator version (multiple concurrent faults, quieter causes, longer
          haystacks) to re-run the same matrix on.
        </li>
        <li>
          <strong>Synthetic logs.</strong> Real incidents are messier: missing logs, clock skew, causes outside the logged services. Exact labels
          were the trade for that realism.
        </li>
        <li>
          <strong>48 incidents is small.</strong> One incident moves top-1 by two points, which is why every comparison here carries paired 95%
          intervals, and why two of the claims on this page are “within noise”.
        </li>
        <li>
          <strong>Prompts were tuned with Opus.</strong> The smaller models ran the same prompt unchanged; they might do better with their own.
        </li>
      </ul>
    </section>
  )
}
