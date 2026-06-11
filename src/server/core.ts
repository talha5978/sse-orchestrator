import type { IncomingMessage, ServerResponse } from "http";

export interface SSEServerOptions {
	allowOrigin?: string;
	customHeaders?: Record<string, string>;
}

export class SSEServerStream<TEventMap extends Record<string, any>> {
	private res: ServerResponse;
	public lastEventId: string | null = null;

	constructor(req: IncomingMessage, res: ServerResponse, options: SSEServerOptions = {}) {
		this.res = res;

		const rawId = req.headers["last-event-id"] || req.headers["Last-Event-ID"];
		this.lastEventId = (rawId ? (Array.isArray(rawId) ? rawId[0] : rawId) : null) ?? null;

		if (!this.res.headersSent) {
			this.res.setHeader("Content-Type", "text/event-stream");
			this.res.setHeader("Cache-Control", "no-cache, no-transform"); // 'no-transform' discourages aggressive proxy caching
			this.res.setHeader("Connection", "keep-alive");

			this.res.setHeader("X-Accel-Buffering", "no");

			// Only attach fallback CORS if the host application hasn't already configured it
			if (!this.res.getHeader("Access-Control-Allow-Origin")) {
				this.res.setHeader("Access-Control-Allow-Origin", options.allowOrigin || "*");
				this.res.setHeader(
					"Access-Control-Allow-Headers",
					"Content-Type, Last-Event-ID, last-event-id",
				);
				this.res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			}

			// Inject any custom user headers
			if (options.customHeaders) {
				Object.entries(options.customHeaders).forEach(([key, val]) => {
					this.res.setHeader(key, val);
				});
			}

			this.res.statusCode = 200;
		}

		// Send immediate comment padding to warm up client-side stream readers
		this.res.write(":\n\n");
		this.flushResponse();
	}

	/**
	 * Dispatches a type-safe event message down the stream channel
	 */
	public send<K extends keyof TEventMap>(config: {
		event: K;
		data: TEventMap[K];
		id?: number | string;
	}): void {
		if (config.id !== undefined) {
			this.res.write(`id: ${String(config.id)}\n`);
		}
		this.res.write(`event: ${String(config.event)}\n`);
		this.res.write(`data: ${JSON.stringify(config.data)}\n\n`);

		// Force transmission down the wire immediately
		this.flushResponse();
	}

	/**
	 * Orderly termination of the stream sequence
	 */
	public end<K extends keyof TEventMap>(finalEvent?: {
		event: K;
		data: TEventMap[K];
		id?: number | string;
	}): void {
		if (finalEvent) {
			this.send(finalEvent);
		}
		this.res.end();
	}

	/**
	 * Internal helper to bypass compression buffers (Express 'compression' middleware compatibility)
	 */
	private flushResponse(): void {
		// If an external compression middleware injected a flush method, utilize it
		if (typeof (this.res as any).flush === "function") {
			(this.res as any).flush();
		} else if (typeof this.res.flushHeaders === "function") {
			this.res.flushHeaders();
		}
	}
}
