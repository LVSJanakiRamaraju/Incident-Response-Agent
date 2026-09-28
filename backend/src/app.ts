import express from "express";
import { demoIncident, type SolutionAttempt, type SolutionFeedback } from "./incidents/incident.js";
import { getRunbookRecommendations, historicalIncident, MemoryService, createMemoryServiceFromEnv, type IncidentExperience } from "./memory/memory.service.js";
import { AnalysisService, createAnalysisServiceFromEnv, type AnalysisInput, type IncidentAnalysis } from "./llm/analysis.service.js";
import { getMetrics, getPartialMetrics, getResolvedMetrics, type ServiceMetrics } from "./tools/metrics.js";
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
	let currentMetricsOverride: ServiceMetrics | undefined;
	let solutionAttempts: SolutionAttempt[] = [];
	let pendingSolution: { id: string; recommendation: string; attemptedAt: string; before: ServiceMetrics; expectedAfter: ServiceMetrics } | undefined;
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

		const trace: Array<{ id: string; label: string; detail: string; status: "completed" | "failed" | "skipped"; durationMs: number; occurredAt: string }> = [];
		const memoryMode = request.body?.memoryMode === "disabled" ? "disabled" : "enabled";
		const metricStarted = Date.now();
		let metrics: ServiceMetrics;
		try {
			metrics = currentMetricsOverride ?? getMetrics(currentIncident.service);
			trace.push({ id: "metrics", label: "Metrics tool executed", detail: `getMetrics(\"${currentIncident.service}\")`, status: "completed", durationMs: Date.now() - metricStarted, occurredAt: new Date().toISOString() });
		} catch {
			trace.push({ id: "metrics", label: "Metrics collection failed", detail: "The metrics tool could not return current evidence.", status: "failed", durationMs: Date.now() - metricStarted, occurredAt: new Date().toISOString() });
			response.status(503).json({ code: "METRICS_UNAVAILABLE", dependency: "metrics", error: "The metrics tool could not collect current evidence.", trace });
			return;
		}

		let memories: Awaited<ReturnType<MemoryServicePort["recallIncidents"]>> = [];
		if (memoryMode === "disabled") {
			trace.push({ id: "recall", label: "Hindsight bypassed for baseline", detail: "Memory recall is explicitly disabled for this comparison run.", status: "skipped", durationMs: 0, occurredAt: new Date().toISOString() });
		} else {
			memoryService ??= createMemoryServiceFromEnv();
			const recallStarted = Date.now();
			try {
				memories = await memoryService.recallIncidents(currentIncident, metrics);
			} catch {
				trace.push({ id: "recall", label: "Hindsight memory search failed", detail: "The current incident could not be compared with stored experience.", status: "failed", durationMs: Date.now() - recallStarted, occurredAt: new Date().toISOString() });
				response.status(503).json({ code: "HINDSIGHT_UNAVAILABLE", dependency: "hindsight", error: "Hindsight could not return incident memories. Check its API URL and credentials.", trace });
				return;
			}
			trace.push({ id: "recall", label: memories.length ? "Hindsight memories recalled" : "Hindsight search completed", detail: `${memories.length} memories returned`, status: "completed", durationMs: Date.now() - recallStarted, occurredAt: new Date().toISOString() });
		}

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
			analysis = await analysisService.analyze({ incident: currentIncident, metrics, logs, memories, memoryMode, priorSolutionAttempts: solutionAttempts });
		} catch (error) {
			const unavailableModel = (error as { status?: number }).status === 404;
			trace.push({ id: "analysis", label: "Groq analysis failed", detail: unavailableModel ? "The configured model was not found or is not available to this account." : "The model provider did not complete the analysis request.", status: "failed", durationMs: Date.now() - analysisStarted, occurredAt: new Date().toISOString() });
			response.status(503).json({ code: unavailableModel ? "GROQ_MODEL_UNAVAILABLE" : "GROQ_ANALYSIS_FAILED", dependency: "llm", error: unavailableModel ? "The configured Groq model is unavailable. Set GROQ_MODEL to a model ID enabled for your account." : "Groq analysis failed. Check the API key, model access, and provider status.", trace });
			return;
		}
		trace.push({ id: "analysis", label: "Agent analysis generated", detail: "Current evidence and recalled memories were supplied to the model.", status: "completed", durationMs: Date.now() - analysisStarted, occurredAt: new Date().toISOString() });
		lastInvestigation = { incidentId: currentIncident.id, metrics, analysis };
		const runbooks = getRunbookRecommendations(memories);
		response.json({ incident: currentIncident, metrics, logs, memories, runbooks, analysis, memoryMode, priorSolutionAttempts: solutionAttempts, status: "HYPOTHESIS", trace });
	});

	app.post("/api/incidents/:id/apply-solution", async (request, response) => {
		if (request.params.id !== currentIncident.id || currentIncident.status !== "ACTIVE") {
			response.status(404).json({ error: "Active incident not found" });
			return;
		}
		if (!lastInvestigation || lastInvestigation.incidentId !== currentIncident.id) {
			response.status(409).json({ error: "Investigate this incident before resolving it" });
			return;
		}

		const attemptedAt = new Date().toISOString();
		pendingSolution = {
			id: `SOL-${Date.now()}`,
			recommendation: lastInvestigation.analysis.recommendedNextAction,
			attemptedAt,
			before: currentMetricsOverride ?? lastInvestigation.metrics,
			expectedAfter: getResolvedMetrics(currentIncident.service),
		};
		response.json({
			incident: currentIncident,
			status: "AWAITING_CONFIRMATION",
			solutionId: pendingSolution.id,
			recommendation: pendingSolution.recommendation,
			before: pendingSolution.before,
			expectedAfter: pendingSolution.expectedAfter,
		});
	});

	app.post("/api/incidents/:id/solution-feedback", async (request, response) => {
		if (request.params.id !== currentIncident.id || currentIncident.status !== "ACTIVE" || !pendingSolution) {
			response.status(409).json({ error: "Apply a proposed solution to this active incident before submitting feedback" });
			return;
		}

		const feedback = request.body?.result as SolutionFeedback | undefined;
		if (feedback !== "SUCCESS" && feedback !== "FAILED" && feedback !== "PARTIAL") {
			response.status(400).json({ error: "Solution result must be SUCCESS, FAILED, or PARTIAL" });
			return;
		}

		const attemptedSolution = pendingSolution;
		const attemptedAnalysis = lastInvestigation?.analysis;
		const evidenceAfter = feedback === "SUCCESS"
			? attemptedSolution.expectedAfter
			: feedback === "PARTIAL"
				? getPartialMetrics(currentIncident.service)
				: attemptedSolution.before;
		const attempt: SolutionAttempt = {
			id: attemptedSolution.id,
			recommendation: attemptedSolution.recommendation,
			result: feedback === "SUCCESS" ? "VERIFIED" : feedback,
			attemptedAt: attemptedSolution.attemptedAt,
			feedbackAt: new Date().toISOString(),
			evidenceBefore: attemptedSolution.before,
			evidenceAfter,
			retained: false,
		};
		solutionAttempts.push(attempt);
		pendingSolution = undefined;
		currentMetricsOverride = evidenceAfter;

		if (feedback !== "SUCCESS") {
			lastInvestigation = undefined;
			const feedbackDescription = feedback === "FAILED" ? "The user reported that this solution did not resolve the incident; do not repeat it without new evidence." : "The user reported partial improvement; continue investigating the remaining symptoms.";
			try {
				memoryService ??= createMemoryServiceFromEnv();
				await memoryService.retainIncident({
					incident: currentIncident,
					attemptId: attempt.id,
					verificationStatus: feedback,
					userConfirmed: false,
					rootCause: attemptedAnalysis?.possibleRootCause ?? "Unconfirmed hypothesis",
					resolution: attemptedSolution.recommendation,
					outcome: `${feedbackDescription} Error rate ${attempt.evidenceBefore.errorRate}% to ${attempt.evidenceAfter.errorRate}%.`,
					lesson: feedbackDescription,
					evidence: attempt.evidenceBefore,
					investigation: [attemptedAnalysis?.reasoning ?? "Solution outcome reported by the user."],
					runbook: {
						id: "payment-api-redis-pool-saturation",
						title: "Payment API Redis pool saturation",
						steps: [attemptedSolution.recommendation],
						outcome: feedbackDescription,
					},
				});
				attempt.retained = true;
			} catch {
				attempt.retained = false;
			}
			response.json({ incident: currentIncident, attempt, attempts: solutionAttempts, before: attempt.evidenceBefore, after: attempt.evidenceAfter, retained: attempt.retained, continueInvestigation: true });
			return;
		}

		currentIncident = { ...currentIncident, status: "RESOLVED" };
		const changeSummary = `HTTP 503 rate ${attempt.evidenceBefore.errorRate}% to ${attempt.evidenceAfter.errorRate}%; Redis latency ${attempt.evidenceBefore.redisLatency}ms to ${attempt.evidenceAfter.redisLatency}ms`;
		pendingExperience = {
			incident: currentIncident,
			attemptId: attempt.id,
			verificationStatus: "VERIFIED",
			userConfirmed: true,
			rootCause: lastInvestigation?.analysis.possibleRootCause ?? "User-confirmed incident cause",
			resolution: attemptedSolution.recommendation,
			outcome: `User confirmed the solution resolved the issue. ${changeSummary}`,
			lesson: `For ${currentIncident.service} incidents with HTTP 503 errors and high Redis latency, the user confirmed this solution worked: ${attemptedSolution.recommendation}`,
			evidence: attempt.evidenceBefore,
			investigation: [lastInvestigation?.analysis.reasoning ?? "Current evidence was reviewed before applying this solution."],
			runbook: {
				id: "payment-api-redis-pool-saturation",
				title: "Payment API Redis pool saturation",
				steps: [attemptedSolution.recommendation, "Monitor HTTP 503 rate, Redis latency, and pool utilization after applying the change."],
				outcome: `User-confirmed success. ${changeSummary}`,
			},
		};
		lastInvestigation = undefined;
		experienceRetained = false;
		try {
			memoryService ??= createMemoryServiceFromEnv();
			await memoryService.retainIncident(pendingExperience);
			experienceRetained = true;
			attempt.retained = true;
		} catch {
			response.json({ incident: currentIncident, attempt, attempts: solutionAttempts, before: attempt.evidenceBefore, after: attempt.evidenceAfter, retained: false, retentionError: "The solution is verified, but Hindsight did not retain the experience. Retry memory save." });
			return;
		}
		response.json({ incident: currentIncident, attempt, attempts: solutionAttempts, before: attempt.evidenceBefore, after: attempt.evidenceAfter, retained: true });
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
		currentMetricsOverride = undefined;
		solutionAttempts = [];
		pendingSolution = undefined;
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
			currentMetricsOverride = undefined;
			solutionAttempts = [];
			pendingSolution = undefined;
			pendingExperience = undefined;
			experienceRetained = false;
			response.json({ reset: true, incident: currentIncident });
		} catch {
			response.status(503).json({ error: "Could not reset BugSlayers demo memories in Hindsight" });
		}
	});

	return app;
}