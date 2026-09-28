import { useEffect, useState } from "react";
import {
	Activity,
	AlertTriangle,
	ArrowDown,
	ArrowRight,
	Bot,
	Check,
	ChevronDown,
	ChevronRight,
	CircleDot,
	Clock3,
	Database,
	Gauge,
	Layers3,
	LoaderCircle,
	RotateCcw,
	Search,
	Server,
	ShieldCheck,
	Sparkles,
	Wifi,
	Wrench,
	X,
} from "lucide-react";
import { ApiError, api } from "./api";
import type { ApiFailure, AppliedSolution, Incident, IncidentMemory, Investigation, Resolution, SolutionAttempt, SolutionFeedback, SystemStatus, TraceEvent } from "./types";

type BusyAction = "investigate" | "seed" | "apply" | "feedback" | "learn" | "new" | "reset" | "demo";
type TimelineItem = TraceEvent | { id: string; label: string; detail: string; status: "pending"; durationMs: 0; occurredAt: string };
type DrawerState =
	| { kind: "memory"; memory: IncidentMemory }
	| { kind: "evidence"; metric: "errorRate" | "redisLatency" | "redisConnectionPoolUsage" | "latencyP95" };

export function App() {
	const [incident, setIncident] = useState<Incident>();
	const [investigation, setInvestigation] = useState<Investigation>();
	const [baselineInvestigation, setBaselineInvestigation] = useState<Investigation>();
	const [resolution, setResolution] = useState<Resolution>();
	const [pendingSolution, setPendingSolution] = useState<AppliedSolution>();
	const [solutionAttempts, setSolutionAttempts] = useState<SolutionAttempt[]>([]);
	const [feedbackChoice, setFeedbackChoice] = useState<SolutionFeedback>();
	const [learned, setLearned] = useState(false);
	const [trace, setTrace] = useState<TimelineItem[]>([]);
	const [status, setStatus] = useState<SystemStatus>();
	const [busy, setBusy] = useState<BusyAction>();
	const [busyMessage, setBusyMessage] = useState("");
	const [retryAction, setRetryAction] = useState<BusyAction>();
	const [notice, setNotice] = useState<string>();
	const [failure, setFailure] = useState<ApiFailure>();
	const [drawer, setDrawer] = useState<DrawerState>();
	const [expandedEvent, setExpandedEvent] = useState<string>();
	const [demoGuide, setDemoGuide] = useState(false);

	useEffect(() => {
		void loadIncident();
		void refreshStatus();
		const timer = window.setInterval(() => void refreshStatus(), 45_000);
		return () => window.clearInterval(timer);
	}, []);

	async function loadIncident() {
		try {
			const current = await api.getIncident();
			setIncident(current);
			setTrace([{ id: "intake", label: "Incident received", detail: current.id, status: "completed", durationMs: 0, occurredAt: new Date().toISOString() }]);
		} catch (error) {
			setFailure({ error: errorMessage(error) });
		}
	}

	async function refreshStatus() {
		try {
			setStatus(await api.getSystemStatus());
		} catch {
			setStatus({ hindsight: "disconnected", llm: "disconnected", metrics: "disconnected", agent: "degraded" });
		}
	}

	async function perform<T>(name: BusyAction, message: string, action: () => Promise<T>, onSuccess: (result: T, durationMs: number) => void) {
		setBusy(name);
		setBusyMessage(message);
		setFailure(undefined);
		setRetryAction(undefined);
		setNotice(undefined);
		const startedAt = Date.now();
		try {
			onSuccess(await action(), Date.now() - startedAt);
			void refreshStatus();
		} catch (error) {
			setRetryAction(name);
			if (error instanceof ApiError) {
				setFailure(error.failure);
				if (error.failure.trace) setTrace(error.failure.trace);
			} else {
				setFailure({ error: errorMessage(error) });
			}
			void refreshStatus();
		} finally {
			setBusy(undefined);
			setBusyMessage("");
		}
	}

	function localEvent(id: string, label: string, detail: string, durationMs: number): TraceEvent {
		return { id, label, detail, status: "completed", durationMs, occurredAt: new Date().toISOString() };
	}

	function seedMemory() {
		void perform("seed", "Saving historical incident experience to Hindsight…", api.seedMemory, ({ incidentId }, durationMs) => {
			setTrace((current) => [...current, localEvent("seed", "Historical experience retained", `Hindsight document for ${incidentId}`, durationMs)]);
			setNotice("Historical incident retained in Hindsight. Investigate to see what it recalls.");
		});
	}

	function investigate() {
		if (!incident) return;
		setBaselineInvestigation(undefined);
		setTrace([{ id: "request", label: "Investigation request in progress", detail: "Waiting for measured backend activity events.", status: "pending", durationMs: 0, occurredAt: new Date().toISOString() }]);
		void perform("investigate", "Agent is querying metrics, Hindsight, and the analysis model…", () => api.investigate(incident.id), (result) => {
			setIncident(result.incident);
			setInvestigation(result);
			setSolutionAttempts(result.priorSolutionAttempts);
			setPendingSolution(undefined);
			setResolution(undefined);
			setLearned(false);
			setTrace(result.trace);
			setNotice(result.memories.length ? `Hindsight returned ${result.memories.length} memories for this investigation.` : "Hindsight returned no relevant experience; analysis uses current evidence only.");
		});
	}

	async function runMemoryDemo() {
		if (!incident || busyNow) return;
		const runIncident = incident;
		setBusy("demo");
		setBusyMessage("Running a no-memory baseline investigation…");
		setFailure(undefined);
		setRetryAction(undefined);
		setNotice(undefined);
		setBaselineInvestigation(undefined);
		setInvestigation(undefined);
		setResolution(undefined);
		setPendingSolution(undefined);
		setSolutionAttempts([]);
		setLearned(false);
		setTrace([{ id: "baseline", label: "No-memory baseline started", detail: "Hindsight recall is explicitly disabled for this run.", status: "pending", durationMs: 0, occurredAt: new Date().toISOString() }]);
		try {
			const baseline = await api.investigate(runIncident.id, { memoryMode: "disabled" });
			setBaselineInvestigation(baseline);
			setInvestigation(baseline);
			setTrace(baseline.trace);

			setBusyMessage("Retaining the historical Payment API experience in Hindsight…");
			setBusy("seed");
			const seedStartedAt = Date.now();
			const retained = await api.seedMemory();
			const seedEvent = localEvent("seed", "Historical experience retained", `Hindsight document ${retained.incidentId}`, Date.now() - seedStartedAt);
			setTrace((current) => [...current, seedEvent]);

			setBusyMessage("Re-running the same incident with Hindsight memory enabled…");
			setBusy("demo");
			const memoryEnabled = await api.investigate(runIncident.id);
			setInvestigation(memoryEnabled);
			setTrace([...baseline.trace, seedEvent, ...memoryEnabled.trace]);
			setNotice(`Comparison complete: baseline used no Hindsight memory; the second run received ${memoryEnabled.memories.length} historical memories.`);
			void refreshStatus();
		} catch (error) {
			setRetryAction("demo");
			if (error instanceof ApiError) {
				setFailure(error.failure);
				if (error.failure.trace) setTrace((current) => [...current.filter((event) => event.id !== "request"), ...error.failure.trace!]);
			} else {
				setFailure({ error: errorMessage(error) });
			}
			void refreshStatus();
		} finally {
			setBusy(undefined);
			setBusyMessage("");
		}
	}

	function applySolution() {
		if (!incident) return;
		void perform("apply", "Applying the simulated fix and collecting test evidence…", () => api.applySolution(incident.id), (result, durationMs) => {
			setPendingSolution(result);
			setTrace((current) => [...current, localEvent("solution-applied", "Simulated solution applied", `Expected HTTP 503 rate ${result.before.errorRate}% → ${result.expectedAfter.errorRate}%; awaiting confirmation`, durationMs)]);
			setNotice("The simulated change is applied. The incident remains ACTIVE until you confirm the outcome.");
		});
	}

	function confirmSolution(result: SolutionFeedback) {
		if (!incident || !pendingSolution) return;
		setFeedbackChoice(result);
		const message = result === "SUCCESS" ? "Recording your confirmation and retaining the verified experience…" : result === "FAILED" ? "Recording the failed attempt so the agent can investigate again…" : "Recording partial recovery and updating current evidence…";
		void perform("feedback", message, () => api.submitSolutionFeedback(incident.id, result), (response, durationMs) => {
			setIncident(response.incident);
			setSolutionAttempts(response.attempts);
			setFeedbackChoice(undefined);
			setPendingSolution(undefined);
			setTrace((current) => [...current, localEvent(`feedback-${result.toLowerCase()}`, `User confirmed ${result.toLowerCase()} outcome`, response.retentionError ?? (response.retained ? "Verified experience retained in Hindsight" : "Not stored as a verified successful solution"), durationMs)]);
			if (result === "SUCCESS") {
				const before = response.before ?? pendingSolution.before;
				const after = response.after ?? pendingSolution.expectedAfter;
				setResolution({ incident: response.incident, before, after, retained: response.retained });
				setLearned(response.retained);
				setNotice(response.retentionError ?? (response.retained ? "You confirmed the fix. The incident is resolved and the verified experience was retained in Hindsight." : "You confirmed the fix. The incident is resolved; save its experience to Hindsight."));
				return;
			}
			setInvestigation(undefined);
			setBaselineInvestigation(undefined);
			setResolution(undefined);
			setPendingSolution(undefined);
			setSolutionAttempts([]);
			setLearned(false);
			setNotice(result === "FAILED" ? "Solution marked FAILED, not verified. Investigate again; the agent will be told not to repeat it." : "Partial improvement recorded as PARTIAL, not verified. Investigate again with the updated evidence.");
		});
	}

	function learnFromIncident() {
		if (!incident) return;
		void perform("learn", "Saving symptoms, evidence, diagnosis, resolution, and outcome to Hindsight…", () => api.learn(incident.id), (result, durationMs) => {
			setLearned(result.retained);
			setTrace((current) => [...current, localEvent("learn", "Experience retained in Hindsight", `Incident ${result.incidentId} is available for future recall`, durationMs)]);
			setNotice("Resolved incident experience is now retained in Hindsight.");
		});
	}

	function createFollowUp() {
		void perform("new", "Creating the next recurring incident…", api.newIncident, (nextIncident) => {
			setIncident(nextIncident);
			setInvestigation(undefined);
			setBaselineInvestigation(undefined);
			setResolution(undefined);
			setPendingSolution(undefined);
			setSolutionAttempts([]);
			setLearned(false);
			setTrace([localEvent("intake", "Follow-up incident created", nextIncident.id, 0)]);
			setNotice("Follow-up incident is ready. Investigate to recall the stored experience.");
		});
	}

	function resetDemo() {
		if (!window.confirm("Clear this prototype's Hindsight demo memories and restart the incident sequence?")) return;
		void perform("reset", "Removing only this prototype's demo documents from Hindsight…", api.resetDemo, ({ incident: initialIncident }) => {
			setIncident(initialIncident);
			setInvestigation(undefined);
			setBaselineInvestigation(undefined);
			setResolution(undefined);
			setLearned(false);
			setTrace([localEvent("reset", "Demo reset", "BugSlayers demo documents cleared", 0)]);
			setNotice("Demo reset. No demo incident experience remains in the configured bank.");
		});
	}

	const active = incident?.status === "ACTIVE";
	const metrics = investigation?.metrics;
	const busyNow = Boolean(busy);
	const rootError = failure?.dependency ? `${failure.dependency === "llm" ? "LLM" : failure.dependency === "hindsight" ? "Hindsight" : "Metrics tool"} dependency` : "Incident API";
	const reached = {
		intake: Boolean(incident),
		recall: trace.some((event) => event.id === "recall" && event.status === "completed"),
		investigate: trace.some((event) => event.id === "metrics" && event.status === "completed"),
		analyze: trace.some((event) => event.id === "analysis" && event.status === "completed"),
		resolve: Boolean(resolution),
		learn: learned,
	};

	function retryFailedAction() {
		if (retryAction === "investigate") investigate();
		if (retryAction === "seed") seedMemory();
		if (retryAction === "apply") applySolution();
		if (retryAction === "feedback" && feedbackChoice) confirmSolution(feedbackChoice);
		if (retryAction === "learn") learnFromIncident();
		if (retryAction === "new") createFollowUp();
		if (retryAction === "reset") resetDemo();
		if (retryAction === "demo") runMemoryDemo();
	}

	return (
		<main className="app-shell" id="top">
			<header className="topbar">
				<a className="brand" href="#top" aria-label="BugSlayers Incident Response home"><span className="brand-mark"><Activity size={18} strokeWidth={2.5} /></span><span className="brand-name">BUGSLAYERS<span> / RESPONSE</span></span></a>
				<nav className="product-nav" aria-label="Product navigation"><a href="#incident">INCIDENTS</a><a href="#activity">INVESTIGATIONS</a><a href="#memory">MEMORY</a><a href="#system-status">SYSTEM</a></nav>
				<div className="system-status" id="system-status" aria-label="System connection status">
					<StatusPill name="Hindsight" value={status?.hindsight} icon={<Database size={13} />} />
					<StatusPill name="LLM" value={status?.llm} icon={<Sparkles size={13} />} />
					<span className={`agent-ready ${status?.agent === "ready" ? "is-ready" : "is-degraded"}`}><span /> AGENT {status?.agent === "ready" ? "READY" : status ? "DEGRADED" : "CHECKING"}</span>
				</div>
				<div className="topbar-actions">
					<button className="button button-quiet demo-toggle" onClick={() => setDemoGuide((open) => !open)}><Layers3 size={14} /> Demo mode</button>
					<button className="icon-button" onClick={resetDemo} disabled={busyNow} title="Reset demo and clear only its Hindsight memories" aria-label="Reset demo"><RotateCcw size={16} /></button>
				</div>
			</header>

			{demoGuide && <section className="demo-guide" aria-label="Demo walkthrough"><div><p className="eyebrow">MEMORY LOOP / PRESENTER PATH</p><strong>Show the before and after of organizational memory.</strong><p>Investigate → seed prior experience → investigate again → apply simulated fix → save experience → open the next incident.</p></div><button className="icon-button" onClick={() => setDemoGuide(false)} aria-label="Close demo guide"><X size={16} /></button></section>}

			<section className="incident-hero" id="incident">
				<div className="incident-hero-main"><p className="eyebrow">INCIDENT / {incident?.id ?? "LOADING"}<span className="eyebrow-rule" /></p><h1>Payment API</h1><p className="incident-description">{incident?.description ?? "Loading current incident state…"}</p><div className="incident-actions"><button className="button button-primary" onClick={investigate} disabled={!active || busyNow || !incident}>{busy === "investigate" ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{busy === "investigate" ? "Agent investigating" : investigation ? "Investigate incident" : "Investigate incident"}<ChevronRight size={15} /></button><button className="button button-memory-run" onClick={runMemoryDemo} disabled={!active || busyNow || !incident}>{busy === "demo" ? <LoaderCircle className="spin" size={15} /> : <Layers3 size={15} />}{busy === "demo" ? busyMessage : "Run memory demo"}</button><a className="button button-outline" href="#evidence">View evidence</a><a className="button button-outline" href="#memory">View memory</a></div></div>
				<div className="incident-hero-status"><span className="severity-badge"><AlertTriangle size={14} /> SEV-1 / HIGH</span><span className={`status-badge ${active ? "status-active" : "status-resolved"}`}><i /> {incident?.status ?? "LOADING"}</span><span className="incident-state-caption">{busy === "investigate" ? "AGENT IS INVESTIGATING" : resolution ? "RECOVERY VERIFIED · DEMO" : active ? "AWAITING INVESTIGATION" : "INCIDENT CLOSED"}</span></div>
				<div className="incident-facts"><Fact label="SERVICE" value={incident?.service ?? "—"} icon={<Server size={13} />} /><Fact label="TRIGGER" value="HTTP 503 / REDIS" /><Fact label="STARTED" value="Demo scenario" /><Fact label="STATE" value={busy === "investigate" ? "INVESTIGATION RUNNING" : incident?.status ?? "—"} /></div>
			</section>

			<section className="lifecycle" aria-label="Incident lifecycle">
				{([
					["intake", "INTAKE"], ["recall", "RECALL"], ["investigate", "INVESTIGATE"], ["analyze", "ANALYZE"], ["resolve", "RESOLVE"], ["learn", "LEARN"],
				] as const).map(([key, label], index) => {
					const done = reached[key];
					const failed = (key === "recall" && trace.some((event) => event.id === "recall" && event.status === "failed")) ||
						(key === "investigate" && trace.some((event) => event.id === "metrics" && event.status === "failed")) ||
						(key === "analyze" && trace.some((event) => event.id === "analysis" && event.status === "failed")) ||
						(key === "learn" && retryAction === "learn" && Boolean(failure));
					const current = !done && !failed && (busy === "investigate" && index === 2 || (busy === "apply" || busy === "feedback" || pendingSolution) && index === 4 || busy === "learn" && index === 5);
					const labelText = failed ? "FAILED" : done ? "COMPLETED" : current ? "ACTIVE" : "WAITING";
					return <div className={`lifecycle-step ${done ? "is-complete" : ""} ${current ? "is-current" : ""} ${failed ? "is-failed" : ""}`} key={key}><span className="step-marker">{done ? <Check size={13} /> : failed ? <X size={12} /> : current ? <LoaderCircle className="spin" size={13} /> : `0${index + 1}`}</span><span className="step-copy"><strong>{label}</strong><small>{labelText}</small></span>{index < 5 && <span className="step-link" />}</div>;
				})}
				{busyNow && <span className="lifecycle-activity"><LoaderCircle className="spin" size={13} /> {busyMessage}</span>}
			</section>

			{failure && <section className="failure-panel" role="alert"><div className="failure-icon"><AlertTriangle size={18} /></div><div className="failure-copy"><p className="eyebrow">{retryAction === "learn" ? "MEMORY RETENTION INTERRUPTED" : retryAction === "seed" ? "MEMORY SEED INTERRUPTED" : retryAction === "investigate" ? "INVESTIGATION INTERRUPTED" : "REQUEST INTERRUPTED"} / {rootError.toUpperCase()}</p><h2>{failure.error}</h2><p>{failure.code ? `Diagnostic: ${failure.code}` : "The request did not complete."} Completed backend stages remain visible in Agent activity below.</p></div><div className="failure-actions">{retryAction && <button className="button button-primary" onClick={retryFailedAction} disabled={busyNow}><RotateCcw size={14} /> {retryLabel(retryAction)}</button>}<a href="#activity" className="button button-outline">View details</a></div></section>}
			{notice && <div className="notice-banner" role="status"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice(undefined)} aria-label="Dismiss notification"><X size={14} /></button></div>}

			<div className="signal-grid">
				<section className="console-section evidence-section" id="evidence">
					<div className="section-heading"><div><p className="eyebrow">01 / OBSERVED SIGNAL</p><h2>Current evidence</h2></div><span className="demo-tag"><CircleDot size={11} /> DEMO DATA · METRICS TOOL</span></div>
					<div className="metrics-grid">
						<MetricTile label="503 error rate" value={metrics ? `${metrics.errorRate}%` : undefined} descriptor={resolution ? "RECOVERED" : "REQUEST FAILURES"} tone={resolution ? "good" : "danger"} icon={<Activity size={16} />} onClick={() => setDrawer({ kind: "evidence", metric: "errorRate" })} />
						<MetricTile label="Redis latency" value={metrics ? `${metrics.redisLatency}ms` : undefined} descriptor="DEPENDENCY SIGNAL" tone="warning" icon={<Database size={16} />} onClick={() => setDrawer({ kind: "evidence", metric: "redisLatency" })} />
						<MetricTile label="Pool utilization" value={metrics ? `${metrics.redisConnectionPoolUsage}%` : undefined} descriptor="CAPACITY" tone={metrics && metrics.redisConnectionPoolUsage >= 95 ? "danger" : "neutral"} icon={<Gauge size={16} />} onClick={() => setDrawer({ kind: "evidence", metric: "redisConnectionPoolUsage" })} />
						<MetricTile label="Request latency p95" value={metrics ? `${metrics.latencyP95}ms` : undefined} descriptor="PAYMENT API" tone="neutral" icon={<Clock3 size={16} />} onClick={() => setDrawer({ kind: "evidence", metric: "latencyP95" })} />
					</div>
					<div className="tool-results"><div className="tool-result"><div className="tool-result-heading"><span className="tool-terminal-icon"><Wrench size={14} /></span><span><small>INVESTIGATION TOOL · DEMO DATA</small><strong>getMetrics("{incident?.service ?? "payment-api"}")</strong></span><span className={`tool-run-state ${metrics ? "tool-complete" : "tool-waiting"}`}><i /> {metrics ? "COMPLETED" : "NOT RUN"}</span></div><div className="tool-result-body"><code>{metrics ? `errorRate ${metrics.errorRate}%   redisLatency ${metrics.redisLatency}ms   poolUsage ${metrics.redisConnectionPoolUsage}%   latencyP95 ${metrics.latencyP95}ms` : "Metrics appear here after an investigation calls the backend tool."}</code>{metrics && <small>Returned by simulated metrics tool · {formatDateTime(metrics.observedAt)}</small>}</div></div><div className="tool-result logs-result"><div className="tool-result-heading"><span className="tool-terminal-icon"><Activity size={14} /></span><span><small>INVESTIGATION TOOL · DEMO DATA</small><strong>getRecentLogs("{incident?.service ?? "payment-api"}")</strong></span><span className={`tool-run-state ${investigation?.logs.length ? "tool-complete" : "tool-waiting"}`}><i /> {investigation?.logs.length ? `${investigation.logs.length} ENTRIES` : "NOT RUN"}</span></div>{investigation?.logs.length ? <div className="logs-list">{investigation.logs.map((log) => <div className={`log-entry log-${log.level.toLowerCase()}`} key={`${log.timestamp}-${log.message}`}><time>{new Date(log.timestamp).toLocaleTimeString()}</time><b>{log.level}</b><span>{log.message}</span></div>)}</div> : <div className="tool-result-body"><code>Recent logs appear after the backend executes this tool.</code></div>}</div></div>
				</section>

				<section className="console-section memory-section" id="memory">
					<div className="section-heading"><div><p className="eyebrow">02 / ORGANIZATIONAL EXPERIENCE</p><h2><Database size={17} /> Hindsight memory</h2></div><StatusPill name="HINDSIGHT" value={status?.hindsight} icon={<Database size={12} />} /></div>
					<div className="memory-summary"><strong>{investigation ? investigation.memories.length : "—"}</strong><span>{investigation ? "RELEVANT MEMORIES" : "MEMORIES NOT QUERIED"}</span><p>{investigation ? investigation.memories.length ? "Returned by Hindsight for this incident" : "No relevant fact returned for this query" : status?.hindsight === "connected" ? "Memory bank reachable · run an investigation to recall" : "Connection status is checked by the backend"}</p></div>
					{investigation?.memories.length ? <div className="memory-results">{investigation.memories.map((memory) => <MemoryCard key={memory.id} memory={memory} onOpen={() => setDrawer({ kind: "memory", memory })} />)}</div> : <div className="memory-empty"><span className="empty-memory-icon"><Database size={18} /></span><p>{investigation ? "No historical experience matched this investigation. The analysis was supplied current tool evidence only." : "Seed the previous Payment API incident, then investigate to show historical experience here."}</p></div>}
					{investigation?.runbooks.map((runbook) => <article className="validated-runbook" key={runbook.id}><div className="runbook-heading"><span className="runbook-icon"><Wrench size={14} /></span><div><small>VALIDATED IN PRIOR INCIDENTS · HINDSIGHT</small><h3>{runbook.title}</h3></div></div><ol>{runbook.steps.map((step, index) => <li key={`${runbook.id}-${index}`}>{step}</li>)}</ol><p className="runbook-outcome"><strong>PAST OUTCOME</strong>{runbook.outcome}</p><small className="runbook-sources">Source incidents: {runbook.sourceIncidentIds.join(", ") || "Hindsight metadata"}</small></article>)}
					<div className="memory-actions"><div><span className="label-dot dot-history" /> Recalled facts are shown as historical evidence, not current proof.</div><button className="button button-memory" onClick={seedMemory} disabled={busyNow}>{busy === "seed" ? <LoaderCircle className="spin" size={14} /> : <Database size={14} />} Seed previous incident</button></div>
				</section>
			</div>

			{solutionAttempts.length > 0 && <section className="panel attempt-history-panel"><div className="panel-title"><span className="panel-icon icon-analysis"><Clock3 size={16} /></span><div><p className="eyebrow">SOLUTION FEEDBACK</p><h2>Previous attempts · not all are verified</h2></div></div><div className="attempt-history-list">{solutionAttempts.map((attempt) => <article className={`attempt-history-row attempt-${attempt.result.toLowerCase()}`} key={attempt.id}><span className="attempt-result">{attempt.result === "VERIFIED" ? <Check size={13} /> : attempt.result === "FAILED" ? <X size={13} /> : <AlertTriangle size={13} />}{attempt.result}</span><span className="attempt-description"><strong>{attempt.recommendation}</strong><small>503 {attempt.evidenceBefore.errorRate}% → {attempt.evidenceAfter.errorRate}% · Redis {attempt.evidenceBefore.redisLatency}ms → {attempt.evidenceAfter.redisLatency}ms</small></span><span className="attempt-persistence">{attempt.retained ? "RETAINED · UNVERIFIED" : "SESSION HISTORY"}</span></article>)}</div></section>}

			{baselineInvestigation && investigation?.memoryMode === "enabled" && <section className="panel memory-comparison" aria-labelledby="comparison-title"><div className="panel-title"><span className="panel-icon icon-analysis"><Layers3 size={17} /></span><div><p className="eyebrow">BEFORE / AFTER HINDSIGHT</p><h2 id="comparison-title">What changed when the agent used memory?</h2></div><span className="comparison-run-tag">SAME INCIDENT · TWO ACTUAL RUNS</span></div><div className="comparison-grid"><article className="comparison-side no-memory"><p><CircleDot size={13} /> BASELINE · HINDSIGHT SKIPPED</p><h3>{baselineInvestigation.analysis.possibleRootCause}</h3><span>Memories passed to model: {baselineInvestigation.memories.length}</span><p>{baselineInvestigation.analysis.reasoning}</p></article><div className="comparison-arrow"><ArrowRight size={17} /></div><article className="comparison-side with-memory"><p><Database size={13} /> HINDSIGHT ENABLED · {investigation.memories.length} MEMORIES RETURNED</p><h3>{investigation.analysis.possibleRootCause}</h3><span>Historical evidence was supplied separately from current metrics and logs.</span><p>{investigation.analysis.reasoning}</p>{investigation.memories[0] && <blockquote>{investigation.memories[0].text}</blockquote>}</article></div><small className="comparison-footnote">These are two real model responses. The display reports observed outputs only; it does not claim an accuracy or MTTR improvement.</small></section>}

			<div className="agent-grid">
				<section className="panel agent-activity" id="activity">
					<div className="panel-title"><span className="panel-icon icon-agent"><Bot size={17} /></span><div><p className="eyebrow">03 / EXECUTION TRACE</p><h2>Agent activity</h2></div><span className="trace-count">{String(trace.length).padStart(2, "0")} EVENTS</span></div>
					<div className="timeline">{trace.map((event) => <TimelineRow key={`${event.id}-${event.occurredAt}`} event={event} expanded={expandedEvent === event.id} onToggle={() => setExpandedEvent(expandedEvent === event.id ? undefined : event.id)} />)}{!trace.length && <p className="empty-timeline">Actual backend events appear here when an operation completes.</p>}</div>
					{investigation && <div className="memory-connection"><div className="connection-signals"><small>SHARED SIGNALS / EXACT TEXT MATCHES</small><div>{sharedSignals(investigation).length ? sharedSignals(investigation).map((signal) => <span key={signal}>{signal}</span>) : <span>No matching terms shown in returned facts</span>}</div></div><ArrowDown size={17} /><span className="connection-target"><Database size={14} /> {investigation.memories.length ? `${investigation.memories.length} Hindsight fact${investigation.memories.length === 1 ? "" : "s"} returned` : "No historical fact returned"}</span></div>}
				</section>

				<section className="panel activity-status-panel">
					<div className="panel-title"><span className="panel-icon icon-status"><Wifi size={17} /></span><div><p className="eyebrow">SYSTEM / VERIFIED PROBES</p><h2>Dependency status</h2></div></div>
					<div className="dependency-list"><DependencyRow name="Hindsight memory" detail="getVersion API probe" value={status?.hindsight} icon={<Database size={15} />} /><DependencyRow name="Groq analysis" detail="API key + configured model lookup" value={status?.llm} icon={<Sparkles size={15} />} /><DependencyRow name="Metrics tool" detail="payment-api tool probe" value={status?.metrics} icon={<Gauge size={15} />} /></div>
					<div className={`agent-state ${status?.agent === "ready" ? "agent-state-ready" : "agent-state-degraded"}`}><span /><div><strong>Agent {status?.agent ?? "status checking"}</strong><small>Connection status comes from backend probes; no memory-bank totals are estimated.</small></div></div>
				</section>
			</div>

			<section className="panel analysis-panel" id="analysis">
				<div className="panel-title"><span className="panel-icon icon-analysis"><Sparkles size={17} /></span><div><p className="eyebrow">04 / REASONING</p><h2>Agent analysis</h2></div>{investigation && <span className="hypothesis-badge"><CircleDot size={12} /> HYPOTHESIS · NOT CONFIRMED</span>}</div>
				{investigation ? <div className="analysis-content"><div className="analysis-primary"><small className="analysis-label">POSSIBLE ROOT CAUSE</small><h3>{investigation.analysis.possibleRootCause}</h3><p>{investigation.analysis.uncertainty}</p><div className="recommendation"><Wrench size={15} /><div><small>RECOMMENDED NEXT ACTION · {investigation.analysis.confidence.toUpperCase()} CONFIDENCE</small><p>{investigation.analysis.recommendedNextAction}</p></div></div></div><div className="analysis-evidence"><AnalysisEvidence title="Current evidence" tone="fact"><ul><li>Error rate: {investigation.metrics.errorRate}%</li><li>Redis latency: {investigation.metrics.redisLatency}ms</li><li>Pool utilization: {investigation.metrics.redisConnectionPoolUsage}%</li><li>Request latency p95: {investigation.metrics.latencyP95}ms</li></ul></AnalysisEvidence><AnalysisEvidence title="Historical evidence" tone="history">{investigation.memories.length ? <ul>{investigation.memories.slice(0, 3).map((memory) => <li key={memory.id}>{memory.text}</li>)}</ul> : <p>No historical memory was returned for this incident.</p>}</AnalysisEvidence><AnalysisEvidence title="Model reasoning" tone="hypothesis"><p>{investigation.analysis.reasoning}</p></AnalysisEvidence>{investigation.priorSolutionAttempts.length > 0 && <AnalysisEvidence title="Previous solution attempts" tone="hypothesis"><ul>{investigation.priorSolutionAttempts.map((attempt) => <li key={attempt.id}>{attempt.result}: {attempt.recommendation}</li>)}</ul></AnalysisEvidence>}</div></div> : <div className="analysis-placeholder"><Sparkles size={19} /><p>Run an investigation to compare current metrics with recalled organizational experience and form a hypothesis.</p></div>}
	</section>

			{investigation && active && !resolution && !pendingSolution && <section className="panel resolve-panel" id="resolve"><div className="panel-title"><span className="panel-icon icon-learning"><Wrench size={17} /></span><div><p className="eyebrow">05 / OPERATOR ACTION</p><h2>Recommended solution</h2></div><span className="demo-tag">SIMULATED FIX</span></div><div className="resolve-action-grid"><div><small>RECOMMENDED BY AGENT</small><p>{investigation.analysis.recommendedNextAction}</p></div><div className="pool-change"><small>DEMO CONFIGURATION</small><strong>Pool size <span>50</span><ArrowRight size={14} /><span>100</span></strong></div><div><small>EXPECTED OUTCOME</small><p>Test the change and check current error-rate and Redis evidence. This does not modify real infrastructure.</p></div></div><button className="button button-primary apply-fix" onClick={applySolution} disabled={busyNow}>{busy === "apply" ? <LoaderCircle className="spin" size={15} /> : <Wrench size={15} />}{busy === "apply" ? "Applying simulated solution…" : "Apply / test solution"}<ChevronRight size={14} /></button></section>}

			{pendingSolution && <section className="panel solution-confirmation" aria-labelledby="solution-confirm-title"><div className="panel-title"><span className="panel-icon icon-analysis"><CircleDot size={17} /></span><div><p className="eyebrow">SOLUTION ATTEMPT / {pendingSolution.solutionId}</p><h2 id="solution-confirm-title">Did this resolve the incident?</h2></div><span className="status-badge status-active"><i /> INCIDENT ACTIVE</span></div><div className="confirmation-evidence"><p>{pendingSolution.recommendation}</p><div><span>503 rate<strong>{pendingSolution.before.errorRate}% → {pendingSolution.expectedAfter.errorRate}%</strong></span><span>Redis latency<strong>{pendingSolution.before.redisLatency}ms → {pendingSolution.expectedAfter.redisLatency}ms</strong></span></div><small>Simulated test evidence · confirm the observed outcome explicitly. The incident is not resolved yet.</small></div><div className="feedback-actions"><button className="feedback-button feedback-success" onClick={() => confirmSolution("SUCCESS")} disabled={busyNow}>{busy === "feedback" && feedbackChoice === "SUCCESS" ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}YES — ISSUE RESOLVED</button><button className="feedback-button feedback-failed" onClick={() => confirmSolution("FAILED")} disabled={busyNow}>{busy === "feedback" && feedbackChoice === "FAILED" ? <LoaderCircle className="spin" size={15} /> : <X size={15} />}NO — ISSUE PERSISTS</button><button className="feedback-button feedback-partial" onClick={() => confirmSolution("PARTIAL")} disabled={busyNow}>{busy === "feedback" && feedbackChoice === "PARTIAL" ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />}PARTIALLY RESOLVED</button></div></section>}

			{resolution && <section className={`panel learning-panel ${learned ? "learning-complete" : ""}`} id="learning"><div className="panel-title"><span className="panel-icon icon-learning"><ShieldCheck size={17} /></span><div><p className="eyebrow">05 / {learned ? "MEMORY UPDATED" : "RESOLUTION & LEARNING"}</p><h2>{learned ? "Experience retained" : "Incident resolved · ready to learn"}</h2></div>{learned && <span className="retained-badge"><Check size={13} /> SAVED TO HINDSIGHT</span>}</div><div className="resolution-layout"><div className="resolution-summary"><p className="resolution-outcome">Error rate <strong>{resolution.before.errorRate}%</strong><ArrowRight size={15} /><strong>{resolution.after.errorRate}%</strong></p><p>Simulated fix: increase Redis connection pool <strong>50 → 100</strong>. The recovery figures are deterministic demo output.</p><div className="resolution-metrics"><span>Redis latency <strong>{resolution.before.redisLatency}ms → {resolution.after.redisLatency}ms</strong></span><span>Pool utilization <strong>{resolution.before.redisConnectionPoolUsage}% → {resolution.after.redisConnectionPoolUsage}%</strong></span></div></div><div className="learning-checklist"><small>EXPERIENCE TO RETAIN</small>{["Symptoms and service", "Metrics and investigation evidence", "Confirmed cause after simulated resolution", "Fix and measured outcome", "Reusable lesson learned"].map((item) => <span key={item}><Check size={13} /> {item}</span>)}</div></div>{!learned ? <div className="learning-actions"><p>Resolution and memory are separate. Save only after reviewing what will be remembered.</p><button className="button button-learn" onClick={learnFromIncident} disabled={busyNow}>{busy === "learn" ? <LoaderCircle className="spin" size={15} /> : <Database size={15} />} {busy === "learn" ? "Saving experience…" : "Save experience to Hindsight"}<ChevronRight size={14} /></button></div> : <div className="learned-footer"><Check size={15} /><span>This incident’s evidence and outcome can now be recalled during later investigations.</span>{incident?.status === "RESOLVED" && <button className="button button-primary" onClick={createFollowUp} disabled={busyNow}><ArrowRight size={14} /> Create follow-up incident</button>}</div>}</section>}

			<footer className="footer"><span>BUGSLAYERS INCIDENT RESPONSE AGENT</span><span><span className="label-dot dot-fact" /> CURRENT TOOL DATA <span className="label-dot dot-history" /> HINDSIGHT MEMORY <span className="label-dot dot-hypothesis" /> MODEL HYPOTHESIS</span></footer>

			{drawer && <DetailDrawer state={drawer} investigation={investigation} onClose={() => setDrawer(undefined)} />}
		</main>
	);
}

function StatusPill({ name, value, icon }: { name: string; value?: "connected" | "disconnected"; icon: React.ReactNode }) {
	const label = value === "connected" ? "CONNECTED" : value === "disconnected" ? "DISCONNECTED" : "CHECKING";
	return <span className={`status-pill ${value ?? "checking"}`} title={`${name}: ${label}`}><span className="status-pip">{icon}</span><span className="status-name">{name}<small>{label}</small></span></span>;
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
	return <span className="incident-fact"><small>{label}</small><strong>{icon}{value}</strong></span>;
}

function MetricTile({ label, value, descriptor, tone, icon, onClick }: { label: string; value?: string; descriptor: string; tone: string; icon: React.ReactNode; onClick: () => void }) {
	return <button className={`metric-tile metric-${tone}`} onClick={onClick} aria-label={`${label}, ${value ?? "not queried"}; view evidence`}><span className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></span><strong>{value ?? "—"}</strong><small><i />{value ? descriptor : "AWAITING TOOL RESULT"}</small><span className="metric-action">VIEW EVIDENCE <ChevronRight size={12} /></span></button>;
}

function MemoryCard({ memory, onOpen }: { memory: IncidentMemory; onOpen: () => void }) {
	const matched = matchingSignals(memory.text);
	const verification = memory.metadata?.verificationStatus?.toUpperCase();
	return <article className={`memory-card ${verification ? `memory-${verification.toLowerCase()}` : ""}`}><div className="memory-card-meta"><span>{memory.type.toUpperCase()} FACT {verification && <b className="verification-tag">{verification}</b>}</span><small>{memory.context ?? "HINDSIGHT RECALL"}</small></div><p>{memory.text}</p>{matched.length > 0 && <div className="shared-signals"><small>SHARED TERMS</small><span>{matched.join(" · ")}</span></div>}<button className="text-action" onClick={onOpen}>View memory details <ChevronRight size={13} /></button></article>;
}

function TimelineRow({ event, expanded, onToggle }: { event: TimelineItem; expanded: boolean; onToggle: () => void }) {
	const pending = event.status === "pending";
	const skipped = event.status === "skipped";
	return <article className={`timeline-row ${pending ? "timeline-pending" : event.status === "failed" ? "timeline-failed" : skipped ? "timeline-skipped" : ""}`}><button className="timeline-toggle" onClick={onToggle} aria-expanded={expanded}><span className="event-marker">{pending ? <LoaderCircle className="spin" size={13} /> : event.status === "failed" ? <X size={12} /> : skipped ? <CircleDot size={12} /> : <Check size={12} />}</span><span className="timeline-event-copy"><strong>{event.label}</strong><small>{event.detail}</small></span><span className="timeline-meta">{pending ? "RUNNING" : skipped ? "SKIPPED" : `${event.durationMs}ms`}<ChevronDown size={13} className={expanded ? "chevron-open" : ""} /></span></button>{expanded && <div className="timeline-detail"><span>RECORDED {formatDateTime(event.occurredAt)}</span><span>RESULT {pending ? "IN PROGRESS" : event.status.toUpperCase()}</span><p>{event.detail}</p></div>}</article>;
}

function DependencyRow({ name, detail, value, icon }: { name: string; detail: string; value?: "connected" | "disconnected"; icon: React.ReactNode }) {
	return <div className="dependency-row"><span className="dependency-icon">{icon}</span><span><strong>{name}</strong><small>{detail}</small></span><span className={`dependency-state ${value ?? "checking"}`}><i />{value === "connected" ? "CONNECTED" : value === "disconnected" ? "DISCONNECTED" : "CHECKING"}</span></div>;
}

function AnalysisEvidence({ title, tone, children }: { title: string; tone: "fact" | "history" | "hypothesis"; children: React.ReactNode }) {
	return <section className={`analysis-evidence-block evidence-${tone}`}><p><i />{title}</p>{children}</section>;
}

function DetailDrawer({ state, investigation, onClose }: { state: DrawerState; investigation?: Investigation; onClose: () => void }) {
	const metricLabels = { errorRate: "503 error rate", redisLatency: "Redis latency", redisConnectionPoolUsage: "Redis connection pool utilization", latencyP95: "Request latency p95" };
	const metricKey = state.kind === "evidence" ? state.metric : undefined;
	const metricValue = metricKey && investigation ? investigation.metrics[metricKey] : undefined;
	return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><div className="drawer-header"><div><p className="eyebrow">{state.kind === "memory" ? "HINDSIGHT / RECALLED FACT" : "METRICS TOOL / RETURNED EVIDENCE"}</p><h2 id="drawer-title">{state.kind === "memory" ? state.memory.type.toUpperCase() : metricKey ? metricLabels[metricKey] : "Evidence"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={16} /></button></div>{state.kind === "memory" ? <div className="drawer-content"><p className="drawer-label">RECALLED MEMORY TEXT</p><blockquote>{state.memory.text}</blockquote><DetailField label="Memory ID" value={state.memory.id} /><DetailField label="Fact type" value={state.memory.type} /><DetailField label="Context" value={state.memory.context ?? "Not provided by Hindsight"} /><div className="drawer-note"><Database size={14} /> This is historical memory returned by Hindsight, not verified evidence for the current incident.</div></div> : <div className="drawer-content"><div className="drawer-metric-value">{metricValue !== undefined ? `${metricValue}${metricKey === "errorRate" || metricKey === "redisConnectionPoolUsage" ? "%" : "ms"}` : "No result yet"}</div><DetailField label="Service" value={investigation?.metrics.service ?? "payment-api"} /><DetailField label="Source" value={investigation ? "getMetrics() · simulated demo tool" : "Not queried"} /><DetailField label="Collected" value={investigation ? formatDateTime(investigation.metrics.observedAt) : "Run an investigation first"} /><div className="drawer-note"><Gauge size={14} /> No normal baseline is returned by this prototype, so no comparison value is shown.</div></div>}<div className="drawer-footer"><button className="button button-quiet" onClick={onClose}>Close details</button></div></aside></div>;
}

function DetailField({ label, value }: { label: string; value: string }) {
	return <div className="detail-field"><small>{label}</small><strong>{value}</strong></div>;
}

function matchingSignals(text: string): string[] {
	const normalized = text.toLowerCase();
	return [
		["Payment API", ["payment api", "payment-api"]],
		["HTTP 503", ["503"]],
		["Redis", ["redis"]],
		["Connection pool", ["connection pool", "pool saturation", "pool exhaustion"]],
	].filter(([, terms]) => (terms as string[]).some((term) => normalized.includes(term))).map(([label]) => label as string);
}

function sharedSignals(investigation: Investigation): string[] {
	const allFacts = investigation.memories.map((memory) => memory.text).join(" ");
	return matchingSignals(allFacts);
}

function formatDateTime(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The request could not be completed.";
}

function retryLabel(action: BusyAction): string {
	if (action === "learn") return "Retry save to Hindsight";
	if (action === "seed") return "Retry seed memory";
	if (action === "apply") return "Retry simulated fix";
	if (action === "feedback") return "Retry outcome confirmation";
	if (action === "investigate") return "Retry investigation";
	if (action === "new") return "Retry new incident";
	if (action === "reset") return "Retry demo reset";
	return "Retry operation";
}