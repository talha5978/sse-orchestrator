import http from "http";
import { EventEmitter } from "events";

const globalJobBroker = new EventEmitter();

interface JobUpdate {
	id: string;
	event: string;
	data: object;
}

/**
 * An upgraded background worker that accepts a startup checkpoint step.
 * If the process crashes, it can reboot and skip directly to the uncompleted phases.
 */
async function runRealBackgroundJob(jobId: string, startFromStep: number) {
	const notify = (id: string, event: string, data: object) => {
		globalJobBroker.emit(`update:${jobId}`, { id, event, data });
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

	// Step 2: S3 Uploading (If server crashed at Step 1, execution resumes right here!)
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
	console.log(req.method);

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

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"Access-Control-Allow-Origin": "*",
	});

	const jobId = "job_production_101";

	const lastEventId =
		req.headers["Last-Event-ID"] || req.headers["last-event-id"] || req.headers["LAST-EVENT-ID"];
	const startFromIndex = lastEventId ? parseInt(lastEventId as string, 10) + 1 : 0;

	console.log(`📡 Client attached to ${jobId}. Resuming from offset checkpoint: ${startFromIndex}`);

	const handleJobUpdate = (update: JobUpdate) => {
		const currentStepIndex = parseInt(update.id, 10);

		if (currentStepIndex >= startFromIndex) {
			res.write(`id: ${update.id}\n`);
			res.write(`event: ${update.event}\ndata: ${JSON.stringify(update.data)}\n\n`);
		}

		if (update.event === "job_completed") {
			globalJobBroker.off(`update:${jobId}`, handleJobUpdate);
			res.end();
		}
	};

	globalJobBroker.on(`update:${jobId}`, handleJobUpdate);

	// If the server process died and came back, it uses this parameter to fast-forward.
	runRealBackgroundJob(jobId, startFromIndex);

	req.on("close", () => {
		globalJobBroker.off(`update:${jobId}`, handleJobUpdate);
	});
});

server.listen(4001, () => {
	console.log("🚀 Event-Driven Production Server active at http://localhost:4001");
});
