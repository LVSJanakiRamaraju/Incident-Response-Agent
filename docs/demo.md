# Incident Response Demo

## Preparation

- Start a reachable Hindsight API and configure its own retain LLM provider.
- Set `HINDSIGHT_BASE_URL`, optional `HINDSIGHT_API_KEY`, `HINDSIGHT_BANK_ID`, `GROQ_API_KEY`, and a currently supported JSON-output `GROQ_MODEL` in `.env`.
- Run `npm run dev` and open <http://127.0.0.1:5173>.
- Press **Reset demo** and confirm. This deletes only documents with the `bugslayers-demo-` ID prefix.

## Walkthrough

1. Select **Run memory demo**. First, the API runs an investigation with `memoryMode: disabled`, explicitly skips Hindsight, calls metrics and logs, and generates a baseline analysis.
2. The same action retains the historical 503/Redis incident in Hindsight, then reruns with recall enabled. Compare the two real model outputs and the facts Hindsight returned.
3. Select **Apply simulated fix**. The prototype simulates the Redis pool change from 50 to 100 and shows error rate recovering from 18.2% to 0.3%.
4. Review the learning panel and select **Save experience to Hindsight**. This separately retains incident evidence and outcome.
5. Select **Create follow-up incident**, then investigate `INC-002`. Hindsight can now return both the seeded event and the newly retained resolution.

The investigation trace records metrics retrieval, Hindsight recall, recent-log retrieval, and analysis. The tool panel shows the returned log entries as demo data. A model conclusion remains labeled as a hypothesis; the simulated engineer resolution is the point where this prototype records the cause and outcome as confirmed.

## Troubleshooting

- A Hindsight error usually means the API URL is unreachable or Cloud authentication is missing. The Hindsight server also needs a working LLM provider to process retain calls.
- A Groq error usually means `GROQ_API_KEY` or `GROQ_MODEL` is missing, the selected model is unavailable, or the provider rejected JSON mode.
- The app deliberately does not substitute local fake memories or analysis when either service fails.