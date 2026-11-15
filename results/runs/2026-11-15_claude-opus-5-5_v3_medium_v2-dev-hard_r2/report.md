# Eval run `2026-11-15_claude-opus-5-5_v3_medium_v2-dev-hard_r2`

Model **claude-opus-5-5** · prompt **v3** · tools v2 · effort **medium** · 16 incidents from `incidents/v2/dev` · generator v2 seed `log-triage-v2` · commit `6a25997` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **94%** | 100% | 100% | 90% / 87% | 0.63 (6/16) | 0.05 | 0.05 | $0.09 | 13.5s / 23.7s |

95% bootstrap intervals (resampling incidents): top-1 [81–100], lenient [100–100], evidence precision [82–97], recall [79–94], cost / incident [$0.08–$0.10]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 16 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $1.38. Mean 4.8 turns, 5.8 tool calls, 40,980 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 16 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 9 of them (mean 1.25 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| hard | 16 | 94% | 100% | 100% | 90% | 87% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 2 | 100% | 100% | 100% | 100% | 95% |
| resource_exhaustion | 2 | 100% | 100% | 100% | 100% | 100% |
| bad_deploy | 2 | 100% | 100% | 100% | 100% | 92% |
| config_error | 2 | 50% | 100% | 100% | 100% | 100% |
| poison_message | 2 | 100% | 100% | 100% | 100% | 75% |
| data_integrity | 2 | 100% | 100% | 100% | 67% | 77% |
| cascading_failure | 2 | 100% | 100% | 100% | 71% | 72% |
| external_outage | 2 | 100% | 100% | 100% | 86% | 85% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 0 | — | — |
| 0.8–1.0 | 16 | 0.89 | 94% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **1**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 2 | · | · | · | · | · | · | · | · |
| resource_exhaustion (RE) | · | 2 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 2 | · | · | · | · | · | · |
| config_error (CE) | · | · | 1 | 1 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 2 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 2 | · | · | · |
| cascading_failure (CF) | · | · | · | · | · | · | 2 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 2 | · |

## Misses (1)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| h-025 | hard | config_error/wrong-endpoint | bad_deploy (0.82) | yes | submitted |
