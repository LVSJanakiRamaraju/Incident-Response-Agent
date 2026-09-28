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

export function getResolvedMetrics(service: string): ServiceMetrics {
	if (service !== "payment-api") {
		throw new Error(`Metrics are unavailable for service: ${service}`);
	}

	return {
		service,
		errorRate: 0.3,
		latencyP95: 190,
		redisLatency: 42,
		redisConnectionPoolUsage: 48,
		observedAt: new Date().toISOString(),
	};
}

export function getPartialMetrics(service: string): ServiceMetrics {
	if (service !== "payment-api") {
		throw new Error(`Metrics are unavailable for service: ${service}`);
	}

	return {
		service,
		errorRate: 8.1,
		latencyP95: 510,
		redisLatency: 165,
		redisConnectionPoolUsage: 76,
		observedAt: new Date().toISOString(),
	};
}

