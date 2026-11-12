# Eval run `2026-11-12_claude-haiku-5-5_v3_low_test`

Model **claude-haiku-5-5** · prompt **v3** · effort **low** · 48 incidents from `incidents/test` · generator v1 seed `log-triage-test-v1` · commit `b4ba01b` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **100%** | 100% | 100% | 90% / 87% | 0.15 (6/48) | 0.16 | 0.03 | $0.0026 | 10.3s / 16.0s |

95% bootstrap intervals (resampling incidents): top-1 [100–100], lenient [100–100], evidence precision [86–94], recall [83–91], cost / incident [$0.0024–$0.0027]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.12. Mean 4.9 turns, 5.0 tool calls, 36,079 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 91% | 89% |
| medium | 16 | 100% | 100% | 100% | 86% | 87% |
| hard | 16 | 100% | 100% | 100% | 94% | 85% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 100% | 69% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 95% | 87% |
| bad_deploy | 6 | 100% | 100% | 100% | 97% | 92% |
| config_error | 6 | 100% | 100% | 100% | 91% | 93% |
| poison_message | 6 | 100% | 100% | 100% | 90% | 86% |
| data_integrity | 6 | 100% | 100% | 100% | 82% | 88% |
| cascading_failure | 6 | 100% | 100% | 100% | 71% | 88% |
| external_outage | 6 | 100% | 100% | 100% | 97% | 93% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 7 | 0.67 | 100% |
| 0.8–1.0 | 41 | 0.87 | 100% |

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
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (0)

None.
