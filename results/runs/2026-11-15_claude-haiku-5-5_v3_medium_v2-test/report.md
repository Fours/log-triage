# Eval run `2026-11-15_claude-haiku-5-5_v3_medium_v2-test`

Model **claude-haiku-5-5** · prompt **v3** · tools v2 · effort **medium** · 48 incidents from `incidents/v2/test` · generator v2 seed `log-triage-v2-test` · commit `9e5db7a` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **96%** | 96% | 96% | 84% / 89% | 0.88 (13/48) | 0.16 | 0.03 | $0.0056 | 16.3s / 32.0s |

95% bootstrap intervals (resampling incidents): top-1 [90–100], lenient [90–100], evidence precision [80–88], recall [84–93], cost / incident [$0.0049–$0.0063]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.27. Mean 8.0 turns, 11.8 tool calls, 126,981 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 9 of them (mean 1.19 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 94% | 94% | 94% | 82% | 97% |
| medium | 16 | 100% | 100% | 100% | 84% | 86% |
| hard | 16 | 94% | 94% | 94% | 86% | 83% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 95% | 73% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 83% | 94% |
| bad_deploy | 6 | 100% | 100% | 100% | 97% | 97% |
| config_error | 6 | 100% | 100% | 100% | 91% | 93% |
| poison_message | 6 | 83% | 83% | 83% | 86% | 95% |
| data_integrity | 6 | 100% | 100% | 100% | 68% | 92% |
| cascading_failure | 6 | 83% | 83% | 83% | 70% | 80% |
| external_outage | 6 | 100% | 100% | 100% | 83% | 85% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 1 | 0.00 | 0% |
| 0.2–0.4 | 1 | 0.20 | 0% |
| 0.4–0.6 | 1 | 0.50 | 100% |
| 0.6–0.8 | 5 | 0.70 | 100% |
| 0.8–1.0 | 40 | 0.87 | 100% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **0**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 6 | · | · | · | · | · | · | · | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 6 | · | · | · | · | · | · |
| config_error (CE) | · | · | · | 6 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 5 | 1 | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | · | · | · | 1 | · | · | 5 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (2)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| ht-012 | hard | poison_message/consumer-crash-loop | data_integrity (0.00) | no | submitted |
| ht-048 | easy | cascading_failure/retry-storm | config_error (0.20) | no | submitted |
