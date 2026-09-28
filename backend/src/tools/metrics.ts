export interface ServiceMetrics {
	service: string;
	errorRate: number;
	latencyP95: number;
	redisLatency: number;
	redisConnectionPoolUsage: number;
	observedAt: string;
}

export function getMetrics(service: string): ServiceMetrics {
	if (service !== "payment-api") {
		throw new Error(`Metrics are unavailable for service: ${service}`);
	}

	return {
		service,
		errorRate: 18.2,
		latencyP95: 840,
		redisLatency: 420,
		redisConnectionPoolUsage: 100,
		observedAt: new Date().toISOString(),
	};
}