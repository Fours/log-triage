# log-triage

An LLM agent that investigates production logs and returns a **ranked root-cause triage** — each hypothesis backed by the specific log lines it cites, with a calibrated confidence and a recommended next action. It is built to be **measured**: the point of the project is the eval harness, not the demo.

> Status: **Phase 3** — the eval harness is in, with a first committed run: Opus 5.5 gets the root cause right on **46/48** incidents (vs. 24/48 for a keyword baseline) at **$0.05 and ~13s per incident**. See [results](results/README.md).

## Why this exists

Wiring up an LLM API call is software engineering. Making a non-deterministic system reliable *and proving it* is AI engineering. This project is organized around the parts that show the second thing:

- **Context engineering.** Logs don't fit in a context window. The agent is given the alert and a service-level overview, but **not** the raw logs — it must pull evidence through tools (`search_logs`, `get_context`, `correlate_trace`). It only ever sees what it asks for.
- **Agentic tool use.** It *investigates* in a loop: form a hypothesis, pull more lines, follow a trace across services, revise — then submit a structured verdict. (See the trace printed by the CLI.)
- **A clear LLM / not-LLM boundary.** The model reasons. It does **not** parse timestamps, filter log levels, or correlate trace ids — that is deterministic code in [`src/tools.ts`](src/tools.ts), which is unit-tested with no API key. The model's job is judgment; the plumbing's job is retrieval.
- **Evals.** A labeled incident set and a deterministic scorer (no LLM judge): root-cause accuracy (top-1 / top-3), evidence precision/recall, red herrings cited, confidence calibration, and cost/latency per incident. Results land in [`results/`](results/) so runs can be compared across models and prompt changes.

## Architecture

```
alert + service overview
        │
        ▼
   ┌─────────┐     search_logs / get_context /        ┌──────────────┐
   │  agent  │ ───  correlate_trace / list_services ──▶│ deterministic│
   │  (loop) │ ◀─── matched lines (capped)  ──────────│  log tools   │
   └─────────┘                                         └──────────────┘
        │ submit_triage(verdict)   ← terminal tool, schema-validated
        ▼
  ranked hypotheses + cited evidence lines + confidence + action
```

The agent never sees the ground-truth `label` on an incident: the CLI strips it to an `IncidentView` before the loop runs ([`toIncidentView`](src/types.ts)). The label exists only for the scorer.

## The agent loop

A manual loop rather than the SDK's tool runner, because an eval needs to control and record exactly how each investigation ends. Every run finishes with an `outcome`: `submitted`, `budget_exhausted`, `no_verdict`, `refused` or `api_error`. It never throws, so one bad incident can't stop a run over 48 of them.

- **Budgets.** There are limits on turns (20), investigation tool calls (40), total tokens (600k) and wall-clock time (5 min). When one gets close, the agent is told this is its last turn and to submit its best triage with lowered confidence. A budget hit still produces a verdict the eval can score. Forced `tool_choice` isn't available on current models, so the loop asks instead of forcing.
- **Failures.** The SDK retries 429 / 5xx / connection errors with backoff (up to 4 times). What still fails is classified (`rate_limited`, `overloaded`, `auth`, `bad_request`, …) so an eval run can tell "rerun later" from "bug". Refusals are recorded, not hidden: there's deliberately **no model fallback**, which would quietly mix two models' answers into one model's score.
- **Parallel tool calls.** Every `tool_use` in a turn is answered, in order, in one message. A second `submit_triage` in the same turn is ignored. A call cut off by `max_tokens` isn't run on partial input; the agent is asked to re-issue it.
- **Bad input.** Tool arguments and the verdict are validated with zod. A verdict that cites lines that don't exist, or a top hypothesis with no evidence, comes back as a fixable error. Identical repeat calls reuse the earlier result.
- **Append-only history and caching.** Earlier turns are never edited, so thinking blocks are replayed exactly and the prompt cache prefix stays stable. Each request caches everything sent so far.

## The eval

`npm run eval` runs the agent over all 48 incidents (4 at a time) and scores every verdict against its label in plain code. Scores are exact and two runs differ only because the model did.

| Metric | What it measures |
|---|---|
| **top-1** | The top hypothesis is the labeled root cause. No verdict counts as wrong. |
| **top-1 (lenient)** | The top hypothesis is the root cause *or* a labeled defensible alternative (ambiguous incidents only). |
| **top-3** | The root cause is among the first three hypotheses. |
| **evidence precision / recall** | The top hypothesis's cited lines vs. the labeled evidence lines. Did it cite the right lines, and enough of them? |
| **herring cites** | Planted red-herring lines cited anywhere in the verdict. |
| **ECE / Brier** | Whether top-1 confidence tracks correctness. "Confidently wrong" counts misses at confidence ≥ 0.8. |
| **cost, latency, turns** | Dollars per incident from token usage × list price (cache reads/writes included), p50/p95 wall-clock, tool calls. |
| **outcomes** | submitted / budget exhausted / no verdict / refused / API error. |

Every run writes a directory under [`results/runs/`](results/runs/): `config.json` (model, effort, budget, dataset version, git commit), one JSON per incident with the full trace and its score, `summary.json`, and a `report.md` with breakdowns by difficulty and root cause, a calibration table, a confusion matrix and the list of misses. [`results/README.md`](results/README.md) is the leaderboard across runs.

```bash
npm run eval -- --baseline                        # free: the keyword baseline
npm run eval                                      # Opus 5.5, default effort
npm run eval -- --model claude-haiku-5-5 --effort low --limit 8
npm run eval -- --run-id <id> --resume            # continue an interrupted run
```

**The baseline.** A no-LLM grep picks the root cause whose failure phrases match the most WARN/ERROR lines. Its patterns were written knowing the generator's wording, so it's a deliberately strong floor. It reaches **50% top-1 and 85% top-3**, with 43% evidence precision, and it never finds a bad deploy (deploy lines are INFO). The agent has to beat that clearly to justify its cost.

### First results

| | top-1 | top-3 | evidence P / R | ECE | cost / incident | p50 latency |
|---|---:|---:|---:|---:|---:|---:|
| keyword baseline (no LLM) | 50% | 85% | 43% / 43% | 0.28 | — | — |
| **Opus 5.5** (default effort) | **96%** | **100%** | 64% / 94% | 0.16 | $0.05 | 13s |

What the first run says, and what it means for the next phases:

- **The dataset is close to saturated for Opus 5.5.** 46/48 top-1, 15/16 on hard incidents, every investigation finished in ~4 tool calls with no budget hits. Root-cause accuracy leaves little room for prompt work (Phase 4) to show up. The interesting comparisons are cheaper models (Phase 5) and a harder incident set.
- **Evidence precision is the real headroom.** The agent finds nearly all the evidence (94% recall), but a third of what it cites is downstream symptoms: of 453 lines cited across all top hypotheses, 291 were evidence, 153 symptoms, 9 background noise, and **0 red herrings**. It describes the whole chain where the label wants the cause. That's a prompt-level fix, and a clean target for Phase 4.
- **It's under-confident, not over-confident.** 36 answers at ~0.87 confidence were all right, and none were confidently wrong. The ECE of 0.16 is almost entirely under-confidence.
- **Both misses are the same scenario** (`db-lock-wait`): an idle transaction holding a row lock. The agent named the lock-holder correctly, then called it `resource_exhaustion` with `dependency_timeout` second. That's arguably a defensible reading the label doesn't accept. The label is left as it is: changing labels after seeing the results would be grading to the answer.

## The incident dataset

The eval is only as good as its labels, so incidents are generated by **code, not an LLM**: every log line is emitted with a role (`cause`, `symptom`, `herring`, `noise`), and the label's evidence lines are exactly the `cause` lines. One seed reproduces the whole set.

- **Coverage.** 8 root-cause categories × 2 scenario variants × easy/medium/hard = 48 incidents. Scenarios (a held lock, a hung third party, an OOM crash loop, a full disk, a bad release, a broken API contract, a wrong endpoint, a rotated credential, a poison message, a crash-looping consumer, a half-applied migration, a sequence collision, a retry storm, a cache stampede, a provider 5xx outage, a cloud-storage outage) render onto 5 service topologies, so service names don't predict the answer.
- **A real haystack.** 120–410 lines per incident of healthy traffic and housekeeping, well past one 25-line search page.
- **Red herrings.** Deploys of uninvolved services, slow queries, GC pauses, no-op config reloads, a correctly dead-lettered message… Hard incidents get 3–4, chosen to mimic the categories the real cause is easiest to confuse with, and placed close to onset.
- **Not winnable by heuristic.** Every incident has error-level symptoms that aren't evidence, so "cite every ERROR" loses precision; in about a third, the first ERROR line isn't evidence at all.
- **Honest ambiguity.** Where a careful engineer could defend a second category (a config change shipped in a deploy, a third party that hangs rather than errors), the label lists it in `acceptableCauses` and the explanation says why the primary is better. 10 of the 48 are ambiguous like this.

## Layout

| Path | What |
|---|---|
| [`src/types.ts`](src/types.ts) | Zod schema = single source of truth. Incident, log line, root-cause categories, verdict. TS types are `z.infer`red from it. |
| [`src/tools.ts`](src/tools.ts) | Deterministic log access (`listServices`, `searchLogs`, `getContext`, `correlateTrace`) + `loadIncident`. Pure over the log array. |
| [`src/agent.ts`](src/agent.ts) | The investigation loop (manual agentic loop on the Anthropic SDK): budgets, failure handling, parallel tool calls. Records a full tool-call trace, token usage and how the run ended. |
| [`src/cli.ts`](src/cli.ts) | Triage one incident, print the trace + verdict + a ground-truth check. |
| [`src/generator/`](src/generator/) | Seeded synthetic incident generator: topologies, scenarios per root cause, background noise, red herrings. |
| [`incidents/generated/`](incidents/generated/) | The 48-incident labeled dataset + `manifest.json` (category, difficulty, scenario, size per incident). Committed; regenerated byte-for-byte from the seed. |
| [`incidents/sample-001-…`](incidents/sample-001-payment-timeout.json) | The original hand-built incident. |
| [`scripts/test-tools.ts`](scripts/test-tools.ts) | Unit tests for the deterministic layer — **no API key required**. |
| [`scripts/test-generator.ts`](scripts/test-generator.ts) | Dataset checks: balance, determinism, label consistency, no answer leakage. |
| [`src/eval/`](src/eval/) | Scorer, aggregation, pricing, report rendering, and the no-LLM keyword baseline. |
| [`scripts/eval.ts`](scripts/eval.ts) | Runs a model over the dataset and writes a run directory under [`results/runs/`](results/runs/). |
| [`scripts/test-eval.ts`](scripts/test-eval.ts) | Scorer, calibration and report checks. |
| [`scripts/test-agent.ts`](scripts/test-agent.ts) | The agent loop driven by a scripted fake model — every failure path, **no API key**. |

## Running it

```bash
npm install
```

Run the tests for the tools, the generator, the agent loop and the scorer (no API key needed):

```bash
npm test
```

Regenerate the incident set (deterministic; only needed after changing the generator):

```bash
npm run generate
```

Type-check:

```bash
npm run build
```

Run the agent on the sample incident (needs credentials):

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or `cp .env.example .env` and fill it in
npm run triage                        # defaults to incidents/sample-001-payment-timeout.json
npm run triage -- incidents/generated/gen-023.json
```

Override the model (the eval sweeps this later):

```bash
TRIAGE_MODEL=claude-haiku-5-5 npm run triage
```

Default model is `claude-opus-5-5`. `TRIAGE_EFFORT=low|medium|high|xhigh|max` sets the effort level (unset = the model's default).

## Roadmap

- [x] **Phase 0** — incident schema, deterministic tools, agent loop, one hand-built incident, CLI.
- [x] **Phase 1** — synthetic incident generator (40–60 labeled cases across all root-cause categories, with red herrings and ambiguous/multi-cause incidents so the eval isn't trivially winnable).
- [x] **Phase 2** — harden the loop (budgets, retries, parallel-tool handling).
- [x] **Phase 3** — **eval harness**: scorer (root-cause top-1/top-3, evidence precision/recall, calibration, cost/latency), committed run results.
- [ ] **Phase 4** — iterate prompt + retrieval strategy against the eval; keep the before/after history.
- [ ] **Phase 5** — model matrix (Haiku / Sonnet / Opus): accuracy vs. cost.
- [ ] **Phase 6** — showcase page (metrics, model comparison, recorded demo, the iteration story).
