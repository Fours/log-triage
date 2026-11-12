# Eval run `2026-11-12_baseline-keywords_test`

Model **baseline:keywords** · prompt **—** · 48 incidents from `incidents/test` · generator v1 seed `log-triage-test-v1` · commit `ec9a5e3` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **54%** | 56% | 85% | 47% / 47% | 0.27 (12/48) | 0.24 | 0.32 | — | 0.0s / 0.0s |

95% bootstrap intervals (resampling incidents): top-1 [40–69], lenient [42–71], evidence precision [35–59], recall [35–58]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost —. Mean 0.0 turns, 0.0 tool calls, 0 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 63% | 63% | 88% | 51% | 56% |
| medium | 16 | 56% | 56% | 88% | 51% | 50% |
| hard | 16 | 44% | 50% | 81% | 41% | 35% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 83% | 100% | 100% | 87% | 85% |
| resource_exhaustion | 6 | 67% | 67% | 100% | 67% | 63% |
| bad_deploy | 6 | 0% | 0% | 0% | 0% | 0% |
| config_error | 6 | 0% | 0% | 100% | 15% | 26% |
| poison_message | 6 | 100% | 100% | 100% | 100% | 72% |
| data_integrity | 6 | 33% | 33% | 100% | 22% | 23% |
| cascading_failure | 6 | 50% | 50% | 83% | 38% | 35% |
| external_outage | 6 | 100% | 100% | 100% | 52% | 73% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 13 | 0.55 | 54% |
| 0.6–0.8 | 9 | 0.68 | 44% |
| 0.8–1.0 | 26 | 0.93 | 58% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **11**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 5 | · | · | · | · | · | · | 1 | · |
| resource_exhaustion (RE) | · | 4 | · | · | · | · | · | 2 | · |
| bad_deploy (BD) | · | · | · | · | · | · | · | 6 | · |
| config_error (CE) | · | · | · | · | · | · | · | 6 | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 2 | · | 4 | · |
| cascading_failure (CF) | 3 | · | · | · | · | · | 3 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (22)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| test-003 | easy | data_integrity/sequence-collision | external_outage (0.57) | no | submitted |
| test-004 | medium | data_integrity/sequence-collision | external_outage (0.64) | no | submitted |
| test-005 | hard | data_integrity/partial-migration | external_outage (0.50) | no | submitted |
| test-007 | hard | bad_deploy/dependency-contract-change | external_outage (1.00) | no | submitted |
| test-009 | easy | bad_deploy/dependency-contract-change | external_outage (1.00) | no | submitted |
| test-015 | medium | config_error/rotated-credential | external_outage (0.80) | no | submitted |
| test-017 | medium | bad_deploy/new-version-exception | external_outage (1.00) | no | submitted |
| test-019 | hard | config_error/wrong-endpoint | external_outage (0.76) | no | submitted |
| test-020 | medium | config_error/wrong-endpoint | external_outage (0.64) | no | submitted |
| test-021 | easy | cascading_failure/cache-stampede | dependency_timeout (0.86) | no | submitted |
| test-023 | easy | bad_deploy/new-version-exception | external_outage (0.80) | no | submitted |
| test-024 | hard | dependency_timeout/external-hang | external_outage (0.55) | yes | submitted |
| test-026 | easy | config_error/wrong-endpoint | external_outage (0.57) | no | submitted |
| test-028 | hard | cascading_failure/cache-stampede | dependency_timeout (0.89) | no | submitted |
| test-030 | medium | resource_exhaustion/db-disk-full | external_outage (0.58) | no | submitted |
| test-032 | easy | config_error/rotated-credential | external_outage (0.75) | no | submitted |
| test-033 | hard | data_integrity/sequence-collision | external_outage (0.71) | no | submitted |
| test-035 | hard | resource_exhaustion/db-disk-full | external_outage (0.57) | no | submitted |
| test-041 | hard | bad_deploy/new-version-exception | external_outage (1.00) | no | submitted |
| test-044 | medium | cascading_failure/cache-stampede | dependency_timeout (0.83) | no | submitted |
| test-045 | medium | bad_deploy/dependency-contract-change | external_outage (0.88) | no | submitted |
| test-046 | hard | config_error/rotated-credential | external_outage (0.82) | no | submitted |
