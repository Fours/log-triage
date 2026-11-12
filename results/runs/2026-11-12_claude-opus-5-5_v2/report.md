# Eval run `2026-11-12_claude-opus-5-5_v2`

Model **claude-opus-5-5** · prompt **v2** · 48 incidents from `incidents/generated` · generator v1 seed `log-triage-v1` · commit `ec9a5e3` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **92%** | 98% | 100% | 89% / 91% | 0.27 (12/48) | 0.04 | 0.07 | $0.05 | 12.7s / 16.1s |

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $2.54. Mean 4.0 turns, 4.1 tool calls, 19,100 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 88% | 100% | 100% | 88% | 94% |
| medium | 16 | 94% | 94% | 100% | 90% | 90% |
| hard | 16 | 94% | 100% | 100% | 89% | 88% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 67% | 83% | 100% | 100% | 88% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 100% | 100% |
| bad_deploy | 6 | 100% | 100% | 100% | 100% | 100% |
| config_error | 6 | 100% | 100% | 100% | 92% | 97% |
| poison_message | 6 | 100% | 100% | 100% | 100% | 83% |
| data_integrity | 6 | 83% | 100% | 100% | 67% | 80% |
| cascading_failure | 6 | 83% | 100% | 100% | 69% | 88% |
| external_outage | 6 | 100% | 100% | 100% | 85% | 92% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 4 | 0.71 | 75% |
| 0.8–1.0 | 44 | 0.90 | 93% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **3**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 4 | 1 | · | · | · | · | · | 1 | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 6 | · | · | · | · | · | · |
| config_error (CE) | · | · | · | 6 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | 1 | · | · | 5 | · | · | · |
| cascading_failure (CF) | · | 1 | · | · | · | · | 5 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (4)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| gen-001 | medium | dependency_timeout/db-lock-wait | resource_exhaustion (0.88) | no | submitted |
| gen-010 | easy | data_integrity/partial-migration | bad_deploy (0.65) | yes | submitted |
| gen-013 | hard | cascading_failure/cache-stampede | resource_exhaustion (0.80) | yes | submitted |
| gen-025 | easy | dependency_timeout/external-hang | external_outage (0.80) | yes | submitted |
