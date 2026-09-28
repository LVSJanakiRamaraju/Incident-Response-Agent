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

**Trade-offs:** A user-facing dashboard will arrive later; early demonstrations may use tests or a small development interface.