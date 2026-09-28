export interface Incident {
	id: string;
	service: string;
	severity: "HIGH";
	description: string;
	symptoms: string[];
	status: "ACTIVE" | "RESOLVED";
}

export interface Metrics {
	service: string;
	errorRate: number;
	latencyP95: number;
	redisLatency: number;
	redisConnectionPoolUsage: number;
	observedAt: string;
}

export interface ServiceLog {
	timestamp: string;
	level: "ERROR" | "WARN";
	message: string;
}

export interface IncidentMemory {
	id: string;
	text: string;
	type: string;
	context: string | null;
}

export interface TraceEvent {
	id: string;
	label: string;
	detail: string;
	status: "completed" | "failed" | "skipped";
	durationMs: number;
	occurredAt: string;
}

export interface SystemStatus {
	hindsight: "connected" | "disconnected";
	llm: "connected" | "disconnected";
	metrics: "connected" | "disconnected";
	agent: "ready" | "degraded";
}

export interface Analysis {
	possibleRootCause: string;
	reasoning: string;
	recommendedNextAction: string;
	confidence: "low" | "medium" | "high";
	uncertainty: string;
}

export interface Investigation {
	incident: Incident;
	metrics: Metrics;
	logs: ServiceLog[];
	memories: IncidentMemory[];
	memoryMode: "enabled" | "disabled";
	analysis: Analysis;
	status: "HYPOTHESIS";
	trace: TraceEvent[];
}

export interface Resolution {
	incident: Incident;
	before: Metrics;
	after: Metrics;
	retained: boolean;
}

export interface LearnResult {
	retained: boolean;
	incidentId: string;
}

export interface ApiFailure {
	error: string;
	code?: string;
	dependency?: "hindsight" | "llm" | "metrics";
	trace?: TraceEvent[];
}