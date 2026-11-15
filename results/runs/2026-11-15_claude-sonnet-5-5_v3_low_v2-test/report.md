# Eval run `2026-11-15_claude-sonnet-5-5_v3_low_v2-test`

Model **claude-sonnet-5-5** · prompt **v3** · tools v2 · effort **low** · 48 incidents from `incidents/v2/test` · generator v2 seed `log-triage-v2-test` · commit `9e5db7a` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **94%** | 98% | 96% | 91% / 71% | 0.08 (4/48) | 0.09 | 0.04 | $0.02 | 5.7s / 12.3s |

95% bootstrap intervals (resampling incidents): top-1 [85–100], lenient [94–100], evidence precision [86–94], recall [66–76], cost / incident [$0.02–$0.03]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $1.10. Mean 2.8 turns, 2.3 tool calls, 16,040 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 4 of them (mean 0.22 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 91% | 86% |
| medium | 16 | 94% | 94% | 94% | 88% | 66% |
| hard | 16 | 88% | 100% | 94% | 92% | 60% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 100% | 67% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 100% | 77% |
| bad_deploy | 6 | 100% | 100% | 100% | 100% | 80% |
| config_error | 6 | 83% | 100% | 100% | 96% | 81% |
| poison_message | 6 | 100% | 100% | 100% | 100% | 62% |
| data_integrity | 6 | 100% | 100% | 100% | 75% | 62% |
| cascading_failure | 6 | 67% | 83% | 67% | 66% | 53% |
| external_outage | 6 | 100% | 100% | 100% | 88% | 82% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 1 | 0.55 | 0% |
| 0.6–0.8 | 2 | 0.65 | 50% |
| 0.8–1.0 | 45 | 0.90 | 98% |

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
| cascading_failure (CF) | · | 2 | · | · | · | · | 4 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (3)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| ht-004 | hard | cascading_failure/cache-stampede | resource_exhaustion (0.60) | yes | submitted |
| ht-006 | medium | cascading_failure/cache-stampede | resource_exhaustion (0.55) | no | submitted |
| ht-014 | hard | config_error/wrong-endpoint | bad_deploy (0.80) | yes | submitted |
