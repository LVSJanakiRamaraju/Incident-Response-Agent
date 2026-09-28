import express from "express";
import { demoIncident } from "./incidents/incident.js";
import { historicalIncident, MemoryService, createMemoryServiceFromEnv } from "./memory/memory.service.js";
import { AnalysisService, createAnalysisServiceFromEnv } from "./llm/analysis.service.js";
import { getMetrics, type ServiceMetrics } from "./tools/metrics.js";

interface MemoryServicePort {
	retainIncident: (experience: Parameters<MemoryService["retainIncident"]>[0]) => Promise<void>;
	recallIncidents: (incident: Parameters<MemoryService["recallIncidents"]>[0], metrics: ServiceMetrics) => ReturnType<MemoryService["recallIncidents"]>;
}

export function createApp(dependencies: { memoryService?: MemoryServicePort } = {}) {
	let memoryService = dependencies.memoryService;
	let analysisService: AnalysisService | undefined;
	const app = express();
	app.use(express.json());

	app.get("/api/health", (_request, response) => {
		response.json({ status: "ok" });
	});

	app.get("/api/incidents/active", (_request, response) => {
		response.json(demoIncident);
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
		if (request.params.id !== demoIncident.id) {
			response.status(404).json({ error: "Incident not found" });
			return;
		}

		try {
			const metrics = getMetrics(demoIncident.service);
			memoryService ??= createMemoryServiceFromEnv();
			const memories = await memoryService.recallIncidents(demoIncident, metrics);
			analysisService ??= createAnalysisServiceFromEnv();
			const analysis = await analysisService.analyze({ incident: demoIncident, metrics, memories });
			response.json({
				incident: demoIncident,
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

	return app;
}