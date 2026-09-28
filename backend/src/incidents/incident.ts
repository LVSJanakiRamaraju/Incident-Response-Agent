export type IncidentStatus = "ACTIVE" | "RESOLVED";

export interface Incident {
	id: string;
	service: string;
	severity: "HIGH";
	description: string;
	symptoms: string[];
	status: IncidentStatus;
}

export const demoIncident: Incident = {
	id: "INC-001",
	service: "payment-api",
	severity: "HIGH",
	description: "Payment API is returning HTTP 503 errors",
	symptoms: [
		"HTTP 503 error rate increased",
		"Redis latency increased",
		"Request failures increased",
	],
	status: "ACTIVE",
};