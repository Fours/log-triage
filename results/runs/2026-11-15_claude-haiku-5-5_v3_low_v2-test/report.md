# Eval run `2026-11-15_claude-haiku-5-5_v3_low_v2-test`

Model **claude-haiku-5-5** · prompt **v3** · tools v2 · effort **low** · 48 incidents from `incidents/v2/test` · generator v2 seed `log-triage-v2-test` · commit `9e5db7a`

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **100%** | 100% | 100% | 86% / 88% | 0.98 (15/48) | 0.16 | 0.03 | $0.0038 | 12.8s / 20.2s |

95% bootstrap intervals (resampling incidents): top-1 [100–100], lenient [100–100], evidence precision [81–90], recall [84–92], cost / incident [$0.0034–$0.0042]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.18. Mean 6.3 turns, 8.3 tool calls, 73,512 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 9 of them (mean 1.25 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 80% | 93% |
| medium | 16 | 100% | 100% | 100% | 90% | 93% |
| hard | 16 | 100% | 100% | 100% | 87% | 78% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 91% | 88% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 90% | 92% |
| bad_deploy | 6 | 100% | 100% | 100% | 92% | 88% |
| config_error | 6 | 100% | 100% | 100% | 94% | 97% |
| poison_message | 6 | 100% | 100% | 100% | 89% | 92% |
| data_integrity | 6 | 100% | 100% | 100% | 76% | 81% |
| cascading_failure | 6 | 100% | 100% | 100% | 70% | 87% |
| external_outage | 6 | 100% | 100% | 100% | 85% | 80% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 6 | 0.70 | 100% |
| 0.8–1.0 | 42 | 0.86 | 100% |

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
