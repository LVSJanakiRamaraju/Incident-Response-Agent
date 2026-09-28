# Architecture Decisions

## Hindsight owns incident experience memory

**Context:** The agent's value should grow as it learns from resolved incidents. Operational incident state and reusable organizational experience have different lifecycles and purposes.

**Decision:** Use Hindsight as the memory layer for incident knowledge. Keep application state separate and introduce a conventional database only if the application needs durable transactional state.

**Reason:** Recalling prior diagnoses, resolutions, and outcomes should materially change how the agent investigates later incidents. Hindsight is a core dependency of that workflow, not an optional chat-history feature.

**Trade-offs:** The application depends on a separate memory service and must verify its API, credentials, and recall behavior early. This phase records the decision; the integration will be validated in a later phase.

## TypeScript backend first

**Context:** The initial goal is a small, testable incident-memory workflow, not a complete product interface.

**Decision:** Start with Node.js and TypeScript. Defer the frontend until the memory and investigation workflow works end to end.

**Reason:** This keeps early work focused on the Hindsight integration and allows the backend boundaries to be tested independently.

**Trade-offs:** The React/Vite dashboard was deliberately deferred until the API, memory, and analysis workflow could be exercised independently. It is now layered over that backend workflow.

## Hindsight stores incident experience, not app state

**Context:** A repeatable demonstration needs persistent incident experience while its active incident and workflow state can remain simple.

**Decision:** Store structured resolved incident knowledge through the Hindsight TypeScript client. Keep active incident state in the API process for this single-user prototype. Use stable, prototype-prefixed document IDs so reset can delete only this demo's documents.

**Reason:** Recall must materially inform later reasoning, while reset must not erase unrelated memories in a shared bank.

**Trade-offs:** Incident state is lost when the API restarts. Hindsight's API and its own extraction-model configuration must be reachable for live retention and recall.

## Separate current evidence, memory, and hypotheses

**Context:** A plausible prior cause must not be presented as a verified diagnosis for the current incident.

**Decision:** The metrics tool supplies current evidence. Hindsight supplies labeled historical memories. Groq returns only a structured hypothesis, reasoning, recommendation, confidence, and uncertainty. The UI displays these categories separately.

**Reason:** This makes the source of each claim visible and prevents the LLM from being the authority for tool observations or historical facts.

**Trade-offs:** The model must support JSON-object output and is configured using `GROQ_MODEL`. Model output is schema-checked; malformed output fails the investigation rather than being displayed as valid analysis.