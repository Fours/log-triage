# log-triage

An LLM agent that investigates production logs and returns a **ranked root-cause triage** — each hypothesis backed by the specific log lines it cites, with a calibrated confidence and a recommended next action. It is built to be **measured**: the point of the project is the eval harness, not the demo.

> Status: **Phase 0** — the agent loop and one hand-built incident run end to end. The eval harness (Phase 3) is the headline deliverable and is next.

## Why this exists

Wiring up an LLM API call is software engineering. Making a non-deterministic system reliable *and proving it* is AI engineering. This project is organized around the parts that show the second thing:

- **Context engineering.** Logs don't fit in a context window. The agent is given the alert and a service-level overview, but **not** the raw logs — it must pull evidence through tools (`search_logs`, `get_context`, `correlate_trace`). It only ever sees what it asks for.
- **Agentic tool use.** It *investigates* in a loop: form a hypothesis, pull more lines, follow a trace across services, revise — then submit a structured verdict. (See the trace printed by the CLI.)
- **A clear LLM / not-LLM boundary.** The model reasons. It does **not** parse timestamps, filter log levels, or correlate trace ids — that is deterministic code in [`src/tools.ts`](src/tools.ts), which is unit-tested with no API key. The model's job is judgment; the plumbing's job is retrieval.
- **Evals (coming in Phase 3).** A labeled incident set and a scorer: root-cause accuracy (top-1 / top-3), evidence precision/recall, confidence calibration, and cost/latency per incident — run across models to compare quality vs. price.

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

## Layout

| Path | What |
|---|---|
| [`src/types.ts`](src/types.ts) | Zod schema = single source of truth. Incident, log line, root-cause categories, verdict. TS types are `z.infer`red from it. |
| [`src/tools.ts`](src/tools.ts) | Deterministic log access (`listServices`, `searchLogs`, `getContext`, `correlateTrace`) + `loadIncident`. Pure over the log array. |
| [`src/agent.ts`](src/agent.ts) | The investigation loop (manual agentic loop on the Anthropic SDK). Records a full tool-call trace and token usage. |
| [`src/cli.ts`](src/cli.ts) | Triage one incident, print the trace + verdict + a ground-truth check. |
| [`incidents/`](incidents/) | Labeled incidents (JSON, validated against the schema). Phase 1 adds a generator. |
| [`scripts/test-tools.ts`](scripts/test-tools.ts) | Unit tests for the deterministic layer — **no API key required**. |

## Running it

```bash
npm install
```

Verify the deterministic layer (no API key needed):

```bash
npm run test:tools
```

Type-check:

```bash
npm run build
```

Run the agent on the sample incident (needs credentials):

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or `cp .env.example .env` and fill it in
npm run triage                        # defaults to incidents/sample-001-payment-timeout.json
npm run triage -- incidents/your-incident.json
```

Override the model (the eval sweeps this later):

```bash
TRIAGE_MODEL=claude-haiku-5-5 npm run triage
```

Default model is `claude-opus-5-5`.

## Roadmap

- [x] **Phase 0** — incident schema, deterministic tools, agent loop, one hand-built incident, CLI.
- [ ] **Phase 1** — synthetic incident generator (40–60 labeled cases across all root-cause categories, with red herrings and ambiguous/multi-cause incidents so the eval isn't trivially winnable).
- [ ] **Phase 2** — harden the loop (budgets, retries, parallel-tool handling).
- [ ] **Phase 3** — **eval harness**: scorer (root-cause top-1/top-3, evidence precision/recall, calibration, cost/latency), committed run results.
- [ ] **Phase 4** — iterate prompt + retrieval strategy against the eval; keep the before/after history.
- [ ] **Phase 5** — model matrix (Haiku / Sonnet / Opus): accuracy vs. cost.
- [ ] **Phase 6** — showcase page (metrics, model comparison, recorded demo, the iteration story).
