/** packaged sdk: server implementation */

import http from "http";
import { EventEmitter } from "events";
import { SSEServerStream } from "../../dist/server/index.js";
import type { JobEventMap } from "./types.js";

const globalJobBroker = new EventEmitter();

interface JobBrokerPayload {
	id: string;
	event: keyof JobEventMap;
	data: any;
}

/**
 * Background worker execution engine
 */
async function runRealBackgroundJob(jobId: string, startFromStep: number) {
	const notify = <K extends keyof JobEventMap>(id: string, event: K, data: JobEventMap[K]) => {
		globalJobBroker.emit(`update:${jobId}`, { id, event, data } as JobBrokerPayload);
	};

	console.log(`🛠️ [Worker Engine] Initializing execution pipeline at Step Checkpoint: ${startFromStep}`);

	// Step 0: Initialized
	if (startFromStep <= 0) {
		notify("0", "job_started", { jobId, task: "Production Asset Optimization" });
		await new Promise((resolve) => setTimeout(resolve, 800));
	}

	// Step 1: Image Scaling
	if (startFromStep <= 1) {
		notify("1", "step_progress", {
			step: 1,
			name: "Downscaling image buffers",
			progress: 33,
			status: "SUCCESS",
		});
		await new Promise((resolve) => setTimeout(resolve, 2500));
	}

	// Step 2: S3 Uploading
	if (startFromStep <= 2) {
		notify("2", "step_progress", {
			step: 2,
			name: "Uploading artifacts to S3 bucket",
			progress: 66,
			status: "SUCCESS",
		});
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}

	// Step 3: Generation complete
	if (startFromStep <= 3) {
		notify("3", "artifact_ready", {
			artifactId: "img_991",
			type: "OPTIMIZED_IMG",
			downloadUrl: "https://cdn.production.com/img_991.png",
		});
		await new Promise((resolve) => setTimeout(resolve, 600));
	}

	// Step 4: Finished
	if (startFromStep <= 4) {
		notify("4", "job_completed", { jobId, rowsProcessed: 1, durationMs: 5400 });
	}
}

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
	// Keep CORS preflight checks detached from your target SSE pipeline
	if (req.method === "OPTIONS") {
		res.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Last-Event-ID, Content-Type, Cache-Control, Authorization",
			"Access-Control-Max-Age": "86400",
		});
		res.end();
		return;
	}

	const jobId = "job_production_101";

	// 2. Instantiate your custom wrapper. This automatically injects content headers,
	// sets up proxy-cache buffers, and sends the client execution warming padding string (":\n\n").
	const stream = new SSEServerStream<JobEventMap>(req, res, {
		allowOrigin: "*",
	});

	// 3. Leverage the framework's internal case-insulated parsing mechanisms directly
	const startFromIndex = stream.lastEventId ? parseInt(stream.lastEventId, 10) + 1 : 0;

	console.log(`📡 Client attached to ${jobId}. Resuming from offset checkpoint: ${startFromIndex}`);

	const handleJobUpdate = (update: JobBrokerPayload) => {
		const currentStepIndex = parseInt(update.id, 10);

		// Filter out redundant messages when fast-forwarding from a historical checkpoint hook
		if (currentStepIndex >= startFromIndex) {
			if (update.event === "job_completed") {
				globalJobBroker.off(`update:${jobId}`, handleJobUpdate);

				// 4. Use stream.end() to transmit terminal data frames and close the response pipe cleanly
				stream.end({
					event: update.event,
					data: update.data,
					id: update.id,
				});
				return;
			}

			// 5. Use type-safe send() methods for all continuous progress states
			stream.send({
				event: update.event,
				data: update.data,
				id: update.id,
			});
		}
	};

	globalJobBroker.on(`update:${jobId}`, handleJobUpdate);

	// Bootstrap or resume background worker logic
	runRealBackgroundJob(jobId, startFromIndex);

	req.on("close", () => {
		console.log(`🔌 Stream disconnected for client channel: ${jobId}`);
		globalJobBroker.off(`update:${jobId}`, handleJobUpdate);
	});
});

server.listen(4001, () => {
	console.log("🚀 Event-Driven Production Server active at http://localhost:4001");
});
