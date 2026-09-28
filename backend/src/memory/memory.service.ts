import { HindsightClient } from "@vectorize-io/hindsight-client";
import { Incident } from "../incidents/incident.js";
import { ServiceMetrics } from "../tools/metrics.js";

export interface IncidentExperience {
	incident: Incident;
	rootCause: string;
	resolution: string;
	outcome: string;
	lesson: string;
	evidence?: ServiceMetrics;
	investigation?: string[];
	runbook?: ValidatedRunbook;
}

export interface ValidatedRunbook {
	id: string;
	title: string;
	steps: string[];
	outcome: string;
}

export interface IncidentMemory {
	id: string;
	text: string;
	type: string;
	context: string | null;
	metadata?: Record<string, string> | null;
}

export interface RunbookRecommendation extends ValidatedRunbook {
	sourceIncidentIds: string[];
}

interface HindsightPort {
	getVersion: () => Promise<unknown>;
	createBank: (bankId: string, options?: { name?: string; reflectMission?: string; retainMission?: string }) => Promise<unknown>;
	retain: (bankId: string, content: string, options?: { context?: string; metadata?: Record<string, string>; documentId?: string }) => Promise<unknown>;
	listDocuments: (bankId: string, options?: { limit?: number; offset?: number }) => Promise<{ items: Array<{ id: string }>; total: number }>;
	deleteDocument: (bankId: string, documentId: string) => Promise<void>;
		recall: (bankId: string, query: string, options?: { budget?: "low" | "mid" | "high"; maxTokens?: number }) => Promise<{
		results: Array<{ id: string; text: string; type?: string | null; context?: string | null; metadata?: Record<string, string> | null }>;
	}>;
}

export const historicalIncident: IncidentExperience = {
	incident: {
		id: "HIST-001",
		service: "payment-api",
		severity: "HIGH",
		description: "Payment API outage with elevated HTTP 503 responses",
		symptoms: ["HTTP 503 errors", "High Redis latency", "Connection pool utilization reached 100%"],
		status: "RESOLVED",
	},
	rootCause: "Redis connection pool exhaustion",
	resolution: "Increase Redis connection pool size from 50 to 100",
	outcome: "Error rate returned to normal",
	lesson: "For Payment API 503 incidents with high Redis latency and pool saturation, investigate Redis connection pool exhaustion early.",
	runbook: {
		id: "payment-redis-pool-saturation",
		title: "Payment API Redis pool saturation",
		steps: [
			"Verify Redis is reachable.",
			"Check application Redis connection-pool utilization.",
			"If the pool is saturated, increase its configured size in a controlled change.",
			"Monitor HTTP 503 rate and Redis connection-acquisition latency after the change.",
		],
		outcome: "Validated in this incident: the 50-to-100 pool increase returned the error rate to normal.",
	},
	evidence: {
		service: "payment-api",
		errorRate: 18.2,
		latencyP95: 840,
		redisLatency: 420,
		redisConnectionPoolUsage: 100,
		observedAt: "Historical incident evidence",
	},
	investigation: ["Confirmed Redis was reachable", "Found application connection pool utilization at 100%"],
};

export class MemoryService {
	private bankReady?: Promise<void>;

	constructor(
		private readonly client: HindsightPort,
		private readonly bankId: string,
	) {}

	async checkConnection(): Promise<void> {
		await this.client.getVersion();
	}

	async retainIncident(experience: IncidentExperience): Promise<void> {
		await this.ensureBank();
		const content = [
			`Incident: ${experience.incident.description}`,
			`Incident ID: ${experience.incident.id}`,
			`Service: ${experience.incident.service}`,
			`Severity: ${experience.incident.severity}`,
			`Symptoms: ${experience.incident.symptoms.join("; ")}`,
			experience.evidence ? `Observed evidence: ${formatMetrics(experience.evidence)}` : "",
			experience.investigation?.length ? `Investigation: ${experience.investigation.join("; ")}` : "",
			`Root cause: ${experience.rootCause}`,
			`Resolution: ${experience.resolution}`,
			`Outcome: ${experience.outcome}`,
			`Lesson learned: ${experience.lesson}`,
			experience.runbook ? `Validated runbook: ${experience.runbook.title}` : "",
			experience.runbook ? `Runbook steps: ${experience.runbook.steps.join("; ")}` : "",
			experience.runbook ? `Runbook outcome: ${experience.runbook.outcome}` : "",
		].filter(Boolean).join("\n");

		await this.client.retain(this.bankId, content, {
			context: "resolved production incident experience",
			documentId: `bugslayers-demo-${experience.incident.id}`,
			metadata: {
				incidentId: experience.incident.id,
				service: experience.incident.service,
				...(experience.runbook ? {
					runbookId: experience.runbook.id,
					runbookTitle: experience.runbook.title,
					runbookSteps: JSON.stringify(experience.runbook.steps),
					runbookOutcome: experience.runbook.outcome,
					runbookStatus: "validated",
				} : {}),
			},
		});
	}

	async resetDemoMemories(): Promise<void> {
		await this.ensureBank();
		const documents = await this.client.listDocuments(this.bankId, { limit: 100 });
		const demoDocuments = documents.items.filter(({ id }) => id.startsWith("bugslayers-demo-"));
		await Promise.all(demoDocuments.map(({ id }) => this.client.deleteDocument(this.bankId, id)));
	}

	async recallIncidents(incident: Incident, metrics: ServiceMetrics): Promise<IncidentMemory[]> {
		await this.ensureBank();
		const query = [
			`Service: ${incident.service}`,
			`Incident: ${incident.description}`,
			`Symptoms: ${incident.symptoms.join("; ")}`,
			`Current evidence: ${formatMetrics(metrics)}`,
		].join("\n");
		const response = await this.client.recall(this.bankId, query, { budget: "mid", maxTokens: 1800 });
		return response.results.slice(0, 6).map(({ id, text, type, context, metadata }) => ({ id, text, type: type ?? "unknown", context: context ?? null, metadata: metadata ?? null }));
	}

	private ensureBank(): Promise<void> {
		this.bankReady ??= this.client.createBank(this.bankId, {
			name: "BugSlayers Incident Memory",
			reflectMission: "Remember verified production incident experience, including evidence, root causes, resolutions, outcomes, and lessons. Treat recalled experience as historical context, never as proof about a current incident.",
			retainMission: "Extract incident symptoms, services, evidence, confirmed causes, investigation steps, resolutions, outcomes, and reusable lessons. Preserve uncertainty and distinguish hypotheses from confirmed findings.",
		}).then(() => undefined).catch((error: unknown) => {
			this.bankReady = undefined;
			throw error;
		});
		return this.bankReady;
	}
}

export function createMemoryServiceFromEnv(env: NodeJS.ProcessEnv = process.env): MemoryService {
	const baseUrl = env.HINDSIGHT_BASE_URL?.trim() || "http://localhost:8888";
	const bankId = env.HINDSIGHT_BANK_ID?.trim() || "bugslayers-incidents";
	const apiKey = env.HINDSIGHT_API_KEY?.trim();
	const client = new HindsightClient({ baseUrl, ...(apiKey ? { apiKey } : {}) });
	return new MemoryService(client, bankId);
}

function formatMetrics(metrics: ServiceMetrics): string {
	return [
		`error rate ${metrics.errorRate}%`,
		`p95 latency ${metrics.latencyP95}ms`,
		`Redis latency ${metrics.redisLatency}ms`,
		`Redis connection pool usage ${metrics.redisConnectionPoolUsage}%`,
	].join(", ");
}

export function getRunbookRecommendations(memories: IncidentMemory[]): RunbookRecommendation[] {
	const recommendations = new Map<string, RunbookRecommendation>();
	for (const memory of memories) {
		const metadata = memory.metadata;
		if (!metadata || metadata.runbookStatus !== "validated" || !metadata.runbookId || !metadata.runbookTitle || !metadata.runbookSteps || !metadata.runbookOutcome) continue;
		let steps: unknown;
		try {
			steps = JSON.parse(metadata.runbookSteps);
		} catch {
			continue;
		}
		if (!Array.isArray(steps) || !steps.every((step) => typeof step === "string")) continue;
		const existing = recommendations.get(metadata.runbookId);
		if (existing) {
			if (metadata.incidentId && !existing.sourceIncidentIds.includes(metadata.incidentId)) existing.sourceIncidentIds.push(metadata.incidentId);
			continue;
		}
		recommendations.set(metadata.runbookId, {
			id: metadata.runbookId,
			title: metadata.runbookTitle,
			steps,
			outcome: metadata.runbookOutcome,
			sourceIncidentIds: metadata.incidentId ? [metadata.incidentId] : [],
		});
	}
	return [...recommendations.values()];
}