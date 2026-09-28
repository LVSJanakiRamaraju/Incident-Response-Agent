export interface ServiceLogEntry {
	timestamp: string;
	level: "ERROR" | "WARN";
	message: string;
}

export function getRecentLogs(service: string): ServiceLogEntry[] {
	if (service !== "payment-api") {
		throw new Error(`Logs are unavailable for service: ${service}`);
	}

	const observedAt = Date.now();
	return [
		{ timestamp: new Date(observedAt - 4_000).toISOString(), level: "ERROR", message: "Failed to acquire Redis connection from application pool" },
		{ timestamp: new Date(observedAt - 3_000).toISOString(), level: "WARN", message: "Redis connection acquisition exceeded 400ms" },
		{ timestamp: new Date(observedAt - 2_000).toISOString(), level: "ERROR", message: "POST /payments timed out while waiting for Redis connection" },
		{ timestamp: new Date(observedAt - 1_000).toISOString(), level: "ERROR", message: "Upstream request failed with HTTP 503" },
	];
}