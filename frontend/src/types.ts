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

export interface IncidentMemory {
	id: string;
	text: string;
	type: string;
	context: string | null;
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
	memories: IncidentMemory[];
	analysis: Analysis;
	status: "HYPOTHESIS";
}

export interface Resolution {
	incident: Incident;
	before: Metrics;
	after: Metrics;
	retained: boolean;
}