import type { ApiFailure, Incident, Investigation, LearnResult, Resolution, SystemStatus } from "./types";

export class ApiError extends Error {
	constructor(readonly failure: ApiFailure) {
		super(failure.error);
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	const body = await response.json() as T & ApiFailure;
	if (!response.ok) throw new ApiError({ error: body.error ?? `Request failed (${response.status})`, code: body.code, dependency: body.dependency, trace: body.trace });
	return body;
}

export const api = {
	getSystemStatus: () => request<SystemStatus>("/api/status"),
	getIncident: () => request<Incident>("/api/incidents/active"),
	seedMemory: () => request<{ retained: boolean; incidentId: string }>("/api/memory/seed", { method: "POST" }),
	investigate: (id: string, options?: { memoryMode?: "enabled" | "disabled" }) => request<Investigation>(`/api/incidents/${id}/investigate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(options ?? {}),
	}),
	resolve: (id: string) => request<Resolution>(`/api/incidents/${id}/resolve`, { method: "POST" }),
	learn: (id: string) => request<LearnResult>(`/api/incidents/${id}/learn`, { method: "POST" }),
	newIncident: () => request<Incident>("/api/incidents/new", { method: "POST" }),
	resetDemo: () => request<{ reset: boolean; incident: Incident }>("/api/demo/reset", { method: "POST" }),
};