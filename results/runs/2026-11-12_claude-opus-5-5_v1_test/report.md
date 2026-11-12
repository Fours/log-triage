# Eval run `2026-11-12_claude-opus-5-5_v1_test`

Model **claude-opus-5-5** · prompt **v1** · 48 incidents from `incidents/test` · generator v1 seed `log-triage-test-v1` · commit `ec9a5e3` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **94%** | 98% | 100% | 63% / 95% | 0.27 (9/48) | 0.17 | 0.06 | $0.05 | 12.0s / 15.9s |

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $2.32. Mean 3.9 turns, 4.0 tool calls, 16,738 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 94% | 94% | 100% | 52% | 98% |
| medium | 16 | 100% | 100% | 100% | 67% | 94% |
| hard | 16 | 88% | 100% | 100% | 71% | 92% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 67% | 83% | 100% | 64% | 89% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 74% | 100% |
| bad_deploy | 6 | 100% | 100% | 100% | 69% | 100% |
| config_error | 6 | 100% | 100% | 100% | 56% | 100% |
| poison_message | 6 | 100% | 100% | 100% | 64% | 95% |
| data_integrity | 6 | 100% | 100% | 100% | 59% | 83% |
| cascading_failure | 6 | 83% | 100% | 100% | 60% | 90% |
| external_outage | 6 | 100% | 100% | 100% | 60% | 100% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 2 | 0.55 | 0% |
| 0.6–0.8 | 10 | 0.65 | 90% |
| 0.8–1.0 | 36 | 0.87 | 100% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **0**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 4 | 1 | · | · | · | · | · | 1 | · |
| resource_exhaustion (RE) | · | 6 | · | · | · | · | · | · | · |
| bad_deploy (BD) | · | · | 6 | · | · | · | · | · | · |
| config_error (CE) | · | · | · | 6 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | · | 1 | · | · | · | · | 5 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (3)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| test-008 | easy | dependency_timeout/db-lock-wait | resource_exhaustion (0.55) | no | submitted |
| test-024 | hard | dependency_timeout/external-hang | external_outage (0.60) | yes | submitted |
| test-028 | hard | cascading_failure/cache-stampede | resource_exhaustion (0.55) | yes | submitted |
