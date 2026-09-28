# Incident Response Demo

## Preparation

- Start a reachable Hindsight API and configure its own retain LLM provider.
- Set `HINDSIGHT_BASE_URL`, optional `HINDSIGHT_API_KEY`, `HINDSIGHT_BANK_ID`, `GROQ_API_KEY`, and a currently supported JSON-output `GROQ_MODEL` in `.env`.
- Run `npm run dev` and open <http://127.0.0.1:5173>.
- Press **Reset demo** and confirm. This deletes only documents with the `bugslayers-demo-` ID prefix.

## Walkthrough

1. Select **Investigate incident** before seeding. The API retrieves deterministic current Payment API metrics, queries Hindsight, and asks the model to analyze the evidence. Show the empty-memory state and the resulting current-evidence-only analysis.
2. Select **Seed historical incident**. This calls Hindsight retain with the prior 503/Redis incident, root cause, pool change, outcome, and lesson.
3. Select **Investigate again**. Show the recalled experience and how it appears separately from the current metrics and model hypothesis.
4. Select **Resolve & learn**. The prototype simulates the Redis pool change from 50 to 100, shows error rate recovering from 18.2% to 0.3%, and retains the incident evidence and outcome in Hindsight.
5. Select **New incident**, then investigate `INC-002`. Hindsight can now return both the seeded event and the newly retained resolution.

The investigation trace records recall, metrics retrieval, analysis, resolution, and retention. A model conclusion remains labeled as a hypothesis; the simulated engineer resolution is the point where this prototype records the cause and outcome as confirmed.

## Troubleshooting

- A Hindsight error usually means the API URL is unreachable or Cloud authentication is missing. The Hindsight server also needs a working LLM provider to process retain calls.
- A Groq error usually means `GROQ_API_KEY` or `GROQ_MODEL` is missing, the selected model is unavailable, or the provider rejected JSON mode.
- The app deliberately does not substitute local fake memories or analysis when either service fails.