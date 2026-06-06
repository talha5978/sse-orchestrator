import { useEffect, useState } from "react";
import { SSEOrchestrator } from "../../../../../dist/index.js";

// Define our type-safe event payloads
interface PipelineEvents {
	job_started: { jobId: string; task: string; totalSteps: number };
	step_progress: { step: number; name: string; progress: number };
	artifact_ready: { artifactId: string; type: string; downloadUrl: string };
	job_completed: { jobId: string; durationMs: number; rowsProcessed: number };
}

export const meta = () => {
	return [
		{ title: "SSE Orchestrator Example" },
		{ name: "description", content: "An example implementation using SSE Orchestrator." },
	];
};

export default function Home() {
	const [status, setStatus] = useState<string>("DISCONNECTED");
	const [jobInfo, setJobInfo] = useState<{ id: string; name: string } | null>(null);
	const [progress, setProgress] = useState<number>(0);
	const [currentTask, setCurrentTask] = useState<string>("Awaiting server initialization...");
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [logs, setLogs] = useState<string[]>([]);

	const addLog = (message: string) => {
		setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
	};

	useEffect(() => {
		// 1. Initialize the orchestrator INSIDE the effect
		const orchestrator = new SSEOrchestrator<PipelineEvents>({
			url: "http://localhost:4001",
			method: "GET",
		});

		// 2. Bind network state mutations straight to our UI badges
		orchestrator.onStatusChange((nextStatus) => {
			setStatus(nextStatus);
			console.log(nextStatus);

			addLog(`System status shifted to: ${nextStatus}`);
		});

		// 3. Register type-safe event hooks to update reactive states
		orchestrator.on("job_started", (data) => {
			setJobInfo({ id: data.jobId, name: data.task });
			setCurrentTask("Initializing processing pipelines...");
			addLog(`🏁 Pipeline Started: ${data.task} (${data.jobId})`);
		});

		orchestrator.on("step_progress", (data) => {
			setProgress(data.progress);
			setCurrentTask(data.name);
			addLog(`⏳ Progress: Step ${data.step} - ${data.name} (${data.progress}%)`);
		});

		orchestrator.on("artifact_ready", (data) => {
			setDownloadUrl(data.downloadUrl);
			addLog(`📂 Generated Artifact: ${data.type} available for download.`);
		});

		orchestrator.on("job_completed", (data) => {
			setProgress(100);
			setCurrentTask("Job finished cleanly.");
			addLog(`✅ Pipeline successfully completed in ${data.durationMs}ms.`);
			orchestrator.disconnect();
		});

		// 4. Ignite the socket engine connection
		orchestrator.connect();

		// 5. THE CRITICAL CLEANUP: Disconnect instantly if the component unmounts
		// This stops React Strict Mode from opening duplicate parallel network requests!
		return () => {
			addLog("Tearing down connection hooks...");
			orchestrator.disconnect();
		};
	}, []);

	// Helper map to style our connection indicator badge
	const badgeColors: Record<string, string> = {
		CONNECTED: "bg-green-500 text-white animate-pulse",
		CONNECTING: "bg-yellow-500 text-black",
		RETRYING: "bg-red-500 text-white animate-bounce",
		DISCONNECTED: "bg-gray-500 text-white",
	};

	return (
		<div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
			<div className="max-w-6xl mx-auto space-y-6">
				{/* Header Panel */}
				<div className="flex justify-between items-center border-b border-slate-800 pb-4">
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-white">SSE Orchestrator Hub</h1>
						<p className="text-slate-400 text-sm">Real-time distributed workflow monitor</p>
					</div>
					<span
						className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${badgeColors[status] || "bg-gray-500"}`}
					>
						{status}
					</span>
				</div>

				{/* Main Content Layout */}
				<div className="grid grid-cols-1 md:grid-cols-5 gap-6">
					{/* Visual Status Display */}
					<div className="md:col-span-3 bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6">
						<div>
							<h2 className="text-xl font-semibold text-white mt-1">
								{jobInfo ? jobInfo.name : "Waiting for Task..."}
							</h2>
							<p className="text-xs font-mono text-slate-500 mt-0.5">
								{jobInfo ? `ID: ${jobInfo.id}` : "No active pipeline sequence initialized"}
							</p>
						</div>

						{/* Animated Processing Meter */}
						<div className="space-y-2">
							<div className="flex justify-between text-sm font-mono">
								<span className="text-slate-300 truncate max-w-xs">{currentTask}</span>
								<span className="text-indigo-400 font-bold">{progress}%</span>
							</div>
							<div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-700">
								<div
									className="h-full bg-linear-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>

						{/* Contextual Action Link Trigger */}
						{downloadUrl && (
							<div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-lg flex justify-between items-center animate-fade-in">
								<span className="text-sm text-indigo-200">
									Production compilation package is ready.
								</span>
								<a
									href={downloadUrl}
									target="_blank"
									rel="noreferrer"
									className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-md transition-colors shadow-sm"
								>
									Download Artifact
								</a>
							</div>
						)}
					</div>

					{/* Technical Log Stream Console */}
					<div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col h-80 md:h-125 overflow-y-hidden md:col-span-2">
						<span className="text-xs font-mono uppercase tracking-widest text-slate-500 border-b border-slate-900 pb-2 mb-2 block">
							Live Telemetry Streams
						</span>
						<div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs text-slate-400 scrollbar-thin">
							{logs.map((log, index) => (
								<div key={index} className="border-l-2 border-slate-800 pl-2" title={log}>
									{log}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
