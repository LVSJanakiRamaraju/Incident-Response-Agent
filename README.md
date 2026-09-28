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

- Hindsight is the agent's persistent memory for incident experience, diagnoses, resolutions, outcomes, and lessons.
- Application state and agent memory have separate responsibilities; a conventional database will be added only if application state requires one.
- TypeScript/Node.js is the initial backend stack. A frontend is deferred until the memory and investigation workflow is verified.

See [docs/architecture.md](docs/architecture.md) for the initial decision record.