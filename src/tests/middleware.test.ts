import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSEOrchestrator } from "../core";

interface TestEvents {
	message: { text: string };
	done: { total: number };
}

describe("SSEOrchestrator Middleware Engine", () => {
	let orchestrator: SSEOrchestrator<TestEvents>;

	// Helper to mock an HTTP SSE stream response
	const mockReadableStream = (chunks: string[]) => {
		const encoder = new TextEncoder();
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				for (const chunk of chunks) {
					yield encoder.encode(chunk);
				}
			},
		};

		vi.spyOn(global, "fetch").mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ "content-type": "text/event-stream" }),
			body: asyncIterable,
		} as Response);
	};

	beforeEach(() => {
		orchestrator = new SSEOrchestrator<TestEvents>({ url: "http://localhost:4000" });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should successfully mutate event payload data inside middleware", async () => {
		mockReadableStream(['event: message\ndata: {"text":"hello"}\n\n']);

		// 1. Register mutating middleware
		orchestrator.use((event) => {
			if (event.type === "message") {
				event.data.text = event.data.text.toUpperCase() + " FAAH..";
			}
			return event;
		});

		// 2. Validate down-stream subscription receives mutated value
		const messagePromise = new Promise((resolve) => {
			orchestrator.on("message", (payload) => {
				resolve(payload.text);
			});
		});

		orchestrator.connect();
		await expect(messagePromise).resolves.toBe("HELLO FAAH..");
	});

	it("should support functional method chaining", async () => {
		mockReadableStream(['event: message\ndata: {"text":"ping"}\n\n']);
		const executionOrder: string[] = [];

		// Validate builder pattern chaining sequence
		orchestrator
			.use((event) => {
				executionOrder.push("mid1");
				return event;
			})
			.use((event) => {
				executionOrder.push("mid2");
				return event;
			});

		const messagePromise = new Promise((resolve) => {
			orchestrator.on("message", () => resolve(executionOrder));
		});

		orchestrator.connect();
		await expect(messagePromise).resolves.toEqual(["mid1", "mid2"]);
	});

	it("should completely drop events if a middleware returns null or false", async () => {
		mockReadableStream(['event: message\ndata: {"text":"invisible"}\n\n']);

		// Middleware cancels message distribution completely
		orchestrator.use(() => null);

		const emitSpy = vi.fn();
		orchestrator.on("message", emitSpy);

		orchestrator.connect();

		// Allow microtasks to process stream buffer
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(emitSpy).not.toHaveBeenCalled();
	});

	it("should gracefully eject registered middlewares by reference", async () => {
		mockReadableStream(['event: message\ndata: {"text":"test"}\n\n']);

		const traceCollector: string[] = [];
		const targetedMiddleware = (event: any) => {
			traceCollector.push("executed");
			return event;
		};

		orchestrator.use(targetedMiddleware);
		orchestrator.ejectMiddleware(targetedMiddleware); // Eject before runtime

		orchestrator.on("message", () => {});
		orchestrator.connect();

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(traceCollector).toHaveLength(0); // Middleware was wiped from stack
	});

	it("should insulate stream consumption from crashing if a middleware throws", async () => {
		mockReadableStream(['event: message\ndata: {"text":"survivor"}\n\n']);

		// Broken middleware throws a runtime exception
		orchestrator.use(() => {
			throw new Error("[TEST] Unexpected crash simulation");
		});

		const messagePromise = new Promise((resolve) => {
			orchestrator.on("message", (payload) => resolve(payload.text));
		});

		orchestrator.connect();
		// The stream loop should bypass the error and still trigger downstream hooks
		await expect(messagePromise).resolves.toBe("survivor");
	});
});
