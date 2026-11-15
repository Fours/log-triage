# Eval run `2026-11-15_claude-haiku-5-5_v3_low_v2-dev`

Model **claude-haiku-5-5** · prompt **v3** · tools v2 · effort **low** · 48 incidents from `incidents/v2/dev` · generator v2 seed `log-triage-v2` · commit `6a25997`

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **98%** | 100% | 100% | 87% / 87% | 1.06 (15/48) | 0.15 | 0.04 | $0.0038 | 13.3s / 21.9s |

95% bootstrap intervals (resampling incidents): top-1 [94–100], lenient [100–100], evidence precision [83–91], recall [83–91], cost / incident [$0.0034–$0.0041]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.18. Mean 6.3 turns, 7.9 tool calls, 70,363 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 16 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 4 of them (mean 0.88 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 85% | 90% |
| medium | 16 | 100% | 100% | 100% | 87% | 84% |
| hard | 16 | 94% | 100% | 100% | 90% | 85% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 98% | 78% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 91% | 93% |
| bad_deploy | 6 | 100% | 100% | 100% | 93% | 97% |
| config_error | 6 | 100% | 100% | 100% | 97% | 97% |
| poison_message | 6 | 100% | 100% | 100% | 73% | 79% |
| data_integrity | 6 | 100% | 100% | 100% | 79% | 85% |
| cascading_failure | 6 | 100% | 100% | 100% | 78% | 84% |
| external_outage | 6 | 83% | 100% | 100% | 89% | 80% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 2 | 0.53 | 50% |
| 0.6–0.8 | 5 | 0.71 | 100% |
| 0.8–1.0 | 41 | 0.86 | 100% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **0**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 6 | · | · | · | · | · | · | · | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 6 | · | · | · | · | · | · |
| config_error (CE) | · | · | · | 6 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | · | · | · | · | · | · | 6 | · | · |
| external_outage (EO) | 1 | · | · | · | · | · | · | 5 | · |

## Misses (1)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| h-014 | hard | external_outage/provider-5xx | dependency_timeout (0.55) | yes | submitted |
