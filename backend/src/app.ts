import express from "express";
import { demoIncident } from "./incidents/incident.js";
import { getMetrics } from "./tools/metrics.js";

export function createApp() {
	const app = express();
	app.use(express.json());

	app.get("/api/health", (_request, response) => {
		response.json({ status: "ok" });
	});

	app.get("/api/incidents/active", (_request, response) => {
		response.json(demoIncident);
	});

	app.get("/api/tools/metrics/:service", (request, response) => {
		try {
			response.json(getMetrics(request.params.service));
		} catch (error) {
			response.status(404).json({
				error: error instanceof Error ? error.message : "Metrics unavailable",
			});
		}
	});

	return app;
}