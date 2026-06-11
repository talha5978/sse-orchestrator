import { SSEOrchestrator } from "../../dist/index.js";
import type { JobEventMap } from "./types.js";

const orchestrator = new SSEOrchestrator<JobEventMap>({
	url: "http://localhost:4001",
	method: "GET",
});

// Hook into specific, contextual channels
orchestrator.on("job_started", (payload) => {
	console.log(`\n🏁 [STARTED] Job ID: ${payload.jobId} initialized for task: "${payload.task}"`);
});

orchestrator.on("step_progress", (payload) => {
	console.log(
		`⏳ [PROGRESS] Step ${payload.step}: ${payload.name} -> ${payload.progress}% Complete [${payload.status}]`,
	);
});

orchestrator.on("artifact_ready", (payload) => {
	console.log(`📂 [ARTIFACT] Generation Finished! Type: ${payload.type}`);
	console.log(`🔗 [DOWNLOAD LINK]: ${payload.downloadUrl}`);
});

orchestrator.on("job_completed", (payload) => {
	console.log(
		`✅ [COMPLETED] Success! Total rows synced: ${payload.rowsProcessed} inside ${payload.durationMs}ms.\n`,
	);
	orchestrator.disconnect();
	process.exit(0);
});

// Track underlying system lifecycles in parallel
orchestrator.onStatusChange((status) => {
	if (status === "RETRYING")
		console.log("⚠️ [Network Drop] Pipeline disconnected! Spinning up recovery loops...");
	if (status === "CONNECTED")
		console.log("⚡ [Pipeline Connected] Streaming live automation event logs...");
});

orchestrator.connect();
