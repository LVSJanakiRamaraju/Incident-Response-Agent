import type { Incident, Investigation, Resolution } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	const body = await response.json() as T & { error?: string };
	if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
	return body;
}

export const api = {
	getIncident: () => request<Incident>("/api/incidents/active"),
	seedMemory: () => request<{ retained: boolean; incidentId: string }>("/api/memory/seed", { method: "POST" }),
	investigate: (id: string) => request<Investigation>(`/api/incidents/${id}/investigate`, { method: "POST" }),
	resolve: (id: string) => request<Resolution>(`/api/incidents/${id}/resolve`, { method: "POST"}),
	newIncident: () => request<Incident>("/api/incidents/new", { method: "POST" }),
	resetDemo: () => request<{ reset: boolean; incident: Incident }>("/api/demo/reset", { method: "POST" }),
};