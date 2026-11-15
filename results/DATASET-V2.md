# Generator v2 calibration (Phase 7, T6)

Pilots on the v2 dev set (`incidents/v2/dev`, 48 incidents), recorded the same way [`ITERATIONS.md`](ITERATIONS.md) records prompt versions. The target, from [`docs/milestone-7.md`](../docs/milestone-7.md): Opus 5.5 at medium effort, prompt v3, between **65% and 85% top-1**, with fewer than 15% of incidents ending in budget exhaustion. Settings are changed only through the feature table (`src/generator/hardness.ts` and the decoy and concurrent-incident switches), never per incident. Budgets stay at v1's (20 turns, 40 tool calls, 600k tokens, 5 minutes). All runs use tools v2.

## Round 1: the T5 settings

Settings as committed at T5 (6a25997):

| Feature | easy | medium | hard |
| --- | --- | --- | --- |
| Quiet causes | off | half the scenarios | all scenarios |
| Paraphrased evidence | 2 phrasings | 3 | 4 |
| Loud decoys | 1 | 1 | 2 |
| Concurrent incident | off | off | on |
| Volume factor (lines) | 8 (~1,500) | 10 (~2,500) | 7 (~4,350) |

| run | top-1 | lenient | evidence P / R | herrings cited (mean / incidents) | budget exhausted | cost / incident | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| [Haiku low](runs/2026-11-15_claude-haiku-5-5_v3_low_v2-dev/report.md) | 98% | 100% | 87% / 87% | 1.06 / 15 | 0% | $0.0038 | $0.18 |

By difficulty: easy 100%, medium 100%, hard 94% (16 each). The one miss (h-014, hard, `external_outage` read as `dependency_timeout`) is the labeled acceptable alternative.

For reference, Haiku low on the v1 test set: 100% top-1, evidence P/R 90% / 87%, $0.0026 per incident.

**Opus medium was not run.** Haiku low already scores 98% here, and on v1 Opus has never scored below Haiku. A full Opus run (~$5–10) would only confirm that the set is far above the band.

### What the traces show

- **The time window beats the haystack.** 39 of 48 incidents use `search_logs` with `since`/`until` (added at T5 for reachability). The alert gives the onset time, so a few-minute window on the paged service returns a page that holds the quiet cause line along with its symptoms. Volume doesn't matter once the search is scoped by time.
- **Budgets don't bind.** Median 6 tool calls, maximum 19, out of 40. No incident ran out.
- **Decoys cost evidence precision, not diagnosis.** A third of incidents (15/48) cite at least one herring line. But the decoys are chronic: they start before onset, and the agent rules them out on timing ("neither precedes the 503 onset or matches its timing").
- **Once the right window is found, the symptoms identify the category.** Quiet causes and paraphrasing make the cause line harder to *find* with one query. But each scenario's symptom chain is still distinctive (for example "retry … delay 0ms, backoff disabled" for a retry storm), so classifying it is easy.

### Conclusion

The hard tier already has every feature at or near the top of the table and scores 94% (100% lenient) on Haiku low. No setting change inside the feature table plausibly brings Opus medium from about 98% down to 85% or below. The v2 features make the cause harder to *locate*, but the onset time from the alert, together with time-window search, locates it anyway. Calibration is stopped after round 1, pending a design change (see the milestone's T6 notes).

## Round 2: timed decoys, lookalike events, concurrent incident at medium

Round 1 showed that the v2 features made the cause harder to *find* but not harder to *classify*. Round 2 plants bait that lines up with the fault in time (design in the milestone's T6 notes):

- **Timed decoys:** the same error floods, starting just after the fault's first cause line instead of before onset, on a service no failing request passes through. Easy 1 chronic; medium 1 timed; hard 1 chronic + 1 timed.
- **Lookalike events:** one harmless event on the paged path 2–6 minutes before the fault, mimicking a confusable category (a deploy of the app, a config reload, a heap warning that GC clears, one slow call, a circuit breaker that flaps closed, a provider status notice for another region, one redelivered message, an online index migration). It's followed by healthy traffic and labeled `herring`, never the root cause or an acceptable answer. Off at easy, half the scenarios at medium, all at hard.
- **Concurrent incident at medium too** (was hard only).
- **Volume rebalanced** to keep sizes on target now that medium carries a second fault's traffic: easy 8, medium 5.5 (was 10), hard 10.5 (was 7). Means: easy ~1,500, medium ~2,550, hard ~4,500 lines.

Generator checks: keyword baseline 10% top-1 on v2 dev (was 15%); cite-every-ERROR precision 11% (v1 32%). The reachability model now looks back 5 minutes per service before a loud line instead of 1. That's needed because the second fault at medium doubles line density, which pushed one quiet memory-leak line out of `get_context` range of its OOM. It also matches how the pilot agents search.

| run | top-1 | lenient | top-3 | evidence P / R | herrings cited (mean / incidents) | budget exhausted | cost / incident | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [Haiku low](runs/2026-11-15_claude-haiku-5-5_v3_low_v2-dev_r2/report.md) | 94% | 94% | 96% | 83% / 84% | 0.77 / 14 | 0% | $0.0039 | $0.19 |

By difficulty: easy 94%, medium 100%, hard 88%.

How often each trap worked (top hypothesis):

| trap | planted | taken |
|---|---:|---:|
| lookalike event: its category picked | 24 | 2 |
| lookalike event: its lines cited | 24 | 1 |
| timed decoy: its lines cited | 32 | 0 |
| concurrent incident: its lines cited | 32 | 1 |

The three misses: h-022 (hard cache stampede read as `dependency_timeout`, the category of its one-slow-call lookalike, which it cited), h-045 (hard contract-change deploy read as `data_integrity`, its index-migration lookalike's category, though not cited), and h-044 (easy memory leak read as `cascading_failure`, no new feature involved).

**Opus medium, hard tier only.** Rather than the full set, Opus medium was run on just the 16 hard incidents, where every feature is on and Haiku is weakest:

| run | n | top-1 | lenient | evidence P / R | herrings cited (mean / incidents) | budget exhausted | cost / incident | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [Opus medium, hard](runs/2026-11-15_claude-opus-5-5_v3_medium_v2-dev-hard_r2/report.md) | 16 | 94% | 100% | 90% / 87% | 0.63 / 6 | 0% | $0.086 | $1.38 |
| Haiku low, hard (same incidents, from the run above) | 16 | 88% | 88% | | | 0% | | |

Opus's one miss (h-025, `config_error` read as `bad_deploy`) is the labeled acceptable answer. It got both lookalike traps Haiku fell for (h-022, h-045) right. Of the 48 traps on these incidents (16 lookalikes, 16 timed decoys, 16 second faults), it took none: no lookalike category picked, and no lookalike, timed-decoy or second-fault line cited. Its herring citations (6 incidents) are all the older single-line herrings and chronic decoys. That's one incident apart on top-1 (15 vs 14 of 16), and two on lenient: far inside run-to-run noise at n=16.

### Conclusion

The new bait barely moves Haiku: 94% strict, down from 98%, and 94% lenient, down from 100%. Hard, with everything switched on, is at 88%. Haiku reasons along the failing request's chain and ignores what isn't on it. Bait that lines up in time but sits off that chain (timed decoys, the second fault) is taken once in 64 plantings. On-path bait that *precedes* the fault (lookalikes) is taken about one time in twelve. Round 3 could only change settings, and hard already has every feature on. Opus medium scores 94% (100% lenient) on that tier, so no settings change can bring the set into 65–85%. **Calibration stopped after round 2, with the band missed.** Pilot spend: $1.75.
