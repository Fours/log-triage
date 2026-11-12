# Eval run `2026-11-12_baseline-keywords`

Model **baseline:keywords** · 48 incidents · generator v1 seed `log-triage-v1` · commit `8d500a0` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **50%** | 56% | 85% | 43% / 43% | 0.33 (16/48) | 0.28 | 0.33 | — | 0.0s / 0.0s |

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost —. Mean 0.0 turns, 0.0 tool calls, 0 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 56% | 63% | 88% | 46% | 50% |
| medium | 16 | 50% | 56% | 88% | 45% | 44% |
| hard | 16 | 44% | 50% | 81% | 38% | 34% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 50% | 100% | 100% | 63% | 62% |
| resource_exhaustion | 6 | 67% | 67% | 100% | 67% | 63% |
| bad_deploy | 6 | 0% | 0% | 0% | 0% | 0% |
| config_error | 6 | 0% | 0% | 100% | 13% | 20% |
| poison_message | 6 | 100% | 100% | 100% | 100% | 72% |
| data_integrity | 6 | 33% | 33% | 100% | 22% | 23% |
| cascading_failure | 6 | 50% | 50% | 83% | 35% | 33% |
| external_outage | 6 | 100% | 100% | 100% | 48% | 68% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 11 | 0.53 | 36% |
| 0.6–0.8 | 11 | 0.67 | 45% |
| 0.8–1.0 | 26 | 0.93 | 58% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **11**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 3 | · | · | · | · | · | · | 3 | · |
| resource_exhaustion (RE) | · | 4 | · | · | · | · | · | 2 | · |
| bad_deploy (BD) | · | · | · | · | · | · | · | 6 | · |
| config_error (CE) | · | · | · | · | · | · | · | 6 | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 2 | · | 4 | · |
| cascading_failure (CF) | 3 | · | · | · | · | · | 3 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (24)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| gen-002 | hard | data_integrity/sequence-collision | external_outage (0.71) | no | submitted |
| gen-004 | easy | cascading_failure/cache-stampede | dependency_timeout (0.86) | no | submitted |
| gen-013 | hard | cascading_failure/cache-stampede | dependency_timeout (0.94) | no | submitted |
| gen-014 | hard | data_integrity/partial-migration | external_outage (0.50) | no | submitted |
| gen-015 | easy | data_integrity/sequence-collision | external_outage (0.57) | no | submitted |
| gen-016 | easy | config_error/rotated-credential | external_outage (0.67) | no | submitted |
| gen-017 | medium | cascading_failure/cache-stampede | dependency_timeout (0.83) | no | submitted |
| gen-018 | easy | bad_deploy/dependency-contract-change | external_outage (1.00) | no | submitted |
| gen-022 | medium | config_error/wrong-endpoint | external_outage (0.67) | no | submitted |
| gen-023 | hard | config_error/wrong-endpoint | external_outage (0.75) | no | submitted |
| gen-025 | easy | dependency_timeout/external-hang | external_outage (0.50) | yes | submitted |
| gen-026 | medium | bad_deploy/dependency-contract-change | external_outage (1.00) | no | submitted |
| gen-028 | hard | resource_exhaustion/db-disk-full | external_outage (0.67) | no | submitted |
| gen-029 | hard | config_error/rotated-credential | external_outage (0.85) | no | submitted |
| gen-030 | hard | bad_deploy/new-version-exception | external_outage (1.00) | no | submitted |
| gen-031 | medium | bad_deploy/new-version-exception | external_outage (0.88) | no | submitted |
| gen-033 | easy | config_error/wrong-endpoint | external_outage (0.57) | no | submitted |
| gen-034 | hard | dependency_timeout/external-hang | external_outage (0.44) | yes | submitted |
| gen-035 | medium | config_error/rotated-credential | external_outage (0.80) | no | submitted |
| gen-036 | easy | bad_deploy/new-version-exception | external_outage (1.00) | no | submitted |
| gen-041 | medium | data_integrity/sequence-collision | external_outage (0.64) | no | submitted |
| gen-043 | hard | bad_deploy/dependency-contract-change | external_outage (1.00) | no | submitted |
| gen-044 | medium | resource_exhaustion/db-disk-full | external_outage (0.58) | no | submitted |
| gen-045 | medium | dependency_timeout/external-hang | external_outage (0.52) | yes | submitted |
