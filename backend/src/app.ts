import express from "express";
import { demoIncident } from "./incidents/incident.js";
import { historicalIncident, MemoryService, createMemoryServiceFromEnv, type IncidentExperience } from "./memory/memory.service.js";
import { AnalysisService, createAnalysisServiceFromEnv, type AnalysisInput, type IncidentAnalysis } from "./llm/analysis.service.js";
import { getMetrics, getResolvedMetrics, type ServiceMetrics } from "./tools/metrics.js";
import { getRecentLogs, type ServiceLogEntry } from "./tools/logs.js";
import { createStatusChecksFromEnv, getSystemStatus, type StatusChecks } from "./system/status.service.js";

interface MemoryServicePort {
	retainIncident: (experience: Parameters<MemoryService["retainIncident"]>[0]) => Promise<void>;
	recallIncidents: (incident: Parameters<MemoryService["recallIncidents"]>[0], metrics: ServiceMetrics) => ReturnType<MemoryService["recallIncidents"]>;
	resetDemoMemories: () => Promise<void>;
}

interface AnalysisServicePort {
	analyze: (input: AnalysisInput) => Promise<IncidentAnalysis>;
}

export function createApp(dependencies: { memoryService?: MemoryServicePort; analysisService?: AnalysisServicePort; statusChecks?: StatusChecks } = {}) {
	let memoryService = dependencies.memoryService;
	let analysisService = dependencies.analysisService;
	const statusChecks = dependencies.statusChecks;
	let currentIncident = { ...demoIncident, symptoms: [...demoIncident.symptoms] };
	let incidentSequence = 1;
	let lastInvestigation: { incidentId: string; metrics: ServiceMetrics; analysis: IncidentAnalysis } | undefined;
	let pendingExperience: IncidentExperience | undefined;
	let experienceRetained = false;
	const app = express();
	app.use(express.json());

	app.get("/api/health", (_request, response) => {
		response.json({ status: "ok" });
	});

	app.get("/api/status", async (_request, response) => {
		response.json(await getSystemStatus(statusChecks ?? createStatusChecksFromEnv()));
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

	app.get("/api/tools/logs/:service", (request, response) => {
		try {
			response.json({ service: request.params.service, logs: getRecentLogs(request.params.service), source: "simulated demo tool" });
		} catch (error) {
			response.status(404).json({ error: error instanceof Error ? error.message : "Logs unavailable" });
		}
	});

	app.post("/api/memory/seed", async (_request, response) => {
		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.retainIncident(historicalIncident);
			response.json({ retained: true, incidentId: historicalIncident.incident.id });
		} catch {
			response.status(503).json({ code: "HINDSIGHT_RETAIN_FAILED", dependency: "hindsight", error: "Could not store the historical incident in Hindsight. Check the Hindsight URL, service, and API key." });
		}
	});

	app.post("/api/incidents/:id/investigate", async (request, response) => {
		if (request.params.id !== currentIncident.id || currentIncident.status !== "ACTIVE") {
			response.status(404).json({ error: "Incident not found" });
			return;
		}

		const trace: Array<{ id: string; label: string; detail: string; status: "completed" | "failed"; durationMs: number; occurredAt: string }> = [];
		const metricStarted = Date.now();
		let metrics: ServiceMetrics;
		try {
			metrics = getMetrics(currentIncident.service);
			trace.push({ id: "metrics", label: "Metrics tool executed", detail: `getMetrics(\"${currentIncident.service}\")`, status: "completed", durationMs: Date.now() - metricStarted, occurredAt: new Date().toISOString() });
		} catch {
			trace.push({ id: "metrics", label: "Metrics collection failed", detail: "The metrics tool could not return current evidence.", status: "failed", durationMs: Date.now() - metricStarted, occurredAt: new Date().toISOString() });
			response.status(503).json({ code: "METRICS_UNAVAILABLE", dependency: "metrics", error: "The metrics tool could not collect current evidence.", trace });
			return;
		}

		memoryService ??= createMemoryServiceFromEnv();
		const recallStarted = Date.now();
		let memories;
		try {
			memories = await memoryService.recallIncidents(currentIncident, metrics);
		} catch {
			trace.push({ id: "recall", label: "Hindsight memory search failed", detail: "The current incident could not be compared with stored experience.", status: "failed", durationMs: Date.now() - recallStarted, occurredAt: new Date().toISOString() });
			response.status(503).json({ code: "HINDSIGHT_UNAVAILABLE", dependency: "hindsight", error: "Hindsight could not return incident memories. Check its API URL and credentials.", trace });
			return;
		}
		trace.push({ id: "recall", label: memories.length ? "Hindsight memories recalled" : "Hindsight search completed", detail: `${memories.length} memories returned`, status: "completed", durationMs: Date.now() - recallStarted, occurredAt: new Date().toISOString() });

		const logsStarted = Date.now();
		let logs: ServiceLogEntry[];
		try {
			logs = getRecentLogs(currentIncident.service);
			trace.push({ id: "logs", label: "Recent logs retrieved", detail: `getRecentLogs(\"${currentIncident.service}\") · ${logs.length} entries`, status: "completed", durationMs: Date.now() - logsStarted, occurredAt: new Date().toISOString() });
		} catch {
			trace.push({ id: "logs", label: "Recent log retrieval failed", detail: "The logs tool could not return current evidence.", status: "failed", durationMs: Date.now() - logsStarted, occurredAt: new Date().toISOString() });
			response.status(503).json({ code: "LOGS_UNAVAILABLE", dependency: "metrics", error: "The logs tool could not collect recent service evidence.", trace });
			return;
		}

		analysisService ??= createAnalysisServiceFromEnv();
		const analysisStarted = Date.now();
		let analysis: IncidentAnalysis;
		try {
			analysis = await analysisService.analyze({ incident: currentIncident, metrics, logs, memories });
		} catch (error) {
			const unavailableModel = (error as { status?: number }).status === 404;
			trace.push({ id: "analysis", label: "Groq analysis failed", detail: unavailableModel ? "The configured model was not found or is not available to this account." : "The model provider did not complete the analysis request.", status: "failed", durationMs: Date.now() - analysisStarted, occurredAt: new Date().toISOString() });
			response.status(503).json({ code: unavailableModel ? "GROQ_MODEL_UNAVAILABLE" : "GROQ_ANALYSIS_FAILED", dependency: "llm", error: unavailableModel ? "The configured Groq model is unavailable. Set GROQ_MODEL to a model ID enabled for your account." : "Groq analysis failed. Check the API key, model access, and provider status.", trace });
			return;
		}
		trace.push({ id: "analysis", label: "Agent analysis generated", detail: "Current evidence and recalled memories were supplied to the model.", status: "completed", durationMs: Date.now() - analysisStarted, occurredAt: new Date().toISOString() });
		lastInvestigation = { incidentId: currentIncident.id, metrics, analysis };
		response.json({ incident: currentIncident, metrics, logs, memories, analysis, status: "HYPOTHESIS", trace });
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
		pendingExperience = {
			incident: resolvedIncident,
			rootCause: "Redis connection pool exhaustion, confirmed by the simulated resolution",
			resolution: "Increase Redis connection pool size from 50 to 100",
			outcome: `Error rate decreased from ${lastInvestigation.metrics.errorRate}% to ${afterMetrics.errorRate}% after the pool increase`,
			lesson: "For Payment API 503 incidents with high Redis latency and pool saturation, investigate Redis connection pool exhaustion early.",
			evidence: lastInvestigation.metrics,
			investigation: [lastInvestigation.analysis.recommendedNextAction],
		};
		currentIncident = resolvedIncident;
		experienceRetained = false;
		response.json({ incident: currentIncident, before: lastInvestigation.metrics, after: afterMetrics, retained: false });
	});

	app.post("/api/incidents/:id/learn", async (request, response) => {
		if (request.params.id !== currentIncident.id || currentIncident.status !== "RESOLVED" || !pendingExperience) {
			response.status(409).json({ error: "Resolve the active incident before saving its experience" });
			return;
		}
		if (experienceRetained) {
			response.json({ retained: true, incidentId: currentIncident.id });
			return;
		}

		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.retainIncident(pendingExperience);
			experienceRetained = true;
			response.json({ retained: true, incidentId: currentIncident.id });
		} catch {
			response.status(503).json({ code: "HINDSIGHT_RETAIN_FAILED", dependency: "hindsight", error: "The incident is resolved, but Hindsight could not retain the experience. Retry saving it." });
		}
	});

	app.post("/api/incidents/new", (_request, response) => {
		if (currentIncident.status !== "RESOLVED" || !experienceRetained) {
			response.status(409).json({ error: "Resolve the incident and save its experience before creating another" });
			return;
		}
		incidentSequence += 1;
		currentIncident = {
			...demoIncident,
			id: `INC-${String(incidentSequence).padStart(3, "0")}`,
			symptoms: [...demoIncident.symptoms],
		};
		lastInvestigation = undefined;
		pendingExperience = undefined;
		experienceRetained = false;
		response.status(201).json(currentIncident);
	});

	app.post("/api/demo/reset", async (_request, response) => {
		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.resetDemoMemories();
			currentIncident = { ...demoIncident, symptoms: [...demoIncident.symptoms] };
			incidentSequence = 1;
			lastInvestigation = undefined;
			pendingExperience = undefined;
			experienceRetained = false;
			response.json({ reset: true, incident: currentIncident });
		} catch {
			response.status(503).json({ error: "Could not reset BugSlayers demo memories in Hindsight" });
		}
	});

	return app;
}