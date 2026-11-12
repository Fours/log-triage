# Eval run `2026-11-12_claude-opus-5-5`

Model **claude-opus-5-5** · prompt **v1** · 48 incidents from `incidents/generated` · generator v1 seed `log-triage-v1` · commit `8d500a0` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **96%** | 96% | 100% | 64% / 94% | 0.29 (12/48) | 0.16 | 0.06 | $0.05 | 13.0s / 17.0s |

95% bootstrap intervals (resampling incidents): top-1 [90–100], lenient [90–100], evidence precision [61–67], recall [90–97], cost / incident [$0.05–$0.05]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $2.36. Mean 4.0 turns, 4.0 tool calls, 17,303 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 56% | 98% |
| medium | 16 | 94% | 94% | 100% | 68% | 94% |
| hard | 16 | 94% | 94% | 100% | 69% | 90% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 67% | 67% | 100% | 65% | 89% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 74% | 100% |
| bad_deploy | 6 | 100% | 100% | 100% | 69% | 100% |
| config_error | 6 | 100% | 100% | 100% | 61% | 100% |
| poison_message | 6 | 100% | 100% | 100% | 64% | 97% |
| data_integrity | 6 | 100% | 100% | 100% | 58% | 77% |
| cascading_failure | 6 | 100% | 100% | 100% | 63% | 88% |
| external_outage | 6 | 100% | 100% | 100% | 59% | 100% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 2 | 0.53 | 50% |
| 0.6–0.8 | 10 | 0.64 | 90% |
| 0.8–1.0 | 36 | 0.87 | 100% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **0**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 4 | 2 | · | · | · | · | · | · | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 6 | · | · | · | · | · | · |
| config_error (CE) | · | · | · | 6 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | · | · | · | · | · | · | 6 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (2)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| gen-001 | medium | dependency_timeout/db-lock-wait | resource_exhaustion (0.60) | no | submitted |
| gen-003 | hard | dependency_timeout/db-lock-wait | resource_exhaustion (0.50) | no | submitted |
