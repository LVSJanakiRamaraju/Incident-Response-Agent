import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../backend/src/app.js";

test("incident and metrics endpoints return the investigation input", async () => {
	const server = createApp().listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const incidentResponse = await fetch(`${baseUrl}/api/incidents/active`);
		const incident = await incidentResponse.json();
		assert.equal(incident.id, "INC-001");
		assert.equal(incident.status, "ACTIVE");

		const metricsResponse = await fetch(`${baseUrl}/api/tools/metrics/payment-api`);
		const metrics = await metricsResponse.json();
		assert.equal(metrics.errorRate, 18.2);
		assert.equal(metrics.redisLatency, 420);
		assert.equal(metrics.redisConnectionPoolUsage, 100);

		const statusResponse = await fetch(`${baseUrl}/api/status`);
		const status = await statusResponse.json();
		assert.deepEqual(status, { hindsight: "disconnected", llm: "disconnected", metrics: "connected", agent: "degraded" });
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
});

test("incident learning workflow recalls memory before and after resolution", async () => {
	const retained: string[] = [];
	const analysisInputs: Array<{ memories: Array<{ text: string }>; metrics: { redisConnectionPoolUsage: number } }> = [];
	const server = createApp({
		memoryService: {
			retainIncident: async (experience) => { retained.push(experience.incident.id); },
			recallIncidents: async () => retained.map((id) => ({
				id,
				text: id === "HIST-001" ? "Redis connection pool exhaustion caused Payment API 503 errors" : "Resolved recurring Payment API incident by increasing the Redis pool",
				type: "experience",
				context: "resolved production incident experience",
			})),
			resetDemoMemories: async () => { retained.length = 0; },
		},
		analysisService: {
			analyze: async (input) => {
				analysisInputs.push(input);
				return {
					possibleRootCause: "Redis connection pool exhaustion",
					reasoning: "Current pool usage is saturated.",
					recommendedNextAction: "Increase the Redis pool.",
					confidence: "high",
					uncertainty: "Confirmed only by the simulated resolution.",
				};
			},
		},
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const investigate = (id: string) => fetch(`${baseUrl}/api/incidents/${id}/investigate`, { method: "POST" });
		const first = await (await investigate("INC-001")).json();
		assert.deepEqual(first.memories, []);
		assert.equal(first.metrics.redisConnectionPoolUsage, 100);

		await fetch(`${baseUrl}/api/memory/seed`, { method: "POST" });
		const afterSeed = await (await investigate("INC-001")).json();
		assert.equal(afterSeed.memories.length, 1);
		assert.match(afterSeed.memories[0].text, /Redis connection pool exhaustion/);
		assert.equal(analysisInputs[1].metrics.redisConnectionPoolUsage, 100);
		assert.deepEqual(afterSeed.trace.map((event: { id: string }) => event.id), ["metrics", "recall", "analysis"]);
		assert.equal(afterSeed.trace.every((event: { status: string; durationMs: number }) => event.status === "completed" && event.durationMs >= 0), true);

		const resolutionResponse = await fetch(`${baseUrl}/api/incidents/INC-001/resolve`, { method: "POST" });
		const resolution = await resolutionResponse.json();
		assert.equal(resolution.retained, false);
		assert.equal(resolution.after.errorRate, 0.3);
		assert.deepEqual(retained, ["HIST-001"]);

		const learnResponse = await fetch(`${baseUrl}/api/incidents/INC-001/learn`, { method: "POST" });
		assert.equal(learnResponse.status, 200);
		assert.equal((await learnResponse.json()).retained, true);
		assert.deepEqual(retained, ["HIST-001", "INC-001"]);

		const nextIncident = await (await fetch(`${baseUrl}/api/incidents/new`, { method: "POST" })).json();
		assert.equal(nextIncident.id, "INC-002");
		const nextInvestigation = await (await investigate("INC-002")).json();
		assert.equal(nextInvestigation.memories.length, 2);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
});

test("investigation failures identify the failing provider and preserve completed activity", async () => {
	const server = createApp({
		memoryService: {
			retainIncident: async () => {},
			recallIncidents: async () => [],
			resetDemoMemories: async () => {},
		},
		analysisService: {
			analyze: async () => { throw Object.assign(new Error("model not found"), { status: 404 }); },
		},
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");

	try {
		const response = await fetch(`http://127.0.0.1:${address.port}/api/incidents/INC-001/investigate`, { method: "POST" });
		const body = await response.json();
		assert.equal(response.status, 503);
		assert.equal(body.code, "GROQ_MODEL_UNAVAILABLE");
		assert.equal(body.dependency, "llm");
		assert.deepEqual(body.trace.map((event: { status: string }) => event.status), ["completed", "completed", "failed"]);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
});

test("historical seed failures identify Hindsight as the failed dependency", async () => {
	const server = createApp({
		memoryService: {
			retainIncident: async () => { throw new Error("offline"); },
			recallIncidents: async () => [],
			resetDemoMemories: async () => {},
		},
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");

	try {
		const response = await fetch(`http://127.0.0.1:${address.port}/api/memory/seed`, { method: "POST" });
		const body = await response.json();
		assert.equal(response.status, 503);
		assert.equal(body.code, "HINDSIGHT_RETAIN_FAILED");
		assert.equal(body.dependency, "hindsight");
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
});