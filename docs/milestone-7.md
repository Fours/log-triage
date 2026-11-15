# Milestone 7: A harder incident set (generator v2)

Status: **In progress.** Phases 0–6 are in the README roadmap; this is the first one tracked as a task spec.

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
| T2. Quiet causes and paraphrased evidence | Not started | |
| T3. Loud decoys | Not started | |
| T4. Concurrent incidents and the `secondary` role | Not started | |
| T5. Long haystacks, fairness checks, baseline ceiling | Not started | |
| T6. Pilot and calibrate on the v2 dev set | Not started | |
| T7. Model matrix and repeats on the v2 test set | Not started | |
| T8. Write-up, site update, deploy | Not started | |

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

### T3. Loud decoys

- New ERROR-level, chronic herring kinds: at least 4, each mimicking a different category.
- Placement: not on the paged request's path, starts before onset, outnumbers the path's error count in `listServices`.

**Done when:** in every v2 incident with a decoy, the overview's top service by error count is not the cause service, and decoy lines carry the `herring` role and appear in `label.herringLines`.

### T4. Concurrent incidents and the `secondary` role

- `secondary` line role; a `secondaryLines` field on the label, defaulting to `[]` so v1 labels still parse.
- Pairing rules: a different category, disjoint services from the paged path, onset within ±5 minutes, and never a pairing that could be a defensible answer to the alert.
- `IncidentScore.secondaryCited`, plus a summary field and a report line. No change to existing metrics.

**Done when:** every v2 hard incident has a secondary fault with its own cause lines; scorer tests cover `secondaryCited`; old run records rescore unchanged (`npm run rescore` leaves v1 summaries identical apart from the new zero field).

### T5. Long haystacks, fairness checks, baseline ceiling

- Volume factor for background traffic and housekeeping, per the feature table.
- Generator tests:
  - reachability: every evidence line is within `get_context` range of a line returned by a level, service or trace query that doesn't depend on the label
  - the alert names no cause service or cause phrase
  - the keyword baseline scores at most 35% top-1 on v2 dev
  - "cite every ERROR" has lower precision than on v1
- Tool-output and budget behavior checked with the fake client on the largest v2 incident (the 12k-char cap truncates cleanly; the overview stays small).

**Done when:** all of the above are tests that pass; `npm run eval -- --baseline --dataset incidents/v2/dev` runs, and its result is recorded.

### T6. Pilot and calibrate on the v2 dev set

- Top up credits first.
- Pilot: Haiku low (cheap signal first), then Opus medium. If outside the calibration band, adjust the feature-table knobs, regenerate, and pilot again (at most three rounds; if it still misses, stop and report).
- `results/DATASET-V2.md`: each pilot's knobs, results, and what changed.
- Then generate `incidents/v2/test` once and commit it.

**Done when:** Opus medium top-1 on v2 dev is in the 65–85% band, budget exhaustion is under 15%, and the pilot log is committed.

### T7. Model matrix and repeats on the v2 test set

- Runs, ordered so no two share prompt cache (same rule as Phase 5): Haiku low, Sonnet low, Opus low, Opus medium; optionally Haiku and Sonnet medium.
- Haiku low twice more, for run-to-run variance. Report the spread of top-1 and recall across the three runs, next to the bootstrap intervals.
- Paired comparisons with `npm run compare`, as in Phase 5.

**Done when:** all runs are complete (no `incomplete` status) and on the leaderboard, and the paired comparisons and the variance numbers are recorded in `results/DATASET-V2.md`.

### T8. Write-up, site update, deploy

- README: a "Harder incidents (Phase 7)" section with the v2 matrix, what the models fell for, and whether the cheapest model is still the right one.
- `export:site`: v2 runs and pairs. Site: a v1/v2 switch on the model comparison, a v2 replay (pick an incident where a model cited a decoy or the secondary fault), and an updated Limitations section.
- `npm run deploy` from `site/` once the CloudFront setup from Phase 6 exists.

**Done when:** the README, leaderboard, and site show both datasets, and the site is deployed (or the deploy is blocked only on the AWS setup, noted in the README).

## Definition of done

- [ ] T1 to T8 are complete.
- [ ] `npm test` and `npm run typecheck` pass; the site builds.
- [ ] v1 datasets and all pre-Phase-7 run records are unchanged.
- [ ] On the v2 test set, at least two models differ on top-1 by more than the paired 95% interval, or the write-up explains why not.
- [ ] Every claim in the write-up has a paired interval behind it.

## Open questions

1. **Calibration band.** 65–85% for Opus medium leaves room both ways. Is a harder target, like 50–70%, more useful for separating models, at the risk of a set that mostly measures budget exhaustion?
2. **Budgets.** Keeping v1's budgets makes v1 and v2 comparable, but long haystacks may make budget the binding constraint. Alternative: raise budgets for v2 and report both.
3. **Concurrent incidents and scoring.** This spec only reports `secondaryCited`. Should citing the secondary fault's cause lines in the top hypothesis count against the agent the way a herring does?
4. **Effort levels.** The matrix keeps `low` and `medium`. On harder incidents, `high` may now matter for Opus and Sonnet. Add Opus high (~$5+) if the budget allows?
5. **Prompt v4.** If v3 does badly on v2, is tuning a v4 on the v2 dev set the next phase, or should the comparison stay "one fixed prompt, many models"?
