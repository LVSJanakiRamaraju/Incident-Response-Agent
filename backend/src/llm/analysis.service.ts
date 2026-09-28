import Groq from "groq-sdk";
import { Incident } from "../incidents/incident.js";
import { IncidentMemory } from "../memory/memory.service.js";
import { ServiceMetrics } from "../tools/metrics.js";
import { ServiceLogEntry } from "../tools/logs.js";
import { SolutionAttempt } from "../incidents/incident.js";

export interface AnalysisInput {
	incident: Incident;
	metrics: ServiceMetrics;
	logs: ServiceLogEntry[];
	memories: IncidentMemory[];
	memoryMode: "enabled" | "disabled";
	priorSolutionAttempts: SolutionAttempt[];
}

export interface IncidentAnalysis {
	possibleRootCause: string;
	reasoning: string;
	recommendedNextAction: string;
	confidence: "low" | "medium" | "high";
	uncertainty: string;
}

interface ModelPort {
	complete: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export class AnalysisService {
	constructor(private readonly model: ModelPort) {}

	async analyze(input: AnalysisInput): Promise<IncidentAnalysis> {
		const systemPrompt = [
			"You are an incident-response analyst. Produce a cautious, evidence-grounded hypothesis, never a confirmed root cause.",
			"Current metrics and log entries are current tool evidence. Recalled incident memories are historical evidence and must be labeled as such.",
			"Metadata-derived runbooks are previously validated historical procedures, not actions already performed on the current incident.",
			"Review prior solution attempts: do not blindly repeat a failed solution, and treat partial outcomes as evidence that requires further investigation.",
			input.memoryMode === "disabled"
				? "This is a no-memory baseline: Hindsight recall was intentionally skipped. Do not imply that historical experience was checked."
				: "If the historical memory list is empty, say no relevant experience was returned by Hindsight.",
			"Do not invent logs, metrics, tool results, incidents, or resolutions.",
			"Return only a JSON object with string fields possibleRootCause, reasoning, recommendedNextAction, uncertainty, and confidence set to low, medium, or high.",
		].join(" ");
		const userPrompt = JSON.stringify({
			currentIncident: input.incident,
			currentToolEvidence: input.metrics,
			currentLogEvidence: input.logs,
			memoryMode: input.memoryMode,
			priorSolutionAttempts: input.priorSolutionAttempts,
			historicalHindsightMemories: input.memories.map(({ text, type, context, metadata }) => ({ text, type, context, metadata })),
		});
		const raw = await this.model.complete(systemPrompt, userPrompt);
		return parseAnalysis(raw);
	}
}

export function createAnalysisServiceFromEnv(env: NodeJS.ProcessEnv = process.env): AnalysisService {
	const apiKey = env.GROQ_API_KEY?.trim();
	const model = env.GROQ_MODEL?.trim();
	if (!apiKey || !model) {
		throw new Error("GROQ_API_KEY and GROQ_MODEL must be configured");
	}

	const groq = new Groq({ apiKey });
	return new AnalysisService({
		complete: async (systemPrompt, userPrompt) => {
			const completion = await groq.chat.completions.create({
				model,
				temperature: 0.2,
				response_format: { type: "json_object" },
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
			});
			const content = completion.choices[0]?.message.content;
			if (!content) throw new Error("The LLM returned an empty analysis");
			return content;
		},
	});
}

function parseAnalysis(raw: string): IncidentAnalysis {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new Error("The LLM returned invalid JSON");
	}
	if (!value || typeof value !== "object") throw new Error("The LLM analysis must be a JSON object");

	const candidate = value as Record<string, unknown>;
	const confidence = candidate.confidence;
	if (
		typeof candidate.possibleRootCause !== "string" ||
		typeof candidate.reasoning !== "string" ||
		typeof candidate.recommendedNextAction !== "string" ||
		typeof candidate.uncertainty !== "string" ||
		(confidence !== "low" && confidence !== "medium" && confidence !== "high")
	) {
		throw new Error("The LLM analysis does not match the required response shape");
	}
	return {
		possibleRootCause: candidate.possibleRootCause,
		reasoning: candidate.reasoning,
		recommendedNextAction: candidate.recommendedNextAction,
		uncertainty: candidate.uncertainty,
		confidence,
	};
}