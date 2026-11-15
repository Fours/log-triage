# Eval run `2026-11-15_baseline-keywords_v2-test`

Model **baseline:keywords** · prompt **—** · 48 incidents from `incidents/v2/test` · generator v2 seed `log-triage-v2-test` · commit `f8d85d6`

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **15%** | 19% | 60% | 8% / 9% | 10.00 (48/48) | 0.37 | 0.30 | — | 0.0s / 0.0s |

95% bootstrap intervals (resampling incidents): top-1 [4–25], lenient [8–31], evidence precision [3–13], recall [4–15]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost —. Mean 0.0 turns, 0.0 tool calls, 0 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 20 of them (mean 2.25 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 13% | 19% | 88% | 7% | 9% |
| medium | 16 | 19% | 25% | 69% | 11% | 13% |
| hard | 16 | 13% | 13% | 25% | 5% | 6% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 33% | 50% | 83% | 25% | 25% |
| resource_exhaustion | 6 | 0% | 0% | 67% | 0% | 0% |
| bad_deploy | 6 | 0% | 0% | 0% | 0% | 0% |
| config_error | 6 | 0% | 0% | 83% | 6% | 11% |
| poison_message | 6 | 0% | 0% | 50% | 0% | 0% |
| data_integrity | 6 | 0% | 17% | 50% | 0% | 0% |
| cascading_failure | 6 | 0% | 0% | 50% | 2% | 4% |
| external_outage | 6 | 83% | 83% | 100% | 27% | 35% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 11 | 0.34 | 9% |
| 0.4–0.6 | 27 | 0.49 | 22% |
| 0.6–0.8 | 5 | 0.67 | 0% |
| 0.8–1.0 | 5 | 0.88 | 0% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **5**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 2 | 3 | · | · | · | · | · | 1 | · |
| resource_exhaustion (RE) | 1 | · | · | · | · | 2 | 1 | 2 | · |
| bad_deploy (BD) | 1 | · | · | 1 | · | 2 | · | 2 | · |
| config_error (CE) | · | · | · | · | · | · | · | 6 | · |
| poison_message (PM) | 1 | 2 | 2 | · | · | 1 | · | · | · |
| data_integrity (DI) | 2 | · | 1 | 1 | · | · | · | 2 | · |
| cascading_failure (CF) | 3 | 1 | · | · | · | · | · | 2 | · |
| external_outage (EO) | 1 | · | · | · | · | · | · | 5 | · |

## Misses (41)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| ht-001 | easy | external_outage/cloud-object-storage | dependency_timeout (0.50) | no | submitted |
| ht-002 | hard | dependency_timeout/external-hang | resource_exhaustion (0.41) | no | submitted |
| ht-003 | medium | bad_deploy/dependency-contract-change | external_outage (0.54) | no | submitted |
| ht-004 | hard | cascading_failure/cache-stampede | dependency_timeout (0.50) | no | submitted |
| ht-005 | hard | resource_exhaustion/memory-leak-oom | dependency_timeout (0.32) | no | submitted |
| ht-006 | medium | cascading_failure/cache-stampede | resource_exhaustion (0.52) | no | submitted |
| ht-007 | medium | config_error/rotated-credential | external_outage (0.90) | no | submitted |
| ht-009 | easy | bad_deploy/new-version-exception | data_integrity (0.71) | no | submitted |
| ht-010 | medium | poison_message/redelivery-loop | resource_exhaustion (0.39) | no | submitted |
| ht-011 | hard | data_integrity/sequence-collision | dependency_timeout (0.38) | no | submitted |
| ht-012 | hard | poison_message/consumer-crash-loop | resource_exhaustion (0.40) | no | submitted |
| ht-013 | easy | poison_message/redelivery-loop | data_integrity (0.59) | no | submitted |
| ht-014 | hard | config_error/wrong-endpoint | external_outage (0.63) | no | submitted |
| ht-015 | easy | config_error/rotated-credential | external_outage (0.84) | no | submitted |
| ht-016 | medium | data_integrity/sequence-collision | external_outage (0.52) | no | submitted |
| ht-017 | easy | data_integrity/sequence-collision | dependency_timeout (0.54) | no | submitted |
| ht-018 | easy | poison_message/consumer-crash-loop | bad_deploy (0.87) | no | submitted |
| ht-019 | easy | cascading_failure/cache-stampede | dependency_timeout (0.89) | no | submitted |
| ht-020 | medium | resource_exhaustion/db-disk-full | data_integrity (0.43) | no | submitted |
| ht-021 | easy | resource_exhaustion/memory-leak-oom | cascading_failure (0.63) | no | submitted |
| ht-023 | medium | data_integrity/partial-migration | external_outage (0.41) | no | submitted |
| ht-024 | easy | data_integrity/partial-migration | bad_deploy (0.42) | yes | submitted |
| ht-025 | easy | resource_exhaustion/db-disk-full | data_integrity (0.47) | no | submitted |
| ht-026 | medium | bad_deploy/new-version-exception | external_outage (0.51) | no | submitted |
| ht-027 | hard | cascading_failure/retry-storm | external_outage (0.35) | no | submitted |
| ht-028 | hard | data_integrity/partial-migration | config_error (0.33) | no | submitted |
| ht-029 | medium | resource_exhaustion/memory-leak-oom | external_outage (0.38) | no | submitted |
| ht-030 | medium | config_error/wrong-endpoint | external_outage (0.59) | no | submitted |
| ht-031 | hard | bad_deploy/dependency-contract-change | data_integrity (0.30) | no | submitted |
| ht-032 | medium | cascading_failure/retry-storm | external_outage (0.50) | no | submitted |
| ht-033 | easy | dependency_timeout/external-hang | resource_exhaustion (0.50) | no | submitted |
| ht-035 | hard | poison_message/redelivery-loop | dependency_timeout (0.40) | no | submitted |
| ht-036 | medium | dependency_timeout/external-hang | external_outage (0.42) | yes | submitted |
| ht-038 | medium | poison_message/consumer-crash-loop | bad_deploy (0.48) | no | submitted |
| ht-039 | hard | bad_deploy/new-version-exception | config_error (0.36) | no | submitted |
| ht-040 | hard | dependency_timeout/db-lock-wait | resource_exhaustion (0.29) | no | submitted |
| ht-041 | hard | resource_exhaustion/db-disk-full | external_outage (0.34) | no | submitted |
| ht-043 | easy | bad_deploy/dependency-contract-change | dependency_timeout (0.69) | no | submitted |
| ht-044 | hard | config_error/rotated-credential | external_outage (0.67) | no | submitted |
| ht-046 | easy | config_error/wrong-endpoint | external_outage (0.89) | no | submitted |
| ht-048 | easy | cascading_failure/retry-storm | dependency_timeout (0.55) | no | submitted |
