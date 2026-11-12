# Eval run `2026-11-12_claude-opus-5-5_v4_low`

Model **claude-opus-5-5** · prompt **v4** · effort **low** · 48 incidents from `incidents/generated` · generator v1 seed `log-triage-v1` · commit `ec9a5e3` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **98%** | 100% | 100% | 90% / 81% | 0.29 (14/48) | 0.08 | 0.02 | $0.04 | 7.4s / 12.1s |

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $1.76. Mean 2.6 turns, 1.7 tool calls, 11,415 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 89% | 88% |
| medium | 16 | 100% | 100% | 100% | 90% | 80% |
| hard | 16 | 94% | 100% | 100% | 91% | 76% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 100% | 77% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 100% | 91% |
| bad_deploy | 6 | 100% | 100% | 100% | 100% | 94% |
| config_error | 6 | 83% | 100% | 100% | 97% | 97% |
| poison_message | 6 | 100% | 100% | 100% | 97% | 62% |
| data_integrity | 6 | 100% | 100% | 100% | 66% | 72% |
| cascading_failure | 6 | 100% | 100% | 100% | 75% | 71% |
| external_outage | 6 | 100% | 100% | 100% | 88% | 86% |

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
| gen-023 | hard | config_error/wrong-endpoint | bad_deploy (0.85) | yes | submitted |
