import { useEffect, useState } from "react";
import {
	Activity,
	AlertTriangle,
	ArrowRight,
	Check,
	ChevronRight,
	CircleDot,
	Database,
	Gauge,
	LoaderCircle,
	RotateCcw,
	Search,
	Server,
	ShieldCheck,
	Sparkles,
	Wrench,
} from "lucide-react";
import { api } from "./api";
import type { Incident, Investigation, Resolution } from "./types";

interface WorkflowEvent {
	label: string;
	status: "done" | "current";
	detail: string;
}

export function App() {
	const [incident, setIncident] = useState<Incident>();
	const [investigation, setInvestigation] = useState<Investigation>();
	const [resolution, setResolution] = useState<Resolution>();
	const [events, setEvents] = useState<WorkflowEvent[]>([]);
	const [busy, setBusy] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const [error, setError] = useState<string>();

	useEffect(() => {
		api.getIncident().then((current) => {
			setIncident(current);
			setEvents([{ label: "Incident received", status: "done", detail: current.id }]);
		}).catch((requestError: unknown) => setError(getErrorMessage(requestError)));
	}, []);

	async function perform<T>(name: string, action: () => Promise<T>, onSuccess: (result: T) => void) {
		setBusy(name);
		setError(undefined);
		setNotice(undefined);
		try {
			onSuccess(await action());
		} catch (requestError) {
			setError(getErrorMessage(requestError));
		} finally {
			setBusy(undefined);
		}
	}

	function teachMemory() {
		void perform("seed", api.seedMemory, ({ incidentId }) => {
			setNotice("Historical incident retained in Hindsight.");
			setEvents((current) => [...current, { label: "Experience retained", status: "done", detail: incidentId }]);
		});
	}

	function investigate() {
		if (!incident) return;
		void perform("investigate", () => api.investigate(incident.id), (result) => {
			setInvestigation(result);
			setResolution(undefined);
			setEvents([
				{ label: "Incident received", status: "done", detail: result.incident.id },
				{ label: "Hindsight recall", status: "done", detail: `${result.memories.length} memories returned` },
				{ label: "Metrics tool", status: "done", detail: "payment-api current snapshot" },
				{ label: "Analysis generated", status: "current", detail: "Hypothesis, not confirmation" },
			]);
			setNotice(result.memories.length ? "Historical experience added to this investigation." : "No relevant experience returned; this analysis used current evidence only.");
		});
	}

	function resolveIncident() {
		if (!incident) return;
		void perform("resolve", () => api.resolve(incident.id), (result) => {
			setIncident(result.incident);
			setResolution(result);
			setEvents((current) => [
				...current.filter((event) => event.label !== "Experience retained"),
				{ label: "Incident resolved", status: "done", detail: `503 rate ${result.before.errorRate}% to ${result.after.errorRate}%` },
				{ label: "Outcome retained", status: "done", detail: "Available to future recalls" },
			]);
			setNotice("Resolution and outcome retained in Hindsight.");
		});
	}

	function createFollowUp() {
		void perform("new", api.newIncident, (nextIncident) => {
			setIncident(nextIncident);
			setInvestigation(undefined);
			setResolution(undefined);
			setEvents([{ label: "Incident received", status: "done", detail: nextIncident.id }]);
			setNotice("A follow-up incident is ready. Investigate to recall accumulated experience.");
		});
	}

	function resetDemo() {
		if (!window.confirm("Clear this prototype's Hindsight demo memories and restart the incident sequence?")) return;
		void perform("reset", api.resetDemo, ({ incident: initialIncident }) => {
			setIncident(initialIncident);
			setInvestigation(undefined);
			setResolution(undefined);
			setEvents([{ label: "Demo reset", status: "done", detail: "BugSlayers demo memories cleared" }]);
			setNotice("Demo reset. The next investigation starts without seeded demo experience.");
		});
	}

	const metrics = investigation?.metrics;
	const active = incident?.status === "ACTIVE";
	const canResolve = Boolean(active && investigation && !resolution);

	return (
		<main className="app-shell">
			<header className="topbar">
				<a className="brand" href="#top" aria-label="BugSlayers Incident Response home">
					<span className="brand-mark"><Activity size={18} strokeWidth={2.5} /></span>
					<span className="brand-name">BUGSLAYERS<span> / RESPONSE</span></span>
				</a>
				<div className="topbar-meta"><span className="live-indicator" /> LOCAL DEMO <span className="meta-divider" /> HINDSIGHT MEMORY</div>
				<div className="topbar-actions">
					{incident?.status === "RESOLVED" && <button className="button button-quiet" onClick={createFollowUp} disabled={Boolean(busy)}><ArrowRight size={15} /> New incident</button>}
					<button className="icon-button" onClick={resetDemo} disabled={Boolean(busy)} title="Reset demo and clear its Hindsight memories" aria-label="Reset demo"><RotateCcw size={17} /></button>
				</div>
			</header>

			<section className="incident-heading" id="top">
				<div className="heading-copy">
					<p className="eyebrow">INCIDENT CONSOLE <span className="eyebrow-rule" /></p>
					<h1>{incident ? "Payment API" : "Connecting to incident service"}</h1>
					<p className="incident-description">{incident?.description ?? "Loading current incident state…"}</p>
				</div>
				<div className="incident-badges">
					<span className="severity-badge"><AlertTriangle size={14} /> SEV 1 / HIGH</span>
					<span className={active ? "status-badge status-active" : "status-badge status-resolved"}><span /> {incident?.status ?? "LOADING"}</span>
				</div>
				<div className="incident-strip">
					<span><small>INCIDENT</small><strong>{incident?.id ?? "—"}</strong></span>
					<span><small>SERVICE</small><strong><Server size={13} /> {incident?.service ?? "—"}</strong></span>
					<span><small>TRIGGER</small><strong>HTTP 503 / REDIS</strong></span>
					<span><small>STATE</small><strong>{active ? "INVESTIGATING" : incident?.status ?? "—"}</strong></span>
				</div>
			</section>

			<nav className="workflow-rail" aria-label="Incident workflow">
				{["INTAKE", "RECALL", "INVESTIGATE", "ANALYZE", "RESOLVE", "LEARN"].map((step, index) => {
					const reached = index === 0 || (index <= 3 && Boolean(investigation)) || (index >= 4 && Boolean(resolution));
					return <div className={`workflow-step ${reached ? "step-reached" : ""}`} key={step}><span>{reached ? <Check size={12} /> : `0${index + 1}`}</span>{step}{index < 5 && <i />}</div>;
				})}
			</nav>

			{error && <div className="alert alert-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError(undefined)} aria-label="Dismiss error">×</button></div>}
			{notice && <div className="alert alert-notice" role="status"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice(undefined)} aria-label="Dismiss notice">×</button></div>}

			<div className="dashboard-grid">
				<section className="primary-column">
					<div className="section-heading"><div><p className="eyebrow">01 / SIGNAL</p><h2>Current evidence</h2></div><span className="source-tag"><CircleDot size={12} /> {metrics ? "LIVE TOOL RESULT" : "AWAITING INVESTIGATION"}</span></div>
					<div className="metrics-grid">
						<MetricTile label="503 error rate" value={metrics ? `${metrics.errorRate}%` : "—"} delta={resolution ? "RECOVERED" : metrics ? "ELEVATED" : "NOT QUERIED"} tone={resolution ? "good" : "danger"} icon={<Activity size={16} />} />
						<MetricTile label="Redis latency" value={metrics ? `${metrics.redisLatency}ms` : "—"} delta={metrics ? "REDIS SIGNAL" : "NOT QUERIED"} tone="warning" icon={<Database size={16} />} />
						<MetricTile label="Pool utilization" value={metrics ? `${metrics.redisConnectionPoolUsage}%` : "—"} delta={metrics ? "CAPACITY" : "NOT QUERIED"} tone={metrics && metrics.redisConnectionPoolUsage >= 95 ? "danger" : "neutral"} icon={<Gauge size={16} />} />
						<MetricTile label="Request latency p95" value={metrics ? `${metrics.latencyP95}ms` : "—"} delta={metrics ? "PAYMENT API" : "NOT QUERIED"} tone="neutral" icon={<Activity size={16} />} />
					</div>

					<section className="panel investigation-panel">
						<div className="panel-heading"><div className="panel-icon icon-coral"><Search size={17} /></div><div><p className="eyebrow">02 / TRIAGE</p><h2>Agent investigation</h2></div><span className="panel-step">01—04</span></div>
						{investigation ? <>
							<div className="analysis-status"><span><Sparkles size={14} /> HYPOTHESIS</span><b>NOT CONFIRMED</b></div>
							<h3 className="cause-title">{investigation.analysis.possibleRootCause}</h3>
							<div className="analysis-grid">
								<div className="analysis-block"><p className="block-label"><span className="label-dot dot-fact" /> CURRENT EVIDENCE</p><ul>{[
									`503 error rate ${investigation.metrics.errorRate}%`,
									`Redis latency ${investigation.metrics.redisLatency}ms`,
									`Connection pool ${investigation.metrics.redisConnectionPoolUsage}% utilized`,
									`p95 latency ${investigation.metrics.latencyP95}ms`,
								].map((fact) => <li key={fact}>{fact}</li>)}</ul></div>
								<div className="analysis-block"><p className="block-label"><span className="label-dot dot-hypothesis" /> MODEL REASONING</p><p>{investigation.analysis.reasoning}</p></div>
							</div>
							<div className="recommendation"><Wrench size={15} /><div><small>NEXT ACTION / {investigation.analysis.confidence.toUpperCase()} CONFIDENCE</small><p>{investigation.analysis.recommendedNextAction}</p></div></div>
							<p className="uncertainty-note">{investigation.analysis.uncertainty}</p>
						</> : <div className="empty-analysis"><div className="empty-signal"><Activity size={20} /></div><p>Run an investigation to retrieve current metrics, search Hindsight, and generate a grounded hypothesis.</p></div>}
						<div className="panel-actions">
							<button className="button button-primary" onClick={investigate} disabled={!active || Boolean(busy) || !incident}>{busy === "investigate" ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{investigation ? "Investigate again" : "Investigate incident"}<ChevronRight size={15} /></button>
							{canResolve && <button className="button button-resolve" onClick={resolveIncident} disabled={Boolean(busy)}>{busy === "resolve" ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}Resolve & learn</button>}
						</div>
					</section>

					{resolution && <section className="resolution-banner"><div className="resolved-icon"><ShieldCheck size={20} /></div><div className="resolution-copy"><p className="eyebrow">SIMULATED RESOLUTION / RETAINED</p><h3>Pool increased 50 → 100</h3><p>Error rate returned from {resolution.before.errorRate}% to {resolution.after.errorRate}%. Outcome is now available to future Hindsight recalls.</p></div><div className="resolution-after"><small>AFTER</small><strong>{resolution.after.errorRate}%</strong><span>503 ERROR RATE</span></div></section>}
				</section>

				<aside className="side-column">
					<section className="panel memory-panel">
						<div className="memory-heading"><div className="memory-brain"><Database size={18} /></div><div><p className="eyebrow">PERSISTENT EXPERIENCE</p><h2>Hindsight memory</h2></div><span className="memory-live"><i /> CONNECTED VIA API</span></div>
						<div className="memory-count"><strong>{investigation?.memories.length ?? "—"}</strong><span>RELEVANT<br />MEMORIES</span><span className="count-divider" /><p>{investigation ? investigation.memories.length ? "Experience surfaced" : "No match found" : "Not queried yet"}</p></div>
						{investigation && investigation.memories.length > 0 ? <div className="memory-list">{investigation.memories.map((memory) => <article className="memory-item" key={memory.id}><div className="memory-item-top"><span>{memory.type.toUpperCase()}</span><small>{memory.context ?? "HINDSIGHT RECALL"}</small></div><p>{memory.text}</p></article>)}</div> : <div className="memory-empty"><div className="empty-memory-icon"><Database size={18} /></div><p>{investigation ? "No relevant previous incident was returned from Hindsight. Current analysis is based on this incident’s evidence." : "Seed a verified incident experience into Hindsight, then investigate to surface relevant history here."}</p></div>}
						<div className="memory-footer"><span><span className="label-dot dot-history" /> HISTORICAL EVIDENCE</span><button onClick={teachMemory} disabled={Boolean(busy)}>{busy === "seed" ? <LoaderCircle className="spin" size={14} /> : <Database size={14} />} Seed historical incident</button></div>
					</section>

					<section className="panel activity-panel">
						<div className="section-heading compact-heading"><div><p className="eyebrow">03 / TRACE</p><h2>Investigation log</h2></div><span className="trace-count">{String(events.length).padStart(2, "0")} EVENTS</span></div>
						<div className="event-list">{events.map((event, index) => <div className="event-row" key={`${event.label}-${index}`}><span className={`event-marker ${event.status === "current" ? "event-current" : ""}`}>{event.status === "done" ? <Check size={11} /> : <CircleDot size={12} />}</span><div><strong>{event.label}</strong><small>{event.detail}</small></div><span className="event-time">{event.status === "current" ? "NOW" : "DONE"}</span></div>)}{events.length === 0 && <p className="event-placeholder">Workflow events appear as the incident is investigated.</p>}</div>
						{investigation && <div className="memory-diff"><span className="diff-label">MEMORY EFFECT</span><div><span className={investigation.memories.length ? "diff-before" : "diff-after"}>{investigation.memories.length ? "WITH HISTORY" : "NO HISTORY"}</span><ArrowRight size={13} /><span>{investigation.memories.length ? "context added" : "evidence only"}</span></div></div>}
					</section>
				</aside>
			</div>
			<footer className="footer"><span>BUGSLAYERS INCIDENT RESPONSE AGENT</span><span><span className="label-dot dot-fact" /> OBSERVED <span className="label-dot dot-history" /> RECALLED <span className="label-dot dot-hypothesis" /> HYPOTHESIS</span></footer>
		</main>
	);
}

function MetricTile({ label, value, delta, tone, icon }: { label: string; value: string; delta: string; tone: string; icon: React.ReactNode }) {
	return <article className={`metric-tile metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small><i />{delta}</small></article>;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The request could not be completed.";
}