import express from "express";
import { demoIncident } from "./incidents/incident.js";
import { historicalIncident, MemoryService, createMemoryServiceFromEnv } from "./memory/memory.service.js";
import { AnalysisService, createAnalysisServiceFromEnv, type AnalysisInput, type IncidentAnalysis } from "./llm/analysis.service.js";
import { getMetrics, getResolvedMetrics, type ServiceMetrics } from "./tools/metrics.js";

interface MemoryServicePort {
	retainIncident: (experience: Parameters<MemoryService["retainIncident"]>[0]) => Promise<void>;
	recallIncidents: (incident: Parameters<MemoryService["recallIncidents"]>[0], metrics: ServiceMetrics) => ReturnType<MemoryService["recallIncidents"]>;
	resetDemoMemories: () => Promise<void>;
}

interface AnalysisServicePort {
	analyze: (input: AnalysisInput) => Promise<IncidentAnalysis>;
}

export function createApp(dependencies: { memoryService?: MemoryServicePort; analysisService?: AnalysisServicePort } = {}) {
	let memoryService = dependencies.memoryService;
	let analysisService = dependencies.analysisService;
	let currentIncident = { ...demoIncident, symptoms: [...demoIncident.symptoms] };
	let incidentSequence = 1;
	let lastInvestigation: { incidentId: string; metrics: ServiceMetrics; analysis: IncidentAnalysis } | undefined;
	const app = express();
	app.use(express.json());

	app.get("/api/health", (_request, response) => {
		response.json({ status: "ok" });
	});

	app.get("/api/incidents/active", (_request, response) => {
		response.json(currentIncident);
	});

	app.get("/api/tools/metrics/:service", (request, response) => {
		try {
			response.json(getMetrics(request.params.service));
		} catch (error) {
			response.status(404).json({
				error: error instanceof Error ? error.message : "Metrics unavailable",
			});
		}
	});

	app.post("/api/memory/seed", async (_request, response) => {
		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.retainIncident(historicalIncident);
			response.json({ retained: true, incidentId: historicalIncident.incident.id });
		} catch {
			response.status(503).json({
				error: "Could not store the historical incident in Hindsight. Check the Hindsight URL, service, and API key.",
			});
		}
	});

	app.post("/api/incidents/:id/investigate", async (request, response) => {
		if (request.params.id !== currentIncident.id || currentIncident.status !== "ACTIVE") {
			response.status(404).json({ error: "Incident not found" });
			return;
		}

		try {
			const metrics = getMetrics(currentIncident.service);
			memoryService ??= createMemoryServiceFromEnv();
			const memories = await memoryService.recallIncidents(currentIncident, metrics);
			analysisService ??= createAnalysisServiceFromEnv();
			const analysis = await analysisService.analyze({ incident: currentIncident, metrics, memories });
			lastInvestigation = { incidentId: currentIncident.id, metrics, analysis };
			response.json({
				incident: currentIncident,
				metrics,
				memories,
				analysis,
				status: "HYPOTHESIS",
			});
		} catch {
			response.status(503).json({
				error: "Investigation could not complete. Check the Hindsight service, API key, and Groq model configuration.",
			});
		}
	});

	app.post("/api/incidents/:id/resolve", async (request, response) => {
		if (request.params.id !== currentIncident.id || currentIncident.status !== "ACTIVE") {
			response.status(404).json({ error: "Active incident not found" });
			return;
		}
		if (!lastInvestigation || lastInvestigation.incidentId !== currentIncident.id) {
			response.status(409).json({ error: "Investigate this incident before resolving it" });
			return;
		}

		const resolvedIncident = { ...currentIncident, status: "RESOLVED" as const };
		const afterMetrics = getResolvedMetrics(currentIncident.service);
		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.retainIncident({
				incident: resolvedIncident,
				rootCause: "Redis connection pool exhaustion, confirmed by the simulated resolution",
				resolution: "Increase Redis connection pool size from 50 to 100",
				outcome: `Error rate decreased from ${lastInvestigation.metrics.errorRate}% to ${afterMetrics.errorRate}% after the pool increase`,
				lesson: "For Payment API 503 incidents with high Redis latency and pool saturation, investigate Redis connection pool exhaustion early.",
				evidence: lastInvestigation.metrics,
				investigation: [lastInvestigation.analysis.recommendedNextAction],
			});
			currentIncident = resolvedIncident;
			response.json({ incident: currentIncident, before: lastInvestigation.metrics, after: afterMetrics, retained: true });
		} catch {
			response.status(503).json({
				error: "The simulated resolution is ready, but Hindsight could not retain the outcome. Check the Hindsight service and retry.",
			});
		}
	});

	app.post("/api/incidents/new", (_request, response) => {
		if (currentIncident.status !== "RESOLVED") {
			response.status(409).json({ error: "Resolve the active incident before creating another" });
			return;
		}
		incidentSequence += 1;
		currentIncident = {
			...demoIncident,
			id: `INC-${String(incidentSequence).padStart(3, "0")}`,
			symptoms: [...demoIncident.symptoms],
		};
		lastInvestigation = undefined;
		response.status(201).json(currentIncident);
	});

	app.post("/api/demo/reset", async (_request, response) => {
		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.resetDemoMemories();
			currentIncident = { ...demoIncident, symptoms: [...demoIncident.symptoms] };
			incidentSequence = 1;
			lastInvestigation = undefined;
			response.json({ reset: true, incident: currentIncident });
		} catch {
			response.status(503).json({ error: "Could not reset BugSlayers demo memories in Hindsight" });
		}
	});

	return app;
}