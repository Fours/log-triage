# Eval run `2026-11-12_claude-sonnet-5-5_v3_medium_test`

Model **claude-sonnet-5-5** · prompt **v3** · effort **medium** · 48 incidents from `incidents/test` · generator v1 seed `log-triage-test-v1` · commit `b4ba01b` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **98%** | 100% | 100% | 92% / 74% | 0.13 (5/48) | 0.10 | 0.02 | $0.02 | 5.2s / 7.4s |

95% bootstrap intervals (resampling incidents): top-1 [94–100], lenient [100–100], evidence precision [88–96], recall [68–80], cost / incident [$0.02–$0.02]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.87. Mean 2.5 turns, 1.7 tool calls, 10,974 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 100% | 100% | 100% | 94% | 85% |
| medium | 16 | 100% | 100% | 100% | 92% | 71% |
| hard | 16 | 94% | 100% | 100% | 92% | 65% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 100% | 63% |
| resource_exhaustion | 6 | 100% | 100% | 100% | 100% | 84% |
| bad_deploy | 6 | 100% | 100% | 100% | 100% | 88% |
| config_error | 6 | 83% | 100% | 100% | 100% | 84% |
| poison_message | 6 | 100% | 100% | 100% | 100% | 74% |
| data_integrity | 6 | 100% | 100% | 100% | 69% | 59% |
| cascading_failure | 6 | 100% | 100% | 100% | 74% | 60% |
| external_outage | 6 | 100% | 100% | 100% | 97% | 78% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 1 | 0.75 | 0% |
| 0.8–1.0 | 47 | 0.92 | 100% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **0**.

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
| test-019 | hard | config_error/wrong-endpoint | bad_deploy (0.75) | yes | submitted |
