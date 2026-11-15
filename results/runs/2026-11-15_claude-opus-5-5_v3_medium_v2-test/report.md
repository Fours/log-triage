# Eval run `2026-11-15_claude-opus-5-5_v3_medium_v2-test`

Model **claude-opus-5-5** · prompt **v3** · tools v2 · effort **medium** · 48 incidents from `incidents/v2/test` · generator v2 seed `log-triage-v2-test` · commit `9e5db7a` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **98%** | 100% | 100% | 89% / 89% | 0.81 (23/48) | 0.07 | 0.03 | $0.08 | 14.2s / 22.5s |

95% bootstrap intervals (resampling incidents): top-1 [94–100], lenient [100–100], evidence precision [84–94], recall [85–93], cost / incident [$0.07–$0.08]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $3.63. Mean 4.5 turns, 5.3 tool calls, 33,677 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 22 of them (mean 1.94 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 89% | 91% |
| medium | 16 | 100% | 100% | 100% | 88% | 88% |
| hard | 16 | 94% | 100% | 100% | 91% | 88% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 100% | 91% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 100% | 96% |
| bad_deploy | 6 | 100% | 100% | 100% | 100% | 97% |
| config_error | 6 | 83% | 100% | 100% | 92% | 97% |
| poison_message | 6 | 100% | 100% | 100% | 100% | 81% |
| data_integrity | 6 | 100% | 100% | 100% | 73% | 93% |
| cascading_failure | 6 | 100% | 100% | 100% | 66% | 75% |
| external_outage | 6 | 100% | 100% | 100% | 83% | 82% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 0 | — | — |
| 0.8–1.0 | 48 | 0.90 | 98% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **1**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 6 | · | · | · | · | · | · | · | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 6 | · | · | · | · | · | · |
| config_error (CE) | · | · | 1 | 5 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | · | · | · | · | · | · | 6 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (1)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| ht-014 | hard | config_error/wrong-endpoint | bad_deploy (0.88) | yes | submitted |
