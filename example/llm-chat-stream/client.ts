import { SSEOrchestrator, type SSEMiddleware } from "../../dist/index.js";

interface AIEvents {
	token: { text: string };
	done: { totalTokens: number };
}

const orchestrator = new SSEOrchestrator<AIEvents>({
	url: "http://localhost:4000",
	method: "GET",
	maxRetryDelay: 2000,
});

const logCompletion: SSEMiddleware<AIEvents> = (event) => {
	if (event.type === "done") {
		console.log(`[Middleware Log] Closing out stream containing tokens.`);
	}
	return event;
};

orchestrator.use(logCompletion);

let outputText = "";

orchestrator.on("token", (payload) => {
	outputText += payload.text + " ";
	console.log(`\x1b[34m[Chunk Received]: ${payload.text} -> Current String: "${outputText}"\x1b[0m`);
});

orchestrator.on("done", (summary) => {
	console.log("✅ Stream finished completely!");
	console.log(`Total tokens rendered: ${summary.totalTokens}`);
	orchestrator.disconnect();
	process.exit(0);
});

orchestrator.onStatusChange((status) => {
	console.log(`[Status Change]: ${status}`);
});

orchestrator.connect();
