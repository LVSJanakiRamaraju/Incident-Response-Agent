import assert from "node:assert/strict";
import test from "node:test";
import { getRunbookRecommendations, historicalIncident, MemoryService } from "../backend/src/memory/memory.service.js";
import { demoIncident } from "../backend/src/incidents/incident.js";
import { getMetrics } from "../backend/src/tools/metrics.js";

test("retains structured incident experience through the Hindsight client contract", async () => {
	const calls: Array<{ bankId: string; content: string; options?: { context?: string; documentId?: string; metadata?: Record<string, string> } }> = [];
	const deleted: string[] = [];
	const memory = new MemoryService({
		getVersion: async () => ({}),
		createBank: async () => ({}),
		retain: async (bankId, content, options) => { calls.push({ bankId, content, options }); return {}; },
		listDocuments: async () => ({ items: [{ id: "bugslayers-demo-HIST-001" }, { id: "other-team-document" }], total: 2 }),
		deleteDocument: async (_bankId, documentId) => { deleted.push(documentId); },
		recall: async () => ({ results: [] }),
	}, "bugslayers-incidents");

	await memory.retainIncident(historicalIncident);

	assert.equal(calls.length, 1);
	assert.equal(calls[0].options?.documentId, "bugslayers-demo-HIST-001");
	assert.match(calls[0].content, /Redis connection pool exhaustion/);
	assert.match(calls[0].content, /Increase Redis connection pool size from 50 to 100/);
	assert.match(calls[0].content, /Lesson learned:/);
	assert.match(calls[0].content, /Validated runbook: Payment API Redis pool saturation/);
	assert.equal(calls[0].options?.metadata?.runbookStatus, "verified");
	assert.equal(calls[0].options?.metadata?.runbookId, "payment-redis-pool-saturation");
});

test("builds an incident-specific recall query and maps documented result fields", async () => {
	let query = "";
	let selectedBudget: string | undefined;
	const memory = new MemoryService({
		getVersion: async () => ({}),
		createBank: async () => ({}),
		retain: async () => ({}),
		listDocuments: async () => ({ items: [], total: 0 }),
		deleteDocument: async () => {},
			recall: async (_bankId, requestedQuery, options) => {
			query = requestedQuery;
			selectedBudget = options?.budget;
			return { results: [{ id: "fact-1", text: "Redis pool exhaustion caused 503s", type: "experience", context: "resolved production incident experience", metadata: { incidentId: "HIST-001", runbookId: "payment-redis-pool-saturation", runbookTitle: "Payment API Redis pool saturation", runbookSteps: JSON.stringify(["Check pool usage"]), runbookOutcome: "Error rate normalized", runbookStatus: "validated" } }] };
		},
	}, "bugslayers-incidents");

	const memories = await memory.recallIncidents(demoIncident, getMetrics("payment-api"));

	assert.match(query, /payment-api/);
	assert.match(query, /Redis latency 420ms/);
	assert.equal(selectedBudget, "mid");
	assert.equal(memories[0].metadata?.runbookStatus, "validated");
	assert.deepEqual(getRunbookRecommendations(memories), [{ id: "payment-redis-pool-saturation", title: "Payment API Redis pool saturation", steps: ["Check pool usage"], outcome: "Error rate normalized", sourceIncidentIds: ["HIST-001"] }]);
});

test("runbook recommendations deduplicate recalled facts by runbook and retain proven incident ids", () => {
	const recommendations = getRunbookRecommendations([
		{ id: "fact-1", text: "Runbook learned from first incident", type: "world", context: null, metadata: { incidentId: "HIST-001", runbookId: "redis-pool", runbookTitle: "Redis pool saturation", runbookSteps: '["Check pool usage"]', runbookOutcome: "503 rate normalized", runbookStatus: "validated" } },
		{ id: "fact-2", text: "Same runbook learned again", type: "observation", context: null, metadata: { incidentId: "INC-008", runbookId: "redis-pool", runbookTitle: "Redis pool saturation", runbookSteps: '["Check pool usage"]', runbookOutcome: "Latency returned to normal", runbookStatus: "validated" } },
		{ id: "fact-3", text: "Unverified note", type: "world", context: null, metadata: { runbookId: "unverified", runbookTitle: "Unverified", runbookSteps: "[]", runbookOutcome: "Unknown", runbookStatus: "proposed" } },
	]);

	assert.equal(recommendations.length, 1);
	assert.deepEqual(recommendations[0].sourceIncidentIds, ["HIST-001", "INC-008"]);
});

test("demo reset deletes only documents owned by this prototype", async () => {
	const deleted: string[] = [];
	const memory = new MemoryService({
		getVersion: async () => ({}),
		createBank: async () => ({}),
		retain: async () => ({}),
		listDocuments: async () => ({ items: [{ id: "bugslayers-demo-HIST-001" }, { id: "shared-team-incident" }], total: 2 }),
		deleteDocument: async (_bankId, documentId) => { deleted.push(documentId); },
		recall: async () => ({ results: [] }),
	}, "bugslayers-incidents");

	await memory.resetDemoMemories();

	assert.deepEqual(deleted, ["bugslayers-demo-HIST-001"]);
});