import express from "express";
import { EventEmitter } from "events";
import { SSEServerStream } from "../../../../dist/server/index.js";

interface JobEventMap {
	job_started: { jobId: string; task: string };
	step_progress: { step: number; name: string; progress: number; status: string };
	artifact_ready: { artifactId: string; type: string; downloadUrl: string };
	job_completed: { jobId: string; rowsProcessed: number; durationMs: number };
}

interface JobBrokerPayload {
	id: string;
	event: keyof JobEventMap;
	data: any;
}

const globalJobBroker = new EventEmitter();
const app = express();
const PORT = 4001;

/**
 * Background worker execution engine (Unchanged)
 */
async function runRealBackgroundJob(jobId: string, startFromStep: number) {
	const notify = <K extends keyof JobEventMap>(id: string, event: K, data: JobEventMap[K]) => {
		globalJobBroker.emit(`update:${jobId}`, { id, event, data } as JobBrokerPayload);
	};

	console.log(`🛠️ [Worker Engine] Initializing execution pipeline at Step Checkpoint: ${startFromStep}`);

	if (startFromStep <= 0) {
		notify("0", "job_started", { jobId, task: "Production Asset Optimization" });
		await new Promise((resolve) => setTimeout(resolve, 800));
	}
	if (startFromStep <= 1) {
		notify("1", "step_progress", {
			step: 1,
			name: "Downscaling image buffers",
			progress: 33,
			status: "SUCCESS",
		});
		await new Promise((resolve) => setTimeout(resolve, 2500));
	}
	if (startFromStep <= 2) {
		notify("2", "step_progress", {
			step: 2,
			name: "Uploading artifacts to S3 bucket",
			progress: 66,
			status: "SUCCESS",
		});
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
	if (startFromStep <= 3) {
		notify("3", "artifact_ready", {
			artifactId: "img_991",
			type: "OPTIMIZED_IMG",
			downloadUrl: "https://cdn.production.com/img_991.png",
		});
		await new Promise((resolve) => setTimeout(resolve, 600));
	}
	if (startFromStep <= 4) {
		notify("4", "job_completed", { jobId, rowsProcessed: 3, durationMs: 5400 });
	}
}

app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Last-Event-ID, Content-Type, Cache-Control, Authorization",
	);
	res.setHeader("Access-Control-Max-Age", "86400");

	if (req.method === "OPTIONS") {
		res.sendStatus(204);
		return;
	}
	next();
});

// 3. Target SSE Streaming Route Endpoint
app.get("/", (req, res) => {
	const jobId = "job_production_" + Math.floor(Math.random() * 10000);

	// Pass the Express req and res down into your native engine core safely
	const stream = new SSEServerStream<JobEventMap>(req, res, {
		allowOrigin: "*",
	});

	const startFromIndex = stream.lastEventId ? parseInt(stream.lastEventId, 10) + 1 : 0;
	console.log(`📡 Express Client attached to ${jobId}. Resuming from checkpoint: ${startFromIndex}`);

	const handleJobUpdate = (update: JobBrokerPayload) => {
		const currentStepIndex = parseInt(update.id, 10);

		if (currentStepIndex >= startFromIndex) {
			if (update.event === "job_completed") {
				globalJobBroker.off(`update:${jobId}`, handleJobUpdate);

				stream.end({
					event: update.event,
					data: update.data,
					id: update.id,
				});
				return;
			}

			stream.send({
				event: update.event,
				data: update.data,
				id: update.id,
			});
		}
	};

	globalJobBroker.on(`update:${jobId}`, handleJobUpdate);

	// Run background operations concurrently
	runRealBackgroundJob(jobId, startFromIndex);

	// Handle abrupt client exit close events
	req.on("close", () => {
		console.log(`🔌 Express Stream disconnected for client channel: ${jobId}`);
		globalJobBroker.off(`update:${jobId}`, handleJobUpdate);
	});
});

app.listen(PORT, () => {
	console.log(`🚀 Express Event-Driven Production Server active at http://localhost:${PORT}`);
});
