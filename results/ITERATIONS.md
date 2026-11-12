# Prompt iterations (Phase 4)

What each prompt version changed, why, and what it did to the numbers, including what didn't work. The prompts themselves are in [`src/prompts.ts`](../src/prompts.ts); old versions are never edited, so every run below can be reproduced.

**Method.** Tune on the dev set (`incidents/generated`, 48 incidents). Then run the candidates once on a **held-out test set** (`incidents/test`): 48 incidents from a different seed, with every scenario placed on a different service topology than in the dev set. Nothing was tuned on the test set, so its numbers are the ones to trust. Model: `claude-opus-5-5` throughout.

## Starting point: v1 (Phase 3)

96% top-1, but a third of cited evidence was downstream symptoms (evidence precision 64%), and the agent was under-confident (ECE 0.16). Both misses were the same scenario: a held row lock classified as `resource_exhaustion`.

## Dev-set iterations

| version | change | top-1 | lenient | evidence P / R | ECE | confidently wrong | cost / incident | p50 latency | kept? |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| [v1](runs/2026-11-12_claude-opus-5-5/report.md) | Phase 3 prompt | 96% | 96% | 64% / 94% | 0.16 | 0 | $0.049 | 13.0s | baseline |
| [v2](runs/2026-11-12_claude-opus-5-5_v2/report.md) | + what to cite; + confidence rubric | 92% | 98% | **89%** / 91% | **0.04** | 3 | $0.053 | 12.7s | yes |
| [v3](runs/2026-11-12_claude-opus-5-5_v3/report.md) | + category definitions and tie-breaks | **98%** | **100%** | 90% / 91% | 0.07 | 1 | $0.055 | 12.2s | **yes** |
| [v3, low effort](runs/2026-11-12_claude-opus-5-5_v3_low/report.md) | effort `low` | 100% | 100% | 90% / 86% | 0.10 | 0 | ~$0.036* | 7.8s | yes |
| [v4, low effort](runs/2026-11-12_claude-opus-5-5_v4_low/report.md) | + earliest WARN+ line per service in the opening overview | 98% | 100% | 90% / 81% | 0.08 | 1 | $0.037 | 7.4s | **no** |

\* Measured $0.022, but that run read prompt cache written by the v3 run just before it (see "Cost needs a cold cache" below). Repriced cold, it's about $0.036, and the held-out run of the same configuration, which was cold, cost $0.038.

### v2: what counts as evidence, and what a confidence level means

**Why.** In Phase 3, of 453 lines cited across all top hypotheses, 153 were symptoms: gateway 504s, connection pools at capacity, pool checkout timeouts. The agent was describing the whole chain, but evidence should show the cause. Separately, 36 answers at ~0.87 confidence were all correct.

**Change.** Cite the fault at its origin and the failures it causes directly; describe further spread in the reasoning instead. Plus a confidence rubric: what 0.95+, 0.8–0.9 and 0.5–0.75 each mean.

**Result.** Evidence precision went from 64% to 89%, and recall barely moved (94% to 91%). ECE went from 0.16 to 0.04. Top-1 fell to 92%, but three of the four misses picked the labeled acceptable alternative, so lenient accuracy rose to 98%. The more decisive confidence also produced 3 confidently-wrong answers, up from 0. Two incidents of movement is within run-to-run noise at n=48, but the misses had a common cause, which led to v3.

### v3: define the categories

**Why.** The prompt listed the eight category names with no definitions. The definitions existed, as comments in `src/types.ts`, but the model never saw them. Every miss so far was a boundary case: a lock wait vs. pool exhaustion, a hung third party vs. an outage, a failed migration vs. a bad deploy, a cache stampede vs. resource exhaustion.

**Change.** A one-line definition per category, plus four tie-break rules: classify by what started it, not by what it used up; hangs are `dependency_timeout` while fast failures are `external_outage`; a broken migration is `data_integrity`; amplification is `cascading_failure`.

**Caveat.** These rules were written after seeing which boundaries the agent confused on the dev set, so they move the prompt toward the dataset's labeling conventions. That's a legitimate fix, since a real triage system would document its taxonomy, but it's exactly the kind of change that can overfit. That's why the held-out set matters.

**Result.** 98% top-1 and 100% lenient on the dev set. The lock-wait scenario it missed in every earlier run is now correct. The one remaining miss chose the labeled alternative.

### Effort: low

The agent made about 2 tool calls instead of 4, with the same accuracy, latency down from 12s to 8s, and cost down about 35%. Evidence recall dropped 5 points (91% to 86%), because it reads less before submitting.

### v4: give the agent a head start (rejected)

**Why.** If the opening overview already lists where each service first went wrong, the agent could skip a search or two, and low effort might recover some recall.

**Result.** Worse on every axis that moved. Recall fell further (86% to 81%), more incidents cited a red herring (14 vs. 9), and one more answer was wrong. The tool-call count didn't change. The pointer list anchors the agent on whatever warned first, and in this dataset the earliest warning is often deliberately unrelated, like a red herring planted near the onset. Kept in `src/prompts.ts` as a recorded negative result.

## Held-out test set

Each configuration was run once, cold, after tuning was finished.

| run | top-1 | lenient | evidence P / R | ECE | confidently wrong | cost / incident | p50 latency |
|---|---:|---:|---:|---:|---:|---:|---:|
| [keyword baseline](runs/2026-11-12_baseline-keywords_test/report.md) | 54% | 56% | 47% / 47% | 0.24 | 11 | — | — |
| [v1](runs/2026-11-12_claude-opus-5-5_v1_test/report.md) | 94% | 98% | 63% / 95% | 0.17 | 0 | $0.048 | 12.0s |
| [**v3**](runs/2026-11-12_claude-opus-5-5_v3_test/report.md) | **98%** | **100%** | 89% / 89% | **0.07** | 1 | $0.055 | 12.5s |
| [**v3, low effort**](runs/2026-11-12_claude-opus-5-5_v3_low_test/report.md) | **98%** | **100%** | **91%** / 85% | 0.08 | 1 | **$0.038** | **7.7s** |

**The dev-set gains held up on new incidents.** v1's three held-out misses were a lock wait, a hung third party and a cache stampede. Those are exactly the boundaries v3's definitions address, on incidents and topologies the prompt was never tuned on, and v3 got all three right. Evidence precision rose 26–28 points, at a cost of 6–10 points of recall. Calibration error more than halved.

**What's statistically established, and what isn't** (added in Phase 5, from `npm run compare`: paired bootstrap over the same 48 incidents, 95% intervals):

| v1 → v3, held-out | difference | 95% interval |
|---|---:|---:|
| evidence precision | +25.7 pts | +21.0 to +30.1 |
| evidence recall | −5.6 pts | −8.9 to −2.3 |
| cost / incident | +$0.007 | +$0.005 to +$0.009 |
| top-1 | +4.2 pts | **−4.2 to +12.5** |
| top-1 (lenient) | +2.1 pts | 0.0 to +6.3 |

The evidence gain is large and certain. The top-1 gain is not: two incidents out of 48 is consistent with no change. The misses v3 fixed are the right kind of evidence that the definitions help, but this dataset is too small and too easy to prove it. The same holds on the dev set (v1 → v3 top-1 +2.1 pts, interval −4.2 to +10.4).

**v3's one miss is the same in both runs:** a wrong endpoint that shipped with a release, called `bad_deploy` at 0.80–0.82 confidence. The label accepts `bad_deploy` as a defensible alternative, so it's a top-1 miss but not a wrong answer.

**Low effort is the better trade for this dataset:** the same accuracy at 30% lower cost and 40% lower latency, with 4 points less evidence recall. All three differences are outside the noise: cost −$0.017 [−$0.019, −$0.015], latency −4.2s [−4.9, −3.3], recall −4.0 pts [−7.5, −0.8]. The default effort is left unchanged for now; the trade-off is recorded here. With every configuration at 98% top-1 on 48 incidents, the dataset no longer separates them on accuracy. That's the case for a harder generator version before the model comparison (Phase 5).

**Spend.** Phase 4 cost $14.81 in API usage: $10.01 for five dev-set runs and $6.80 for three held-out runs (the baseline is free).

## Cost needs a cold cache

Requests use automatic prompt caching, and caching is keyed on the prompt prefix (tools, system prompt, first message), not on the effort setting. Two runs that share a prompt version and start within the 5-minute cache lifetime therefore share cache. The second run's first request per incident reads what the first run wrote, and looks cheaper than it is. The dev-set v3-low run cost $1.05 this way; the same configuration run cold on the test set cost $1.83.

Within one investigation, caching is real and is supposed to count: each turn re-sends the conversation so far. Across runs it's an artifact of running them back to back. The held-out runs were ordered so that none could read another's cache: v3-low first, then v1 (a different system prompt), then v3 after the cache had expired.
