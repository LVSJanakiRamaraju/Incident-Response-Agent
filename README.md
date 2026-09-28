# Incident Response Agent

An incident-response agent designed to learn from resolved incidents using Hindsight by Vectorize. The project is being built incrementally, starting with a verified memory loop before adding reasoning, investigation tools, or a user interface.

## Current status

Phase 0: repository and TypeScript tooling setup. Agent functionality has not been implemented yet.

## Development

Requirements: Node.js 20 or later and npm.

```powershell
npm install
npm run typecheck
npm test
npm run build
```

Copy `.env.example` to `.env` and fill in credentials when the corresponding integrations are implemented. Never commit `.env` or API credentials.

## Architecture direction


See [docs/architecture.md](docs/architecture.md) for the initial decision record.

# BugSlayers Incident Response Agent

A local incident-response prototype that demonstrates how persistent organizational experience changes an investigation. Before Hindsight has a relevant incident, the agent reasons from current evidence alone. After a resolved incident is retained, a later investigation can recall its cause, resolution, and lesson.

## Problem

Production incident knowledge is often fragmented across tickets, runbooks, logs, and engineer memory. During an outage, responders need both current evidence and the team's experience with similar failures.

## Solution

The agent loads a Payment API 503 incident, calls a simulated metrics tool, recalls relevant incident experience from Hindsight, and sends the current incident, tool evidence, and recalled memories to a Groq-hosted model. It returns a structured hypothesis, rationale, next action, confidence, and uncertainty. Resolving the simulated incident retains its evidence and outcome in Hindsight for the next investigation.

## Why Hindsight?

Hindsight is persistent organizational incident memory, not a chat transcript or local JSON fixture. The agent calls `retain` for the seeded and resolved incident experiences, then `recall` with the current service, symptoms, and tool measurements before reasoning. Hindsight memories are rendered separately from current facts, and the model is instructed not to treat historical experience as proof of the current cause.

## How It Works

```text
Incident → getMetrics() → Hindsight recall → Groq analysis
	 → engineer confirms simulated fix → Hindsight retain → next incident recall
```

The demo's historical event records a Payment API 503 outage, Redis latency, 100% pool utilization, confirmed pool exhaustion, a 50-to-100 pool increase, and normalized error rate. The investigation tool provides current deterministic metrics; the LLM does not fabricate them.

## Architecture

- `frontend/`: React and Vite incident dashboard.
- `backend/src/app.ts`: Express API and incident workflow.
- `backend/src/memory/`: Hindsight client boundary and incident experience model.
- `backend/src/tools/`: deterministic metrics tool used by the investigation route.
- `backend/src/llm/`: Groq integration and response validation.
- `tests/`: API, memory, analysis, and end-to-end learning-loop tests.

The demo reset deletes only Hindsight documents whose IDs begin with `bugslayers-demo-`; it does not delete the whole memory bank or unrelated documents.

## Tech Stack

Node.js 20.19+, TypeScript, Express, React, Vite, Hindsight TypeScript client, and Groq SDK.

## Setup

Requirements: Node.js 20.19 or later, npm, and a reachable Hindsight API (self-hosted or Hindsight Cloud).

1. Install dependencies:

	```powershell
	npm install
	```

2. Copy `.env.example` to `.env` and set:

	```dotenv
	HINDSIGHT_BASE_URL=http://localhost:8888
	HINDSIGHT_BANK_ID=bugslayers-incidents
	HINDSIGHT_API_KEY=
	GROQ_API_KEY=
	GROQ_MODEL=
	```

	Set `HINDSIGHT_BASE_URL` to the Hindsight API URL. `HINDSIGHT_API_KEY` is optional for an unauthenticated self-hosted server and should be set for Hindsight Cloud. Choose `GROQ_MODEL` from the models currently available to your Groq account that support JSON-object output. The Hindsight server also needs its own configured LLM provider/model to extract memories during retain; configure that in the Hindsight deployment, not in this agent's Groq request.

3. Start the Hindsight API separately. Follow the [official installation guide](https://hindsight.vectorize.io/developer/installation) or use [Hindsight Cloud](https://ui.hindsight.vectorize.io/). For local self-hosting, configure the Hindsight server's LLM provider and credentials according to its [provider guide](https://hindsight.vectorize.io/developer/models).

4. Start the dashboard and API:

	```powershell
	npm run dev
	```

5. Open <http://127.0.0.1:5173>.

The API listens on port `3001`. Vite proxies `/api` requests to it. Never commit `.env` or API keys.

## Demo Workflow

See [docs/demo.md](docs/demo.md) for the presenter walkthrough. In short: reset the demo, investigate once without memory, seed the historical incident into Hindsight, investigate again, resolve and retain the outcome, then create a follow-up incident and recall the accumulated experience.

## API

- `GET /api/health`
- `GET /api/incidents/active`
- `GET /api/tools/metrics/:service`
- `POST /api/memory/seed`
- `POST /api/incidents/:id/investigate`
- `POST /api/incidents/:id/resolve`
- `POST /api/incidents/:id/learn`
- `POST /api/incidents/new`
- `POST /api/demo/reset`

Resolution applies the simulated recovery; saving experience to Hindsight is a separate `learn` operation. Application incident state is in memory and resets when the API process restarts. Hindsight stores persistent incident experience.

## Validation

```powershell
npm test
npm run typecheck
npx tsc -p tsconfig.frontend.json
npm run build
```

Tests use an injected Hindsight-compatible fake to validate the contract and workflow without API credentials. Run a live retain/recall demo against a configured Hindsight API to verify the deployed service and account credentials.

## Limitations

Metrics and resolution are deterministic simulations, not production observability or infrastructure changes. One demo service and one incident pattern are currently supported. The model identifier is configured per environment because available Groq models can change.