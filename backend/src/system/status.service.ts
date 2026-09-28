import Groq from "groq-sdk";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import { getMetrics } from "../tools/metrics.js";

export type ConnectionState = "connected" | "disconnected";

export interface SystemStatus {
	hindsight: ConnectionState;
	llm: ConnectionState;
	metrics: ConnectionState;
	agent: "ready" | "degraded";
}

export interface StatusChecks {
	checkHindsight: () => Promise<void>;
	checkLlm: () => Promise<void>;
}

export async function getSystemStatus(checks: StatusChecks): Promise<SystemStatus> {
	const [hindsight, llm] = await Promise.all([
		checks.checkHindsight().then(() => "connected" as const).catch(() => "disconnected" as const),
		checks.checkLlm().then(() => "connected" as const).catch(() => "disconnected" as const),
	]);
	let metrics: ConnectionState = "connected";
	try {
		getMetrics("payment-api");
	} catch {
		metrics = "disconnected";
	}
	return { hindsight, llm, metrics, agent: hindsight === "connected" && llm === "connected" && metrics === "connected" ? "ready" : "degraded" };
}

export function createStatusChecksFromEnv(env: NodeJS.ProcessEnv = process.env): StatusChecks {
	const baseUrl = env.HINDSIGHT_BASE_URL?.trim() || "http://localhost:8888";
	const apiKey = env.HINDSIGHT_API_KEY?.trim();
	const hindsight = new HindsightClient({ baseUrl, ...(apiKey ? { apiKey } : {}) });
	const groqApiKey = env.GROQ_API_KEY?.trim();
	const groqModel = env.GROQ_MODEL?.trim();
	return {
		checkHindsight: async () => {
			await hindsight.getVersion();
		},
		checkLlm: async () => {
			if (!groqApiKey || !groqModel) throw new Error("Groq is not configured");
			const groq = new Groq({ apiKey: groqApiKey });
			const models = await groq.models.list();
			if (!models.data.some((model) => model.id === groqModel)) throw new Error("Configured Groq model is unavailable");
		},
	};
}