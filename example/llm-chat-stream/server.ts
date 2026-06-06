import http from "http";

export const tokens = ["The", "quick", "brown", "fox", "jumped", "over", "the", "lazy", "dog."];

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"Access-Control-Allow-Origin": "*",
	});

	// Check if the client is resuming from an outage
	const lastEventId =
		req.headers["Last-Event-ID"] || req.headers["last-event-id"] || req.headers["LAST-EVENT-ID"];
	let index = lastEventId ? parseInt(lastEventId as string, 10) + 1 : 0;

	console.log(`📡 Client connected. Starting stream from token index: ${index}`);

	const interval = setInterval(() => {
		if (index < tokens.length) {
			res.write(`id: ${index}\n`);
			res.write(`event: token\ndata: ${JSON.stringify({ text: tokens[index] })}\n\n`);
			index++;
		} else {
			res.write(`event: done\ndata: ${JSON.stringify({ totalTokens: tokens.length })}\n\n`);
			clearInterval(interval);
			res.end();
		}
	}, 400);

	req.on("close", () => {
		clearInterval(interval);
	});
});

server.listen(4000, () => {
	console.log("✅ Mock Stream Server running at http://localhost:4000");
});
