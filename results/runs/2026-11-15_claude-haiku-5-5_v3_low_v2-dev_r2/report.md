# Eval run `2026-11-15_claude-haiku-5-5_v3_low_v2-dev_r2`

Model **claude-haiku-5-5** · prompt **v3** · tools v2 · effort **low** · 48 incidents from `incidents/v2/dev` · generator v2 seed `log-triage-v2` · commit `6a25997` (dirty)

## Headline

| top-1 | top-1 (lenient) | top-3 | evidence P / R | herring cites | ECE | Brier | cost / incident | p50 / p95 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **94%** | 94% | 96% | 83% / 84% | 0.77 (14/48) | 0.10 | 0.06 | $0.0039 | 13.7s / 20.6s |

95% bootstrap intervals (resampling incidents): top-1 [85–100], lenient [85–100], evidence precision [77–89], recall [78–89], cost / incident [$0.0036–$0.0044]. To compare two runs on the same incidents, use `npm run compare`, which is much tighter.

Outcomes: 48 submitted, 0 budget exhausted, 0 no verdict, 0 refused, 0 API error. Total cost $0.19. Mean 6.4 turns, 8.0 tool calls, 75,453 tokens per incident.

*top-1 (lenient)* also accepts a labeled defensible alternative on ambiguous incidents. Evidence precision/recall compare the top hypothesis's cited lines with the labeled evidence. *Herring cites* is mean red-herring lines cited (incidents citing any). ECE/Brier measure how well top-1 confidence tracks correctness (lower is better). An incident without a verdict counts as wrong.

Concurrent incidents: 32 incidents also had a second, unrelated fault on another product's services. The agent cited its lines in 8 of them (mean 1.16 lines). Those lines aren't evidence, so citing them costs precision.

## By difficulty

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| easy | 16 | 94% | 94% | 94% | 85% | 95% |
| medium | 16 | 100% | 100% | 100% | 82% | 80% |
| hard | 16 | 88% | 88% | 94% | 84% | 76% |

## By root cause

| | n | top-1 | top-1 (lenient) | top-3 | evidence precision | evidence recall |
|---|---:|---:|---:|---:|---:|---:|
| dependency_timeout | 6 | 100% | 100% | 100% | 94% | 89% |
| resource_exhaustion | 6 | 83% | 83% | 83% | 89% | 89% |
| bad_deploy | 6 | 83% | 83% | 100% | 70% | 81% |
| config_error | 6 | 100% | 100% | 100% | 97% | 87% |
| poison_message | 6 | 100% | 100% | 100% | 87% | 92% |
| data_integrity | 6 | 100% | 100% | 100% | 83% | 79% |
| cascading_failure | 6 | 83% | 83% | 83% | 64% | 69% |
| external_outage | 6 | 100% | 100% | 100% | 84% | 86% |

## Calibration (top-1 confidence)

| confidence | n | mean confidence | accuracy |
|---|---:|---:|---:|
| 0.0–0.2 | 0 | — | — |
| 0.2–0.4 | 0 | — | — |
| 0.4–0.6 | 0 | — | — |
| 0.6–0.8 | 6 | 0.69 | 83% |
| 0.8–1.0 | 42 | 0.86 | 95% |

Confidently wrong (top-1 wrong at confidence ≥ 0.8): **2**.

## Confusion matrix

Rows are the labeled root cause; columns are the agent's top-1. `none` = no verdict.

| truth \ predicted | DT | RE | BD | CE | PM | DI | CF | EO | N |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dependency_timeout (DT) | 6 | · | · | · | · | · | · | · | · |
| resource_exhaustion (RE) | · | 5 | · | · | · | · | 1 | · | · |
| bad_deploy (BD) | · | · | 5 | · | · | 1 | · | · | · |
| config_error (CE) | · | · | · | 6 | · | · | · | · | · |
| poison_message (PM) | · | · | · | · | 6 | · | · | · | · |
| data_integrity (DI) | · | · | · | · | · | 6 | · | · | · |
| cascading_failure (CF) | 1 | · | · | · | · | · | 5 | · | · |
| external_outage (EO) | · | · | · | · | · | · | · | 6 | · |

## Misses (3)

| incident | difficulty | scenario | predicted (confidence) | acceptable? | outcome |
|---|---|---|---|---|---|
| h-022 | hard | cascading_failure/cache-stampede | dependency_timeout (0.60) | no | submitted |
| h-044 | easy | resource_exhaustion/memory-leak-oom | cascading_failure (0.80) | no | submitted |
| h-045 | hard | bad_deploy/dependency-contract-change | data_integrity (0.90) | no | submitted |
