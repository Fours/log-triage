# Eval run `2026-11-15_baseline-keywords_v2-dev_r2`

Model **baseline:keywords** · prompt **—** · 48 incidents from `incidents/v2/dev` · generator v2 seed `log-triage-v2` · commit `6a25997` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **10%** | 17% | 58% | 7% / 9% | 9.85 (48/48) | 0.42 | 0.29 | — | 0.0s / 0.0s |

95% bootstrap intervals (resampling incidents): top-1 [2–19], lenient [6–27], evidence precision [2–11], recall [4–15]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost —. Mean 0.0 turns, 0.0 tool calls, 0 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 15 of them (mean 1.59 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 13% | 19% | 81% | 7% | 10% |
| medium | 16 | 13% | 19% | 69% | 9% | 12% |
| hard | 16 | 6% | 13% | 25% | 3% | 4% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 17% | 33% | 83% | 21% | 23% |
| resource_exhaustion | 6 | 0% | 0% | 67% | 0% | 0% |
| bad_deploy | 6 | 0% | 0% | 0% | 0% | 0% |
| config_error | 6 | 0% | 0% | 83% | 6% | 10% |
| poison_message | 6 | 0% | 0% | 50% | 0% | 0% |
| data_integrity | 6 | 0% | 17% | 33% | 0% | 0% |
| cascading_failure | 6 | 0% | 0% | 50% | 2% | 3% |
| external_outage | 6 | 67% | 83% | 100% | 23% | 35% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 13 | 0.34 | 0% |
| 0.4–0.6 | 20 | 0.50 | 20% |
| 0.6–0.8 | 10 | 0.65 | 10% |
| 0.8–1.0 | 5 | 0.86 | 0% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **5**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 1 | 3 | · | · | · | · | 1 | 1 | · |
| resource_exhaustion (RE) | 1 | · | · | · | · | 3 | 2 | · | · |
| bad_deploy (BD) | · | · | · | 1 | · | 4 | · | 1 | · |
| config_error (CE) | 1 | · | · | · | · | · | · | 5 | · |
| poison_message (PM) | 1 | 1 | 3 | · | · | 1 | · | · | · |
| data_integrity (DI) | · | · | 2 | 1 | · | · | · | 3 | · |
| cascading_failure (CF) | 3 | 3 | · | · | · | · | · | · | · |
| external_outage (EO) | 1 | · | · | · | · | · | 1 | 4 | · |

## Misses (43)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| h-001 | easy | bad_deploy/dependency-contract-change | data_integrity (0.67) | no | submitted |
| h-002 | easy | poison_message/redelivery-loop | data_integrity (0.53) | no | submitted |
| h-003 | medium | dependency_timeout/external-hang | external_outage (0.37) | yes | submitted |
| h-004 | medium | dependency_timeout/db-lock-wait | resource_exhaustion (0.43) | no | submitted |
| h-006 | easy | config_error/rotated-credential | external_outage (0.83) | no | submitted |
| h-007 | medium | resource_exhaustion/memory-leak-oom | cascading_failure (0.52) | no | submitted |
| h-008 | hard | dependency_timeout/external-hang | resource_exhaustion (0.29) | no | submitted |
| h-010 | hard | dependency_timeout/db-lock-wait | resource_exhaustion (0.28) | no | submitted |
| h-011 | easy | config_error/wrong-endpoint | dependency_timeout (0.60) | no | submitted |
| h-012 | medium | resource_exhaustion/db-disk-full | data_integrity (0.47) | no | submitted |
| h-013 | hard | poison_message/consumer-crash-loop | bad_deploy (0.36) | no | submitted |
| h-014 | hard | external_outage/provider-5xx | dependency_timeout (0.36) | yes | submitted |
| h-015 | medium | config_error/wrong-endpoint | external_outage (0.80) | no | submitted |
| h-016 | easy | data_integrity/partial-migration | bad_deploy (0.45) | yes | submitted |
| h-017 | hard | cascading_failure/retry-storm | resource_exhaustion (0.29) | no | submitted |
| h-018 | medium | bad_deploy/dependency-contract-change | external_outage (0.65) | no | submitted |
| h-019 | hard | resource_exhaustion/memory-leak-oom | dependency_timeout (0.34) | no | submitted |
| h-020 | easy | external_outage/provider-5xx | cascading_failure (0.50) | no | submitted |
| h-021 | easy | cascading_failure/retry-storm | resource_exhaustion (0.50) | no | submitted |
| h-022 | hard | cascading_failure/cache-stampede | dependency_timeout (0.63) | no | submitted |
| h-023 | easy | poison_message/consumer-crash-loop | bad_deploy (0.88) | no | submitted |
| h-024 | medium | data_integrity/partial-migration | external_outage (0.56) | no | submitted |
| h-025 | hard | config_error/wrong-endpoint | external_outage (0.31) | no | submitted |
| h-026 | hard | bad_deploy/new-version-exception | config_error (0.38) | no | submitted |
| h-027 | easy | dependency_timeout/external-hang | cascading_failure (0.42) | no | submitted |
| h-028 | medium | poison_message/consumer-crash-loop | bad_deploy (0.46) | no | submitted |
| h-029 | medium | bad_deploy/new-version-exception | data_integrity (0.41) | no | submitted |
| h-030 | medium | config_error/rotated-credential | external_outage (0.91) | no | submitted |
| h-031 | hard | data_integrity/partial-migration | external_outage (0.39) | no | submitted |
| h-032 | easy | bad_deploy/new-version-exception | data_integrity (0.64) | no | submitted |
| h-033 | medium | cascading_failure/cache-stampede | resource_exhaustion (0.37) | no | submitted |
| h-035 | medium | poison_message/redelivery-loop | dependency_timeout (0.70) | no | submitted |
| h-036 | easy | data_integrity/sequence-collision | bad_deploy (0.67) | no | submitted |
| h-037 | easy | cascading_failure/cache-stampede | dependency_timeout (0.90) | no | submitted |
| h-039 | medium | data_integrity/sequence-collision | external_outage (0.49) | no | submitted |
| h-040 | medium | cascading_failure/retry-storm | dependency_timeout (0.59) | no | submitted |
| h-041 | hard | resource_exhaustion/db-disk-full | data_integrity (0.35) | no | submitted |
| h-042 | easy | resource_exhaustion/db-disk-full | data_integrity (0.53) | no | submitted |
| h-043 | hard | data_integrity/sequence-collision | config_error (0.35) | no | submitted |
| h-044 | easy | resource_exhaustion/memory-leak-oom | cascading_failure (0.63) | no | submitted |
| h-045 | hard | bad_deploy/dependency-contract-change | data_integrity (0.44) | no | submitted |
| h-046 | hard | config_error/rotated-credential | external_outage (0.69) | no | submitted |
| h-047 | hard | poison_message/redelivery-loop | resource_exhaustion (0.46) | no | submitted |
