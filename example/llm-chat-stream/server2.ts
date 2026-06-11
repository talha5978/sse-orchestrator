/** packaged sdk: server implementation */

import http from "http";
import { SSEServerStream } from "../../dist/server/index.js";

// 1. Define shared full-stack types
interface ChatEvents {
	token: { text: string };
	done: { totalTokens: number };
}

export const tokens = ["The", "quick", "brown", "fox", "jumped", "over", "the", "lazy", "dog."];

const server = http.createServer((req, res) => {
	// 2. Intercept CORS Preflight Options requests first
	if (req.method === "OPTIONS") {
		res.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Last-Event-ID, last-event-id",
		});
		res.end();
		return;
	}

	// 3. Simple routing method guards
	if (req.method !== "GET" && req.method !== "POST") {
		res.writeHead(405, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Method Not Allowed" }));
		return;
	}

	// 4. Mount your universal server stream manager
	const stream = new SSEServerStream<ChatEvents>(req, res);

	// 5. Recovery Pointer Evaluation
	// Because the universal core tracks IDs as strings, parse it cleanly here for your logic
	let index = 0;
	if (stream.lastEventId !== null) {
		const parsedId = parseInt(stream.lastEventId, 10);
		index = !isNaN(parsedId) ? parsedId + 1 : 0;
	}

	console.log(`📡 Client connected. Starting from token index: ${index}`);

	// 🔥 DEFENSIVE GUARD: If the client attempts to reconnect but we are already done,
	// end the stream immediately. Never spin up zombie intervals for dead ranges.
	if (index >= tokens.length) {
		console.log("🏁 Client requested out-of-bounds pointer. Closing cycle cleanly.");
		stream.end({
			event: "done",
			data: { totalTokens: tokens.length },
		});
		return;
	}

	// 6. Execute your asynchronous business loop safely
	const interval = setInterval(() => {
		if (index < tokens.length) {
			stream.send({
				id: index,
				event: "token",
				data: { text: tokens[index] as string },
			});
			index++;
		} else {
			stream.end({
				event: "done",
				data: { totalTokens: tokens.length },
			});
			clearInterval(interval);
		}
	}, 400);

	// 7. Cleanup active processes if the client pulls the plug early
	req.on("close", () => {
		console.log("🔌 Connection closed by client. Halting background loops.");
		clearInterval(interval);
	});
});

server.listen(4000, () => {
	console.log("✅ Stream Engine running elegantly at http://localhost:4000");
});
