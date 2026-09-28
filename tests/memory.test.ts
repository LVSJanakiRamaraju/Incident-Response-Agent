import assert from "node:assert/strict";
import test from "node:test";
import { historicalIncident, MemoryService } from "../backend/src/memory/memory.service.js";
import { demoIncident } from "../backend/src/incidents/incident.js";
import { getMetrics } from "../backend/src/tools/metrics.js";

test("retains structured incident experience through the Hindsight client contract", async () => {
	const calls: Array<{ bankId: string; content: string; options?: { context?: string; documentId?: string } }> = [];
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
			return { results: [{ id: "fact-1", text: "Redis pool exhaustion caused 503s", type: "experience", context: "resolved production incident experience" }] };
		},
	}, "bugslayers-incidents");

	const memories = await memory.recallIncidents(demoIncident, getMetrics("payment-api"));

	assert.match(query, /payment-api/);
	assert.match(query, /Redis latency 420ms/);
	assert.equal(selectedBudget, "mid");
	assert.deepEqual(memories, [{ id: "fact-1", text: "Redis pool exhaustion caused 503s", type: "experience", context: "resolved production incident experience" }]);
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