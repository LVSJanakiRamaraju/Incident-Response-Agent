import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../backend/src/app.js";

test("incident and metrics endpoints return the investigation input", async () => {
	const server = createApp().listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const incidentResponse = await fetch(`${baseUrl}/api/incidents/active`);
		const incident = await incidentResponse.json();
		assert.equal(incident.id, "INC-001");
		assert.equal(incident.status, "ACTIVE");

		const metricsResponse = await fetch(`${baseUrl}/api/tools/metrics/payment-api`);
		const metrics = await metricsResponse.json();
		assert.equal(metrics.errorRate, 18.2);
		assert.equal(metrics.redisLatency, 420);
		assert.equal(metrics.redisConnectionPoolUsage, 100);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
});