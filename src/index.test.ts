import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SSEOrchestrator } from "./index.js";

describe("SSEOrchestrator - Unit Engine Verification", () => {
	const targetUrl = "https://api.test-endpoint.com/v1/stream";

	interface MockChannels {
		token: { text: string };
		done: { total: number };
		error: { message: string };
	}

	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function createMockReadableStream(chunks: string[]) {
		const encoder = new TextEncoder();
		let currentChunkIndex = 0;

		return new ReadableStream({
			pull(controller) {
				if (currentChunkIndex < chunks.length) {
					const chunkStr = chunks[currentChunkIndex++];
					if (chunkStr) {
						controller.enqueue(encoder.encode(chunkStr));
					}
				} else {
					controller.close();
				}
			},
		});
	}

	it("should successfully establish connection and pass type-safe events down listeners", async () => {
		const sseChunks = [
			'event: token\ndata: {"text": "Hello"}\n\n',
			'event: token\ndata: {"text": " World"}\n\n',
			'event: done\ndata: {"total": 2}\n\n',
		];

		const mockStream = createMockReadableStream(sseChunks);

		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			body: mockStream,
		} as unknown as Response);

		const orchestrator = new SSEOrchestrator<MockChannels>({ url: targetUrl });

		let compiledText = "";
		let isFinished = false;

		orchestrator.on("token", (payload) => {
			compiledText += payload.text;
		});

		const streamCompletionPromise = new Promise<void>((resolve) => {
			orchestrator.on("done", (payload) => {
				expect(payload.total).toBe(2);
				isFinished = true;
				resolve();
			});
		});

		await orchestrator.connect();
		expect(orchestrator.getStatus()).toBe("CONNECTED");

		await streamCompletionPromise;

		expect(compiledText).toBe("Hello World");
		expect(isFinished).toBe(true);
	});

	it("should explicitly terminate stream execution when disconnect() is triggered", async () => {
		const infiniteChunks = ['event: token\ndata: {"text": "Looping"}\n\n'];
		const mockStream = createMockReadableStream(infiniteChunks);

		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			body: mockStream,
		} as unknown as Response);

		const orchestrator = new SSEOrchestrator<MockChannels>({ url: targetUrl });

		await orchestrator.connect();
		expect(orchestrator.getStatus()).toBe("CONNECTED");

		orchestrator.disconnect();
		expect(orchestrator.getStatus()).toBe("DISCONNECTED");
	});

	it("should initiate exponential backoff reconnection procedures if network layers fail", async () => {
		// 1. Force the initial fetch connection attempt to fail
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("[TEST] Network Interrupted Failure"));

		// 2. Setup the successful secondary stream for the recovery hook
		const recoveryChunks = ['event: token\ndata: {"text": "Recovered"}\n\n'];
		const recoveryStream = createMockReadableStream(recoveryChunks);

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			body: recoveryStream,
		} as unknown as Response);

		const orchestrator = new SSEOrchestrator<MockChannels>({
			url: targetUrl,
			initialRetryDelay: 1000,
			maxRetries: 3,
		});

		let receivedData = "";
		orchestrator.on("token", (payload) => {
			receivedData = payload.text;
		});

		// Track lifecycle history to catch quick status changes deterministically
		const statusHistory: string[] = [];
		orchestrator.onStatusChange((status) => {
			statusHistory.push(status);
		});

		await orchestrator.connect();
		expect(orchestrator.getStatus()).toBe("RETRYING");

		// Fast-forward clocks to bypass backoff + random jitter window
		await vi.advanceTimersByTimeAsync(3500);

		// Assert that the engine successfully achieved a CONNECTED state during recovery execution
		expect(statusHistory).toContain("CONNECTED");
		expect(receivedData).toBe("Recovered");
	});
});
