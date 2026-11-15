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

## Model matrix on the v2 test set (T7)

Prompt v3, `incidents/v2/test` (48 incidents, generated once from the final T6 settings, never tuned on), v1 budgets, tools v2. Runs were sequential and cold: different models never share prompt cache, and every two runs of the same model started at least 5.5 minutes apart. All eight runs are `complete`. T7 cost **$9.19**.

| model, effort | top-1 | lenient | hard top-1 | evidence P / R | herrings cited / incident | ECE | cost / incident | p50 latency | tool calls | budget exhausted |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [Haiku 5.5, low](runs/2026-11-15_claude-haiku-5-5_v3_low_v2-test/report.md) (3 runs, mean) | 97% | 97% | 92% | 84% / 85% | 0.85 | 0.13 | **$0.0039** | 13.4s | 8.3 | 0 |
| [Haiku 5.5, medium](runs/2026-11-15_claude-haiku-5-5_v3_medium_v2-test/report.md) | 96% | 96% | 94% | 84% / 89% | 0.88 | 0.16 | $0.0056 | 16.3s | 11.8 | 0 |
| [Sonnet 5.5, low](runs/2026-11-15_claude-sonnet-5-5_v3_low_v2-test/report.md) | 94% | 98% | 88% | 91% / 71% | **0.08** | 0.09 | $0.023 | **5.7s** | 2.3 | 0 |
| [Sonnet 5.5, medium](runs/2026-11-15_claude-sonnet-5-5_v3_medium_v2-test/report.md) | 96% | 100% | 88% | **92%** / 75% | **0.06** | 0.09 | $0.025 | 6.3s | 2.5 | 0 |
| [Opus 5.5, low](runs/2026-11-15_claude-opus-5-5_v3_low_v2-test/report.md) | 100% | 100% | 100% | 90% / 80% | 0.35 | 0.11 | $0.050 | 7.3s | 2.6 | 0 |
| [Opus 5.5, medium](runs/2026-11-15_claude-opus-5-5_v3_medium_v2-test/report.md) | 98% | 100% | 94% | 89% / **89%** | 0.81 | **0.07** | $0.076 | 14.2s | 5.3 | 0 |

"Herrings cited" counts labeled herring lines cited in any hypothesis, as the scorer always has. Hard top-1 is over 16 incidents.

### Run-to-run variance (Haiku low, three identical runs)

| run | top-1 | lenient | evidence P / R | herrings cited | cost / incident | top-1 95% bootstrap interval |
|---|---:|---:|---:|---:|---:|---:|
| [1](runs/2026-11-15_claude-haiku-5-5_v3_low_v2-test/report.md) | 100% (48/48) | 100% | 86% / 88% | 0.98 | $0.0038 | [100, 100] |
| [2](runs/2026-11-15_claude-haiku-5-5_v3_low_v2-test_rep2/report.md) | 92% (44/48) | 94% | 83% / 85% | 0.77 | $0.0041 | [83, 98] |
| [3](runs/2026-11-15_claude-haiku-5-5_v3_low_v2-test_rep3/report.md) | 98% (47/48) | 98% | 82% / 83% | 0.79 | $0.0039 | [94, 100] |
| spread | 8 pts (SD 4.3) | 6 pts | 4 / 5 pts | 0.21 | ±4% | |

**The bootstrap intervals understate run-to-run variance.** Run 1's interval is [100, 100], yet the same configuration scored 92% one run later. Worse, `npm run compare` of run 1 against run 2 gives top-1 −8.3 pts, 95% [−16.7, −2.1]: "significant" between two identical configurations. Paired intervals resample incidents, not reruns, so they capture which incidents a run happens to get wrong, but not that the misses move between runs. Every difference below needs this in mind: **a top-1 gap of up to about 8 points can be pure run-to-run noise.** Evidence precision and recall vary by about 4–5 points between Haiku's runs; cost and latency barely vary.

### Paired differences against Opus low

`npm run compare`, 95% bootstrap intervals over the same 48 incidents. Bold: the interval excludes 0 *and* the gap is larger than Haiku's run-to-run spread on that metric.

| vs. Opus, low | top-1 | evidence precision | evidence recall | herrings cited | cost / incident | latency |
|---|---:|---:|---:|---:|---:|---:|
| Haiku low (run 1) | 0 [0, 0] | −4 [−9, +1] | +8 [+3, +13] | +0.63 [+0.17, +1.19] | **−$0.046** [−0.051, −0.042] | **+5.2s** [+3.9, +6.4] |
| Haiku low (run 2) | −8 [−17, −2] | −7 [−11, −2] | +5 [−2, +12] | +0.42 [0.00, +0.90] | **−$0.046** | **+6.9s** |
| Haiku low (run 3) | −2 [−6, 0] | −7 [−13, −2] | +2 [−3, +7] | +0.44 [+0.08, +0.85] | **−$0.046** | **+5.8s** |
| Haiku medium | −4 [−10, 0] | −6 [−10, −2] | +9 [+3, +14] | +0.52 [+0.02, +1.15] | **−$0.044** | **+10.5s** |
| Sonnet low | −6 [−15, 0] | +1 [−1, +3] | **−10** [−14, −6] | −0.27 [−0.44, −0.10] | **−$0.027** | **−1.9s** [−2.7, −1.1] |
| Sonnet medium | −4 [−10, 0] | +2 [+1, +4] | −6 [−9, −3] | −0.29 [−0.46, −0.15] | **−$0.025** | **−1.3s** [−2.1, −0.7] |
| Opus medium | −2 [−6, 0] | −1 [−3, +2] | **+9** [+5, +13] | +0.46 [+0.21, +0.71] | **+$0.026** | **+6.7s** |

### The bait

Across all eight runs, the T6 bait was almost never taken: a lookalike's category was picked once in 192 chances (Haiku low run 2, ht-012), and no top hypothesis cited a lookalike, a timed or chronic decoy, or the second fault's lines. The herrings models do cite are the older single-line ones near the cause (a slow query, a GC pause, a config reload that changed nothing). Every miss by Sonnet and Opus picked the labeled acceptable answer, except Sonnet low on ht-006 (a cache stampede read as `resource_exhaustion`). Haiku low's misses are scattered and change from run to run: ht-012, ht-014, ht-030 and ht-031 are each missed in one run and right in the others.

### What T7 establishes

- **No two models differ on top-1 beyond run-to-run noise.** Every model is at 92–100%, and the largest model-vs-model gap (Sonnet low, −6 pts) is smaller than the 8-point spread between identical Haiku runs. The milestone's demo goal ("at least two models differ on top-1 by more than the paired 95% interval") is not met in any way that means something. Some paired intervals do exclude 0, but the same test also separates Haiku from itself.
- **What does separate them, beyond noise:** cost (Haiku is 1/13 of Opus low and 1/20 of Opus medium), latency (Sonnet is fastest; Haiku and Opus medium are slowest), and evidence recall (Sonnet low recalls 10 points less than Opus low, and Opus medium 9 points more, both well beyond Haiku's 5-point spread; Sonnet medium's −6 is at the edge of it). Herrings cited also differ: Sonnet cites fewer than Opus low, and Haiku and Opus medium more, but those intervals sit close to Haiku's own run-to-run spread (0.21 lines).
- **Effort:** for Opus, medium buys recall (+9 pts) at +52% cost and about twice the latency. For Haiku and Sonnet, medium changes nothing outside noise.
- **Budgets never bind** (0 of 384 investigations), and Haiku is the only model that does much searching (8 tool calls against Opus low's 2.6).
