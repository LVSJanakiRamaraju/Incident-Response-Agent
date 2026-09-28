import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisService } from "../backend/src/llm/analysis.service.js";
import { demoIncident } from "../backend/src/incidents/incident.js";
import { historicalIncident } from "../backend/src/memory/memory.service.js";
import { getMetrics } from "../backend/src/tools/metrics.js";
import { getRecentLogs } from "../backend/src/tools/logs.js";

test("analysis receives current tool evidence and Hindsight memories as distinct inputs", async () => {
	let prompts = "";
	const service = new AnalysisService({
		complete: async (systemPrompt, userPrompt) => {
			prompts = `${systemPrompt}\n${userPrompt}`;
			return JSON.stringify({
				possibleRootCause: "Redis connection pool exhaustion",
				reasoning: "The current pool is saturated and a prior incident had matching symptoms.",
				recommendedNextAction: "Inspect active Redis pool configuration.",
				confidence: "high",
				uncertainty: "The current cause is not yet confirmed.",
			});
		},
	});
	const analysis = await service.analyze({
		incident: demoIncident,
		metrics: getMetrics("payment-api"),
		logs: getRecentLogs("payment-api"),
		memories: [{ id: "memory-1", text: historicalIncident.lesson, type: "experience", context: "resolved incident" }],
	});

	assert.match(prompts, /redisConnectionPoolUsage/);
	assert.match(prompts, /currentLogEvidence/);
	assert.match(prompts, /Failed to acquire Redis connection/);
	assert.match(prompts, /historicalHindsightMemories/);
	assert.match(prompts, /never a confirmed root cause/);
	assert.equal(analysis.confidence, "high");
	assert.equal(analysis.uncertainty, "The current cause is not yet confirmed.");
});

test("analysis rejects malformed model output", async () => {
	const service = new AnalysisService({ complete: async () => "not-json" });
	await assert.rejects(
		service.analyze({ incident: demoIncident, metrics: getMetrics("payment-api"), logs: getRecentLogs("payment-api"), memories: [] }),
		/The LLM returned invalid JSON/,
	);
});