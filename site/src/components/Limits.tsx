import SectionHeading from './SectionHeading'

export default function Limits() {
  return (
    <section id="limits" className="section container">
      <SectionHeading eyebrow="Limitations" title="What this doesn’t show yet" />
      <ul className="limits">
        <li>
          <strong>Synthetic incidents don’t separate these models on diagnosis.</strong> v1 was too easy (98–100% top-1 for every model), so
          generator v2 added quiet causes, long haystacks, error floods on unrelated services, harmless lookalike events on the failing path and a
          second, concurrent incident. The models still scored 92–100% and ignored the bait. The aim was 65–85% for Opus; it scored 94% on the
          hardest tier. Making fair synthetic logs harder for these models looks like diminishing returns. Real incident logs are the next step.
        </li>
        <li>
          <strong>Run-to-run noise is bigger than the error bars say.</strong> Three identical Haiku runs on v2 scored 100%, 92% and 98%. Paired
          bootstrap intervals resample incidents, not reruns, so they called two of those identical runs “different”. On top-1, no gap between
          models here is larger than that spread. Repeated runs are the honest error bar.
        </li>
        <li>
          <strong>One herring is debatable.</strong> In the consumer crash-loop scenario, a deploy of the crashing consumer lands minutes before it
          starts crashing, labeled as an unrelated red herring. A careful engineer could blame that deploy, and one Haiku run did (the crash-loop
          replay). It affects 5 of the 192 incidents across the four sets. It’s documented, not fixed: fixing it would change the v1 sets every
          earlier run was scored on.
        </li>
        <li>
          <strong>Synthetic logs.</strong> Real incidents are messier: missing logs, clock skew, causes outside the logged services. Exact labels
          were the trade for that realism.
        </li>
        <li>
          <strong>48 incidents per set is small.</strong> One incident moves top-1 by two points, which is why every comparison here carries paired
          95% intervals and, on v2, a measured run-to-run spread.
        </li>
        <li>
          <strong>Prompts were tuned with Opus, on v1.</strong> The smaller models ran the same prompt unchanged, and nothing was tuned on v2.
        </li>
      </ul>
    </section>
  )
}
