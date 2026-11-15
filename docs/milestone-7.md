# Milestone 7: A harder incident set (generator v2)

Status: **Done, with the calibration target missed** (see T6–T8). Phases 0–6 are in the README roadmap; this is the first one tracked as a task spec.

## Outcome

Phase 5 ended with every model at 98–100% top-1 on the held-out set. The eval can rank models on cost, latency and evidence, but not on diagnosis. This milestone builds a second, harder generator version whose incidents defeat the shortcuts the agents were seen using. It then re-runs the model comparison on it, so the models separate on root cause too.

The v1 datasets and every committed run stay exactly as they are. v2 is a new pair of datasets beside them, not a replacement.

**Demo at the end:** the leaderboard and the site show v1 and v2 side by side. On v2, at least two models differ on top-1 by more than the paired 95% interval, and there's a new replay where a model takes the bait that v2 plants.

## Why v1 is too easy: the shortcuts to break

Read from the Phase 4–5 traces. Each v2 feature below targets one of these.

| Shortcut the agents use | Why it works on v1 | v2 feature that breaks it |
| --- | --- | --- |
| Open with `search_logs(level: "WARN")` and read the top of the list | The cause is almost always a WARN or ERROR line near onset | **Quiet causes:** the cause shows up only at INFO or DEBUG |
| Trust the overview's error counts | The service with the most errors is next to the cause | **Loud decoys:** an unrelated service has more errors than the real path |
| Grep one phrase to collect all the evidence | Every cause line repeats one fixed message | **Paraphrased evidence:** the same failure logged several ways |
| Assume one fault per window | Each incident has exactly one fault | **Concurrent incidents:** a second, real fault that doesn't explain the alert |
| Read the whole interesting region in a page or two | 120–410 lines | **Long haystacks:** 1,500–4,000 lines, so search caps and the 12k-char tool output cap bite |

## Scope

In scope:

- Generator version 2: the five features above, layered by difficulty
- Two new datasets, `incidents/v2/dev` and `incidents/v2/test` (48 incidents each, same category × variant × difficulty grid as v1, so results compare cell by cell)
- Difficulty checks in `npm run test:generator`, including a ceiling for the keyword baseline
- A cheap pilot on the v2 dev set to calibrate the knobs into a target band
- The model matrix on the v2 test set, plus repeated runs to measure run-to-run variance
- Write-up: README, `results/`, and the site (with a fresh deploy)

Out of scope (possible later work):

| Item | Why not now |
| --- | --- |
| Tuning a v4 prompt on v2 | The point is to measure v3 on harder incidents. Tuning comes after, as its own phase, on the v2 dev set only. |
| Clock skew between services | It changes what "earliest" means, and needs a new tool or overview field. Keep it as an idea for v3. |
| Real (non-synthetic) logs | Separate project: hand-written labels, different trust model |
| New root-cause categories | It would break comparability with v1 |

## Design

### Versioning and layout

- `GENERATOR_VERSION` becomes per-dataset. `generateDataset(seed, { version: 2, ... })` selects the v2 behavior; the default stays 1.
- **v1 output must stay byte-identical.** `test:generator` already asserts that the committed `incidents/generated` and `incidents/test` match the generator. That keeps holding with no file changes.
- New seeds and prefixes, so ids never collide with v1: dev `log-triage-v2` / `h-001`…, test `log-triage-v2-test` / `ht-001`…, with the test set's topology shift kept.
- `npm run generate -- --v2` and `npm run generate -- --v2 --test` write `incidents/v2/dev` and `incidents/v2/test`. The manifest records `generatorVersion: 2`.
- **v2 incident files are not committed** (decided at T1): at 1,500–4,000 lines a set is roughly 20–25 MB, and T2–T6 regenerate it several times. Only each set's `manifest.json` is committed, with a SHA-256 per incident. `test:generator` regenerates in memory and checks against those hashes, and the eval refuses to run on a missing or stale file, printing the `npm run generate` command to fix it. Generation is seeded, so the files are exactly reproducible.
- Run tagging: today the runner tags a run with the last path segment (`test`), which would make `incidents/v2/test` collide with v1's `test`. Change the tag to the path under `incidents/` with `/` → `-` (`v2-test`), keeping the v1 tags (`null` for `generated`, `test`) as they are, so existing run ids don't change.
- Leaderboard: one table per dataset already. Add titles for the two v2 dirs.

### The five features

Each is a function that takes the scenario's `Ctx` and is switched on by version and difficulty. Scenarios keep emitting their cause and symptom lines through the builder as now, so roles, labels and the evidence = cause-lines rule are unchanged.

| Feature | easy | medium | hard |
| --- | --- | --- | --- |
| Quiet causes | off | half the scenarios | all scenarios |
| Paraphrased evidence | 2 phrasings | 3 | 4 |
| Loud decoys | 1 | 1 | 2 |
| Concurrent incident | off | off | on |
| Haystack size (lines) | ~1,500 | ~2,500 | ~4,000 |

This is the table as planned. T6 changed it: see the table in T6's notes for the final settings.

**Quiet causes.** The originating lines (the release, the config reload, the lock holder, the restore) are emitted at INFO or DEBUG instead of WARN or ERROR, and there are fewer of them (1–2). Downstream symptoms keep their levels, so the trail is still there, but `level: WARN` no longer lands on the cause. Each scenario declares which of its cause lines can be quieted, because some causes are inherently loud: an OOM kill stays FATAL.

**Paraphrased evidence.** The direct-failure lines that are evidence (query timeouts, refused connections, duplicate keys) cycle through 2–4 realistic message variants from different code paths and libraries. One substring search finds some of them; getting the recall needs a second query, `get_context`, or `correlate_trace`.

**Loud decoys.** A herring kind that is ERROR-level and voluminous: a chronic failure that started before onset and continues (a batch job erroring on every run, a health check failing on a deprecated endpoint, a noisy third-party webhook retrying). It sits on a service that is not on the paged request's path, and it outnumbers the real path's errors in the overview. It's labeled `herring`, so citing it counts against the agent. Decoys are chosen from the categories the true cause is confusable with, as hard-mode herrings already are.

**Concurrent incident.** On hard incidents only, a second scenario from a different category also runs, starting within ±5 minutes of the first, on services that don't touch the paged path. Its cause lines are labeled with a new role, `secondary`. That role is not evidence and not a herring: the label still has one root cause, the one that explains the alert. Scoring changes in one small way: `herringsCited` stays as it is, and a new per-incident count `secondaryCited` is reported (not penalized beyond the precision loss). The alert text must make it clear which symptom paged, so the task stays well-defined.

**Long haystacks.** `backgroundTraffic` and the periodic housekeeping streams scale by a volume factor. The window grows somewhat, but mostly the density increases. The agent's budget (20 turns, 40 tool calls, 600k tokens, 5 minutes) stays the same as v1 on purpose. Budget-exhausted outcomes are now a real, reported failure mode, not a rounding error.

### Keeping it fair

Harder must not mean unsolvable or mislabeled:

- **Every evidence line is reachable** without knowing the answer: each one is within `get_context` range of a line that some simple query returns (a level filter, a service filter, or a trace id seen in the alert path). The generator test checks this mechanically.
- **The alert never names the cause**, and service names still don't predict the category (rotating topologies).
- **Ambiguity stays labeled**: `acceptableCauses` and the explanation rules are unchanged. The concurrent incident must never be a defensible answer to the alert. If a pairing could be read that way, the generator rejects it.
- **No new heuristic wins**: the keyword baseline must fall well below its v1 score (target ≤ 35% top-1 on v2 dev), and "cite every ERROR" must lose more precision than on v1.

### Calibration target

The set is useful if it leaves room above and below. Target on the v2 dev set, measured in the pilot:

- Opus 5.5 at medium effort, prompt v3: **top-1 between 65% and 85%**
- At least one model's top-1 differs from Opus's by more than its paired 95% interval
- Fewer than 15% of incidents end in budget exhaustion for any model (some is informative; most is a broken set)

If the pilot lands outside the band, adjust the knobs in the feature table (not individual incidents), regenerate, and pilot again. Record every pilot in `results/DATASET-V2.md`, the same way `ITERATIONS.md` records prompt versions. The test set is generated once the knobs are final, and nothing is tuned on it.

### Cost estimate

Longer haystacks mean more tokens per incident. Roughly, from v1 costs scaled by the haystack and the extra tool calls:

| Run | Estimate |
| --- | ---: |
| Pilots on v2 dev (Haiku low ×2–3, Opus medium ×1–2) | $4–10 |
| Matrix on v2 test: Haiku, Sonnet, Opus at low + Opus medium | $8–14 |
| Optional: Haiku and Sonnet at medium | $2–4 |
| Repeats: Haiku low ×3 on v2 test | $1–2 |
| **Total** | **~$15–30** |

That's around the current balance (about $20 after Phase 5), so top up before T6. The fatal-error stop and `--resume` from Phase 3 make running out mid-run cheap.

## Tasks

Do these in order. Each one ends with `npm test` and `npm run typecheck` passing. T1–T5 cost nothing; API spend starts at T6.

| Task | Status | Commit |
| --- | --- | --- |
| T1. Dataset plumbing for generator v2 | Done | 53ca8b7 |
| T2. Quiet causes and paraphrased evidence | Done | 60e1f8a |
| T3. Loud decoys | Done | c3e7876 |
| T4. Concurrent incidents and the `secondary` role | Done | 91630ba |
| T5. Long haystacks, fairness checks, baseline ceiling | Done | 6a25997 |
| T6. Pilot and calibrate on the v2 dev set | Done (band missed) | 9e5db7a |
| T7. Model matrix and repeats on the v2 test set | Done | f8d85d6 |
| T8. Write-up, site update, deploy | Done | |

### T1. Dataset plumbing for generator v2

- `version` option on `planDataset` / `generateDataset`, defaulting to 1. v2 seeds and id prefixes as above.
- `npm run generate -- --v2 [--test]` writes `incidents/v2/dev` or `incidents/v2/test`. At this point v2 output equals v1 behavior under the new seeds; the features land in T2–T5.
- Runner dataset tag from the path under `incidents/` (`v2-test`), with v1 tags unchanged. Leaderboard titles for the v2 dirs. `--dataset` already accepts any path.
- `export:site` and the site still build unchanged.

**Done when:** v1 datasets are byte-identical (existing test), the v2 dirs generate deterministically and are checked in sync by `test:generator`, and a fake-agent runner test shows a `v2-test` run id and its own leaderboard table.

Done: `DATASETS` registry and `version` option in `src/generator/index.ts`, `Ctx.version` for T2–T5 to switch on, manifests with hashes (`src/generator/manifest.ts`), `--v2` in `npm run generate`, run tags from `datasetTagFor`, and missing/stale-file checks in `loadDataset`. Tests: `test:generator` (v1 default unchanged; each v2 set deterministic, balanced, with its own ids, and matching its committed manifest hash for hash) and `test:eval` (tags, a `v2-test` run and its own table, stale and missing files caught).

### T2. Quiet causes and paraphrased evidence

- Each scenario marks which cause lines can be quieted, and gets 2–4 message variants for its direct-failure evidence lines.
- Applied per the feature table by difficulty.

**Done when:** on v2 hard incidents, no evidence line from a quieted cause is WARN or above; every scenario has at least 2 phrasings for its evidence messages, and no single message substring covers all of an incident's evidence lines on medium and hard; v1 is unchanged.

Done: `src/generator/hardness.ts` (`c.hard`: quiet-cause switch, origin-line count, message families cycling through 2/3/4 variants from a random start, all v2 randomness on its own forked stream so v1 never draws). Scenarios mark originating cause lines with `origin: true`, and the builder logs them at INFO when quiet. 9 of 16 scenarios are quietable; the other 7 start quietly already or are inherently loud. At medium, 5 of the 9 are quiet (every other one in sorted key order, the same in both sets). 22 message families, each with 4 variants whose variant 0 is the v1 message. Tests in `test:generator`: v1 wording and levels unchanged; quietable scenarios and origin lines consistent; hard origins below WARN and at most 3; medium/easy quiet exactly as chosen; families mix wordings; and no 20-character phrase is shared by every line of a family.

Decisions made while building it:

- **The shared-phrase check masks service names as well as numbers.** Real Kubernetes and client messages include the pod or service name, and the `service` filter already finds those lines, so a shared service name gives a phrase search nothing extra. Hosts, URLs, buckets and file paths are not masked: variants were reworded so only non-neighboring variants name them.
- **Side effect for T3/T5:** quieting the first signs of the fault makes the first ERROR line more often real evidence (33–35 of 48 on v2 vs. 31 on v1), because it's now usually the direct failure. The loud decoys in T3 should push that back down; T5's "cite every ERROR" check will measure it.

### T3. Loud decoys

- New ERROR-level, chronic herring kinds: at least 4, each mimicking a different category.
- Placement: not on the paged request's path, starts before onset, outnumbers the path's error count in `listServices`.

**Done when:** in every v2 incident with a decoy, the overview's top service by error count is not the cause service, and decoy lines carry the `herring` role and appear in `label.herringLines`.

Done: `src/generator/decoys.ts`, with 8 decoy kinds, one mimicking each category, each on its own auxiliary service (`status-poller`, `metrics-agent`, `report-cron`, `flag-sync`, `audit-archiver`, `billing-reconciler`, `analytics-forwarder`, `webhook-dispatcher`). A decoy starts 10–30% into the window, repeats to the end, and logs the real path's highest per-service error count plus 3–8, so it tops the overview. Like hard-mode herrings, decoys mimic the scenario's confusable categories first and never the true one. Every v2 incident also gets one healthy auxiliary service (a decoy's name and routine, no errors), and the v2 services list is shuffled, so an extra service isn't a giveaway. All randomness is on the v2 stream; v1 is byte-identical. Tests in `test:generator`: no name collisions with topology services, 1/1/2 decoys plus one healthy auxiliary, the top service by errors is a decoy and strictly out-shouts the path, decoys are off the path and labeled herrings, they start before the fault's first direct failure and continue after it, services are shuffled, and "the first ERROR line is evidence" is rare.

Result: the first ERROR line is evidence in 0 of 48 incidents in both v2 sets (31 in v1, 33–35 after T2). Decisions made while building it:

- **Decoys live on auxiliary services, not off-path topology services:** every topology service is on some scenario's path. `audit-consumer` was renamed `audit-archiver`, because it's a real consumer in one topology.
- **"Starts before onset" is checked against the fault's first direct failure**, since onset isn't in the log and some evidence deliberately predates it. Retry storms have no ERROR-level evidence, so they use the first non-origin evidence line.

### T4. Concurrent incidents and the `secondary` role

- `secondary` line role; a `secondaryLines` field on the label, defaulting to `[]` so v1 labels still parse.
- Pairing rules: a different category, disjoint services from the paged path, onset within ±5 minutes, and never a pairing that could be a defensible answer to the alert.
- `IncidentScore.secondaryCited`, plus a summary field and a report line. No change to existing metrics.

**Done when:** every v2 hard incident has a secondary fault with its own cause lines; scorer tests cover `secondaryCited`; old run records rescore unchanged (`npm run rescore` leaves v1 summaries identical apart from the new zero field).

Done: `concurrentIncident` in `src/generator/index.ts`. On v2 hard incidents a second scenario runs on a **different topology**, a separate product sharing no service with the primary, because every scenario touches its own topology's edge and app. `checkout` and `notifications` share `api-gateway` and `redis`, so they never pair. The second scenario runs at medium difficulty with its own v2 difficulty object and background traffic, before the decoys, so decoys still top the overview. `IncidentBuilder.within(scope)` retags its cause lines as `secondary`, applies its own quiet setting, prefixes its message families, and keeps its first signs out of the incident's origin lines. The label gains optional `secondaryLines` and `secondaryScenario`. They're optional rather than defaulted, so v1 files stay byte-identical, and the spec's "new zero field" didn't turn out to be needed: `secondaryCited` and `Summary.secondary` are only present when an incident has a second fault, so `npm run rescore` leaves every committed run byte-identical. The report adds a "Concurrent incidents" line when a run has any. Tests: `test:generator` (present exactly on v2 hard, a fair pairing, onset within ±5 minutes, other services only, not named in the alert, never evidence or herring) and `test:eval` (`secondaryCited` across all hypotheses, absent otherwise, and the summary and report line).

Sizes now: v2 easy 148–266 lines, medium 211–356, hard 425–712 (the second product roughly doubles a hard incident). T5's volume factor applies on top.

### T5. Long haystacks, fairness checks, baseline ceiling

- Volume factor for background traffic and housekeeping, per the feature table.
- Generator tests:
  - reachability: every evidence line is within `get_context` range of a line returned by a level, service or trace query that doesn't depend on the label
  - the alert names no cause service or cause phrase
  - the keyword baseline scores at most 35% top-1 on v2 dev
  - "cite every ERROR" has lower precision than on v1
- Tool-output and budget behavior checked with the fake client on the largest v2 incident (the 12k-char cap truncates cleanly; the overview stays small).

**Done when:** all of the above are tests that pass; `npm run eval -- --baseline --dataset incidents/v2/dev` runs, and its result is recorded.

Done. Sizes are easy ~1,500, medium ~2,500 and hard ~4,350 lines, from a v2-only density factor (`VOLUME`, 8 / 10 / 7) on background traffic and routine logging, including the auxiliary and second-product services. The time window is unchanged and v1 is byte-identical. Results: the keyword baseline gets **15%** top-1 on v2 dev (`results/runs/2026-11-15_baseline-keywords_v2-dev`; 10% on v2 test), down from 50% on v1, and citing every ERROR line drops from 32% precision on v1 to 13%.

Decisions made while building it:

- **`search_logs` gained `since`/`until` (agreed before building).** It returns the earliest matches only, capped at 200, with no paging, so in a 4,000-line log a quiet cause line could be unreachable except by guessing a search word. That fails this milestone's own fairness rule. Real log tools have time ranges. The time filters take an ISO timestamp or HH:MM[:SS], are inclusive, and roll a bare clock time past midnight. The tool set is now versioned: `TOOLS_VERSION = 2` in `src/agent.ts`, recorded as `tools` in each run's config (absent = 1, as for every Phase 0–6 run), shown in the report header, and `--resume` refuses to mix versions. **Comparisons between v1 and v2 runs carry this caveat**; comparisons between models on v2 don't, since all v2 runs use tools v2.
- **Reachability is tested with label-free queries:** WARN+ and ERROR+ overall and per service; per service, 2-minute windows around anything found that way; traces seen there; plus `get_context` (±50 lines). Each query takes the first 200 results. Every evidence line in both v2 sets is reachable.
- **The alert check covers phrases, not services:** in queue incidents the paged consumer is the faulty service, so "no cause service in the alert" can't hold. The check instead finds no distinctive evidence word (6+ letters) in the alert. Topology names and the alert templates' threshold words ("exceeded", "minutes", …) are allowed.
- **Decoys now speak their category's vocabulary.** The volume change shifted v2's random draws and the baseline rose to 38%. As agreed, the fix went into the decoys, not the baseline: each decoy is reworded the way that category usually reads ("at capacity", "parse error", "retrying", "since the deploy of …", "violates … constraint", "returned 502"), which makes them convincing mimics. Baseline: 38% → 15%.
- **Budgets unchanged** (open question 2 stays open until the T6 pilot shows whether they bind).

### T6. Pilot and calibrate on the v2 dev set

- Top up credits first.
- Pilot: Haiku low (cheap signal first), then Opus medium. If outside the calibration band, adjust the feature-table knobs, regenerate, and pilot again (at most three rounds; if it still misses, stop and report).
- `results/DATASET-V2.md`: each pilot's knobs, results, and what changed.
- Then generate `incidents/v2/test` once and commit it.

**Done when:** Opus medium top-1 on v2 dev is in the 65–85% band, budget exhaustion is under 15%, and the pilot log is committed.

Done, with the band **missed**: Opus medium is at 94% top-1 (100% lenient) on the hard tier of v2 dev. Two rounds and $1.75 of pilots, all in [`results/DATASET-V2.md`](../results/DATASET-V2.md). Budget exhaustion is 0% in every run. The test set's manifest is regenerated from the final settings.

- **Round 1 (T5 settings):** Haiku low 98% top-1, 100% lenient. The traces show why: the alert gives the onset time, and a few-minute `since`/`until` search on the paged service finds the quiet cause no matter how big the haystack is. Chronic decoys are ruled out because they predate the fault. Median 6 tool calls out of 40. No settings change could help, because hard already had every feature on. Opus was not run.
- **Design change (agreed before building):** bait that lines up with the fault in time, so classification and not just search has to do the work.
  - **Timed decoys** (`src/generator/decoys.ts`): the same error floods, starting just after the fault's first cause line, on a service no failing request's trace touches.
  - **Lookalike events** (`src/generator/lookalikes.ts`): one harmless event on the paged path, 2–6 minutes before the fault, mimicking a confusable category. Eight kinds: an app deploy, a config reload, a heap warning that GC clears, one slow call, a circuit breaker that flaps closed, a provider status notice for another region, one redelivered message, an online index migration. Each is followed by healthy traffic, labeled `herring`, and never the root cause or an acceptable answer.
  - **The concurrent incident** now runs at medium too.
  - **Generator tests** for each: timed decoys start after the fault's first evidence line and within 3 minutes of its first failure, and share no trace with the failing path. Lookalikes sit on the paged topology, lead the fault by 1–6.5 minutes, have at least 3 healthy lines on their service before the fault, stay below ERROR, and never mimic an answer.
- **Round 2:** Haiku low 94% top-1, 94% lenient (hard 88%). Opus medium was run on the 16 hard incidents only: 94% top-1, 100% lenient, $1.38. On top-1 that's 15 vs 14 of 16, inside run-to-run noise. Haiku took the bait rarely: it picked a lookalike's category in 2 of 24, cited a timed decoy in 0 of 32, and cited the second fault in 1 of 32. Opus took none of it. The models follow the failing request's chain and ignore whatever isn't on it.
- **Stopped after round 2** rather than three rounds. Round 3 could only change settings, and hard already has everything on.

Final feature table:

| Feature | easy | medium | hard |
| --- | --- | --- | --- |
| Quiet causes | off | half the scenarios | all scenarios |
| Paraphrased evidence | 2 phrasings | 3 | 4 |
| Loud decoys | 1 chronic | 1 timed | 1 chronic + 1 timed |
| Lookalike event | off | half the scenarios (the other half) | all scenarios |
| Concurrent incident | off | on | on |
| Volume factor (mean lines) | 8 (~1,500) | 5.5 (~2,550) | 10.5 (~4,500) |

Decisions made while building it:

- **Volume rebalanced** (medium 10 → 5.5, hard 7 → 10.5). The second fault at medium brings its own background traffic, taken at the medium density, which also feeds hard's second fault. Sizes stay on target.
- **Reachability looks back 5 minutes**, not 1, per service before any loud line. The denser medium logs pushed one quiet memory-leak line (h-007) out of `get_context` range of its OOM. The pilot agents search 5–13 minute windows routinely, so a 5-minute lead-up is still a label-free query, and the 200-result cap still applies.
- **Keyword baseline:** 10% top-1 on the regenerated v2 dev (`results/runs/2026-11-15_baseline-keywords_v2-dev_r2`). Citing every ERROR line gets 11% precision, against 32% on v1.

What this means for T7 and T8: v2 is unlikely to separate models on top-1. What it can separate them on is evidence precision and recall, herrings cited, cost and latency, plus top-1 on the hard tier, reported with its interval. T7 runs as planned. The write-up states plainly that the calibration target was missed and why.

### T7. Model matrix and repeats on the v2 test set

- Runs, ordered so no two share prompt cache (same rule as Phase 5): Haiku low, Sonnet low, Opus low, Opus medium; optionally Haiku and Sonnet medium.
- Haiku low twice more, for run-to-run variance. Report the spread of top-1 and recall across the three runs, next to the bootstrap intervals.
- Paired comparisons with `npm run compare`, as in Phase 5.

**Done when:** all runs are complete (no `incomplete` status) and on the leaderboard, and the paired comparisons and the variance numbers are recorded in `results/DATASET-V2.md`.

Done. Eight cold runs, all `complete`, $9.19: Haiku low ×3, Haiku medium, Sonnet low and medium, Opus low and medium. The full tables are in [`results/DATASET-V2.md`](../results/DATASET-V2.md#model-matrix-on-the-v2-test-set-t7).

- **Every model is at 92–100% top-1.** No model-vs-model gap (largest: Sonnet low, −6 pts against Opus low) exceeds the 8-point spread between three identical Haiku low runs (100%, 92%, 98%).
- **The paired bootstrap is not enough on its own.** Comparing Haiku low run 1 with run 2 gives top-1 −8.3 pts, 95% [−16.7, −2.1]: "significant" between identical configurations. It resamples incidents, not reruns. Claims in T8 need a gap larger than the measured run-to-run spread, not just an interval that excludes 0.
- **What separates the models beyond noise:** cost (Haiku 1/13 of Opus low), latency (Sonnet fastest), and evidence recall (Sonnet low −10 pts and Opus medium +8 pts against Opus low).
- **The T6 bait was never taken on the test set:** no top hypothesis cited a lookalike, decoy or second-fault line. The one time a lookalike's category was picked (ht-012), the model was reacting to a different, older herring.
- **Budgets never bound:** 0 of 384 investigations ran out.

Decisions made while building it:

- **`npm run compare` reports `herringsCited`** (labeled herring lines cited in any hypothesis, per incident), since on v2 that's how a model would show it took the bait. `secondaryCited` isn't added: it was 0 in every top hypothesis.
- **Haiku and Sonnet at medium were run** (the optional pair). Opus high was not (open question 4): with Opus low at 100%, there's no headroom for it to show.

### T8. Write-up, site update, deploy

- README: a "Harder incidents (Phase 7)" section with the v2 matrix, what the models fell for, and whether the cheapest model is still the right one.
- `export:site`: v2 runs and pairs. Site: a v1/v2 switch on the model comparison, a v2 replay (pick an incident where a model cited a decoy or the secondary fault), and an updated Limitations section.
- `npm run deploy` from `site/` once the CloudFront setup from Phase 6 exists.

**Done when:** the README, leaderboard, and site show both datasets, and the site is deployed (or the deploy is blocked only on the AWS setup, noted in the README).

Done. The README has a "Harder incidents (Phase 7)" section, the leaderboard lists every v2 run, and the site was deployed with both datasets.

- **README:** the v2 matrix, run-to-run variance, what the models fell for (nothing planted), whether the cheapest model is still right (yes: same diagnosis as Opus within noise, at 1/13 of the cost), the debatable label, and the tools-v2 caveat. The status line and roadmap are updated; Phase 6's "not yet live" is gone, since the site was already live.
- **`export:site`:** exports the 8 v2 test runs, a v2 keyword baseline (`2026-11-15_baseline-keywords_v2-test`, 15% top-1), v2 pairs including **Haiku low run 1 → run 2 (identical)** as the noise floor, v2 dataset stats, per-run hard top-1 and herrings cited, and dataset-aware replays.
- **Site:**
  - **Models:** a v1 / v2 switch over the chart, the table (now with a hard top-1 column) and the cards. The v2 view adds a paired-differences chart with the identical-runs row highlighted as the noise floor.
  - **Replay:** a v2 incident, ht-012 (tagged "v2"), comparing Haiku low runs 1 and 2 (labeled "run 1 of 3" / "run 2 of 3") with Opus low.
  - **Hero:** keeps the v1 stats and adds a pointer to the v2 result.
  - **Limitations:** rewritten: synthetic incidents don't separate these models on diagnosis, run-to-run noise exceeds the error bars, and one herring is debatable.

Decisions made while building it:

- **The v2 replay shows a debatable label, not a model taking planted bait.** No model took the T6 bait on the test set. ht-012 is the only miss of 13 whose answer cited a herring: Haiku blamed a deploy of the consumer that then crash-looped. That's an older herring, "unrelated-deploy" from Phase 1, which hard crash-loop incidents prefer because `bad_deploy` is confusable. In that scenario the "unrelated" consumer *is* the failing service.
- **That label is documented, not fixed** (agreed before building). It affects gen-046, test-014, h-013, h-023 and ht-012. Fixing it would change the v1 sets, which this milestone keeps byte-identical. A fix would belong in a future generator version: skip that herring when the consumer is the faulty service, or add `bad_deploy` to that scenario's acceptable causes.

## Definition of done

- [x] T1 to T8 are complete.
- [x] `npm test` and `npm run typecheck` pass; the site builds.
- [x] v1 datasets and all pre-Phase-7 run records are unchanged. *(Checked at T8: `git diff 53ca8b7^` over `incidents/generated`, `incidents/test` and every `2026-11-12_*` run is empty.)*
- [x] On the v2 test set, at least two models differ on top-1 by more than the paired 95% interval, or the write-up explains why not. *(They don't, beyond run-to-run noise. The README, `DATASET-V2.md` and the site explain why: identical Haiku runs spread 8 points, and the paired test flags even those as different.)*
- [x] Every claim in the write-up has a paired interval behind it, or, for top-1 on v2, the measured run-to-run spread, which T7 showed is the stricter test.

## Open questions

1. **Calibration band.** 65–85% for Opus medium leaves room both ways. Is a harder target, like 50–70%, more useful for separating models, at the risk of a set that mostly measures budget exhaustion? *Answered at T6: even 65–85% was out of reach. Two rounds of features left Opus medium at 94% on the hard tier, with no budget exhaustion. Fair synthetic bait doesn't defeat these models on diagnosis.*
2. **Budgets.** Keeping v1's budgets makes v1 and v2 comparable, but long haystacks may make budget the binding constraint. Alternative: raise budgets for v2 and report both. *Answered at T6: keep v1's budgets. They never bound in any pilot (median 6 tool calls, maximum 19, out of 40).*
3. **Concurrent incidents and scoring.** This spec only reports `secondaryCited`. Should citing the secondary fault's cause lines in the top hypothesis count against the agent the way a herring does?
4. **Effort levels.** The matrix keeps `low` and `medium`. On harder incidents, `high` may now matter for Opus and Sonnet. Add Opus high (~$5+) if the budget allows? *Answered at T7: no. Opus low is already at 100% top-1 on v2 test, and medium adds only recall.*
5. **Prompt v4.** If v3 does badly on v2, is tuning a v4 on the v2 dev set the next phase, or should the comparison stay "one fixed prompt, many models"?
