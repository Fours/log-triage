# Eval run `2026-11-15_claude-haiku-5-5_v3_low_v2-test_rep2`

Model **claude-haiku-5-5** · prompt **v3** · tools v2 · effort **low** · 48 incidents from `incidents/v2/test` · generator v2 seed `log-triage-v2-test` · commit `9e5db7a` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **92%** | 94% | 94% | 83% / 85% | 0.77 (13/48) | 0.09 | 0.07 | $0.0041 | 13.7s / 27.7s |

95% bootstrap intervals (resampling incidents): top-1 [83–98], lenient [85–100], evidence precision [78–88], recall [79–91], cost / incident [$0.0036–$0.0047]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.20. Mean 6.9 turns, 8.5 tool calls, 83,159 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 11 of them (mean 1.22 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 76% | 92% |
| medium | 16 | 94% | 94% | 94% | 86% | 90% |
| hard | 16 | 81% | 88% | 88% | 88% | 74% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 83% | 100% | 83% | 98% | 71% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 85% | 90% |
| bad_deploy | 6 | 83% | 83% | 83% | 91% | 79% |
| config_error | 6 | 83% | 83% | 83% | 88% | 100% |
| poison_message | 6 | 83% | 83% | 100% | 87% | 96% |
| data_integrity | 6 | 100% | 100% | 100% | 66% | 88% |
| cascading_failure | 6 | 100% | 100% | 100% | 67% | 75% |
| external_outage | 6 | 100% | 100% | 100% | 81% | 85% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 1 | 0.15 | 0% |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 6 | 0.71 | 100% |
| 0.8–1.0 | 41 | 0.86 | 93% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **3**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 5 | · | · | · | · | · | · | 1 | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 5 | · | · | · | 1 | · | · |
| config_error (CE) | 1 | · | · | 5 | · | · | · | · | · |
| poison_message (PM) | · | · | 1 | · | 5 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | · | · | · | · | · | · | 6 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (4)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| ht-002 | hard | dependency_timeout/external-hang | external_outage (0.15) | yes | submitted |
| ht-012 | hard | poison_message/consumer-crash-loop | bad_deploy (0.80) | no | submitted |
| ht-030 | medium | config_error/wrong-endpoint | dependency_timeout (0.85) | no | submitted |
| ht-031 | hard | bad_deploy/dependency-contract-change | cascading_failure (0.88) | no | submitted |
