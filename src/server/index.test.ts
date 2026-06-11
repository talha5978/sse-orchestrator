import type { IncomingMessage, ServerResponse } from "http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SSEServerStream } from "./core";

describe("SSEServerStream - Unit Verification Engine", () => {
	let mockReq: Partial<IncomingMessage>;
	let mockRes: Partial<ServerResponse> & {
		_writtenChunks: string[];
		_headers: Record<string, string>;
	};

	beforeEach(() => {
		// Reset request mock configuration
		mockReq = {
			headers: {},
		};

		// Reset response mock state with tracking capabilities
		mockRes = {
			headersSent: false,
			_writtenChunks: [],
			_headers: {},
			setHeader: vi.fn(function (this: any, key: string, value: string) {
				this._headers[key.toLowerCase()] = value;
				return this;
			}),
			getHeader: vi.fn(function (this: any, key: string) {
				return this._headers[key.toLowerCase()];
			}),
			write: vi.fn(function (this: any, chunk: any) {
				this._writtenChunks.push(String(chunk));
				return true;
			}),
			end: vi.fn() as unknown as ServerResponse["end"],
			flushHeaders: vi.fn(),
		};
	});

	it("should correctly establish SSE response parameters and emit initial padding", () => {
		const stream = new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);

		// Assert critical SSE specification headers are bound
		expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
		expect(mockRes.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform");
		expect(mockRes.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
		expect(mockRes.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");

		// Verify the response pipeline successfully flushed headers
		expect(mockRes.flushHeaders).toHaveBeenCalled();

		// The stream must transmit initial comment padding immediately to warm up clients
		expect(mockRes._writtenChunks[0]).toBe(":\n\n");
	});

	it("should integrate custom options headers and preserve pre-existing host configurations", () => {
		// Pre-configure an application origin to mock upstream proxy middlewares
		mockRes._headers["access-control-allow-origin"] = "https://example.com";

		new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse, {
			allowOrigin: "*",
			customHeaders: {
				"X-Custom-Trace-Id": "tx-10045",
			},
		});

		// It should NOT overwrite a pre-configured Access-Control-Allow-Origin header
		expect(mockRes._headers["access-control-allow-origin"]).toBe("https://example.com");

		// It should append custom user configurations accurately
		expect(mockRes._headers["x-custom-trace-id"]).toBe("tx-10045");
	});

	it("should handle extraction of state recovery pointers across multiple casing styles", () => {
		mockReq.headers = { "last-event-id": "ulid-01J18V6" };

		const lowercaseStream = new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);
		expect(lowercaseStream.lastEventId).toBe("ulid-01J18V6");

		// Verify fallback parsing mechanisms for uppercase variants
		mockReq.headers = { "Last-Event-ID": "timestamp-1719" };
		const uppercaseStream = new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);
		expect(uppercaseStream.lastEventId).toBe("timestamp-1719");
	});

	it("should serialize payloads into strict standard wire formats", () => {
		interface TestEvents {
			update: { value: number; status: string };
		}

		const stream = new SSEServerStream<TestEvents>(mockReq as IncomingMessage, mockRes as ServerResponse);

		// Clear initial padding chunk out of verification queue
		mockRes._writtenChunks = [];

		stream.send({
			event: "update",
			data: { value: 42, status: "healthy" },
			id: "msg-001",
		});

		// Combine chunks together to match exact block delivery expectation
		const compiledWireOutput = mockRes._writtenChunks.join("");

		expect(compiledWireOutput).toBe(
			"id: msg-001\n" + "event: update\n" + 'data: {"value":42,"status":"healthy"}\n\n',
		);
	});

	it("should handle clean stream closures with optional trailing data payloads", () => {
		interface GlobalEvents {
			close: { reason: string };
		}

		const stream = new SSEServerStream<GlobalEvents>(
			mockReq as IncomingMessage,
			mockRes as ServerResponse,
		);

		mockRes._writtenChunks = [];

		stream.end({
			event: "close",
			data: { reason: "Execution context completed gracefully" },
		});

		const compiledWireOutput = mockRes._writtenChunks.join("");

		// Check formatting structure
		expect(compiledWireOutput).toBe(
			"event: close\n" + 'data: {"reason":"Execution context completed gracefully"}\n\n',
		);

		// Ensure the stream explicitly commands the server engine to shut down connection
		expect(mockRes.end).toHaveBeenCalled();
	});

	it("should skip header injection entirely if headers have already been sent down the wire", () => {
		(mockRes as any).headersSent = true;

		new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);

		// It should NOT attempt to append headers or overwrite properties
		expect(mockRes.setHeader).not.toHaveBeenCalled();
		// The structural warmup sequence must still fire safely
		expect(mockRes._writtenChunks[0]).toBe(":\n\n");
	});

	it("should extract the first element if the Last-Event-ID header is parsed as an array", () => {
		// Mock duplicate or proxy-appended header array layout
		mockReq.headers = { "last-event-id": ["ulid-primary", "ulid-secondary"] };

		const stream = new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);

		expect(stream.lastEventId).toBe("ulid-primary");
	});

	it("should serialize payloads without an id string line when the parameter is omitted", () => {
		const stream = new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);
		mockRes._writtenChunks = [];

		stream.send({
			event: "heartbeat",
			data: { active: true },
		});

		const compiledWireOutput = mockRes._writtenChunks.join("");

		// Assert no 'id:' row sneaks onto the wire
		expect(compiledWireOutput).toBe("event: heartbeat\n" + 'data: {"active":true}\n\n');
	});

	it("should terminate the connection cleanly when end() is executed with no trailing event parameters", () => {
		const stream = new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);
		mockRes._writtenChunks = [];

		stream.end();

		// No new chunks should hit the pipeline buffer
		expect(mockRes._writtenChunks.length).toBe(0);
		// The connection socket closure directive must fire
		expect(mockRes.end).toHaveBeenCalled();
	});

	it("should prioritize calling custom compression middleware flush methods over native flushHeaders", () => {
		const mockCustomFlush = vi.fn();
		// Dynamically inject a custom flush pipeline handler (simulating Express compression hooks)
		(mockRes as any).flush = mockCustomFlush;

		new SSEServerStream(mockReq as IncomingMessage, mockRes as ServerResponse);

		// It should route via the custom compression middleware hook
		expect(mockCustomFlush).toHaveBeenCalled();
		// It must bypass the native backup flusher
		expect(mockRes.flushHeaders).not.toHaveBeenCalled();
	});
});
