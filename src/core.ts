import type {
	SSEEventMap,
	SSEOrchestratorConfig,
	SSEStatus,
	StatusCallback,
	EventCallback,
} from "./types.js";

export class SSEOrchestrator<T extends SSEEventMap> {
	private readonly url: string;
	private readonly method: "GET" | "POST";
	private readonly headersOption?: SSEOrchestratorConfig["headers"];
	private readonly body?: unknown;

	private readonly maxRetries: number;
	private readonly initialRetryDelay: number;
	private readonly maxRetryDelay: number;

	private status: SSEStatus = "DISCONNECTED";
	private retryCount = 0;
	private lastEventId: string | null = null;
	private abortController: AbortController | null = null;
	private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// Dedicated, isolated registries to prevent structural type pollution
	private readonly listeners: Map<string, Set<EventCallback<any>>> = new Map();
	private readonly statusListeners: Set<StatusCallback> = new Set();

	constructor(config: SSEOrchestratorConfig) {
		this.url = config.url;
		this.method = config.method || "GET";
		this.headersOption = config.headers;
		this.body = config.body;
		this.maxRetries = config.maxRetries ?? 5;
		this.initialRetryDelay = config.initialRetryDelay ?? 2000;
		this.maxRetryDelay = config.maxRetryDelay ?? 100000;
	}

	private setStatus(newStatus: SSEStatus): void {
		this.status = newStatus;
		this.statusListeners.forEach((callback) => callback(newStatus));
	}

	public getStatus(): SSEStatus {
		return this.status;
	}

	public onStatusChange(callback: StatusCallback): () => void {
		this.statusListeners.add(callback);
		callback(this.status);
		return () => {
			this.statusListeners.delete(callback);
		};
	}

	/**
	 * Registers a strongly-typed event consumer matching safe key shapes inferred from T
	 */
	public on<K extends keyof T>(event: K, callback: EventCallback<T[K]>): () => void {
		const eventKey = String(event);
		let eventSet = this.listeners.get(eventKey);
		if (!eventSet) {
			eventSet = new Set<EventCallback<any>>();
			this.listeners.set(eventKey, eventSet);
		}
		eventSet.add(callback);

		return () => {
			const currentSet = this.listeners.get(eventKey);
			if (currentSet) {
				currentSet.delete(callback);
				if (currentSet.size === 0) {
					this.listeners.delete(eventKey);
				}
			}
		};
	}

	private emit(event: string, data: any): void {
		const eventSet = this.listeners.get(event);
		if (eventSet) {
			eventSet.forEach((callback) => callback(data));
		}
	}

	/**
	 * Orchestrates the active connection loop over HTTP stream pathways
	 */
	public async connect(): Promise<void> {
		if (this.status === "CONNECTED" || this.status === "CONNECTING") {
			return;
		}

		if (this.reconnectTimeoutId) {
			clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = null;
		}

		this.abortController = new AbortController();
		this.setStatus("CONNECTING");

		try {
			let resolvedHeaders: Record<string, string> = {};
			if (typeof this.headersOption === "function") {
				resolvedHeaders = await this.headersOption();
			} else if (this.headersOption) {
				resolvedHeaders = this.headersOption;
			}

			const headers = new Headers({
				...resolvedHeaders,
				Accept: "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			});

			if (this.lastEventId) {
				headers.set("Last-Event-ID", this.lastEventId);
			}

			const fetchOptions: RequestInit = {
				method: this.method,
				headers,
				signal: this.abortController.signal,
			};

			if (this.method === "POST") {
				if (!headers.has("Content-Type")) {
					headers.set("Content-Type", "application/json");
				}
				fetchOptions.body =
					typeof this.body === "object" ? JSON.stringify(this.body) : String(this.body);
			}

			const response = await globalThis.fetch(this.url, fetchOptions);

			if (!response.ok) {
				throw new Error(`SSE Connection failed with HTTP status code: ${response.status}`);
			}

			if (!response.body) {
				throw new Error(
					"SSE initialization aborted: Response body execution path is missing or unreadable.",
				);
			}

			this.setStatus("CONNECTED");
			this.retryCount = 0;

			this.consumeStream(response.body.getReader());
		} catch (error) {
			if (this.abortController?.signal.aborted) {
				this.setStatus("DISCONNECTED");
				return;
			}
			this.scheduleReconnection();
		}
	}

	/**
	 * Processes chunked network fragments asynchronously to ensure zero data boundary loss
	 */
	private async consumeStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
		const decoder = new TextDecoder("utf-8");
		let buffer = "";

		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				// Handle line boundary cross-platform variations (\r\n and \n)
				const lines = buffer.split(/\r?\n/);

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (!trimmedLine) continue;
					if (trimmedLine.startsWith("id:")) {
						this.lastEventId = trimmedLine.replace("id:", "").trim();
						continue;
					}
				}

				// Retain the final un-terminated block segment in the buffer array
				buffer = lines.pop() ?? "";

				this.parseBufferedLines(lines);
			}

			// If the stream ended gracefully but left dangling values, clear them out
			if (this.status === "CONNECTED") {
				this.scheduleReconnection();
			}
		} catch (error) {
			if (!this.abortController?.signal.aborted) {
				this.scheduleReconnection();
			}
		} finally {
			try {
				reader.releaseLock();
			} catch {
				// Suppress reference assignment lock errors on hard terminations
			}
		}
	}

	private parseBufferedLines(lines: string[]): void {
		let currentEvent = "message";
		let currentData = "";

		for (const line of lines) {
			const trimmed = line.trim();

			// Empty transmission frame marks messages completion phase
			if (trimmed === "") {
				if (currentData !== "") {
					let emittedPayload: any = currentData;
					try {
						if (
							(currentData.startsWith("{") && currentData.endsWith("}")) ||
							(currentData.startsWith("[") && currentData.endsWith("]"))
						) {
							emittedPayload = JSON.parse(currentData);
						}
					} catch {
						// Revert back safely onto standard string outputs if validation fails
					}
					this.emit(currentEvent, emittedPayload);
					currentData = "";
				}
				currentEvent = "message";
				continue;
			}

			if (trimmed.startsWith(":")) {
				continue; // Filter active gateway connection heartbeats safely
			}

			const colonIndex = trimmed.indexOf(":");
			let field = trimmed;
			let value = "";

			if (colonIndex !== -1) {
				field = trimmed.slice(0, colonIndex).trim();
				value = trimmed.slice(colonIndex + 1).trim();
			}

			switch (field) {
				case "event":
					currentEvent = value;
					break;
				case "data":
					currentData = currentData === "" ? value : `${currentData}\n${value}`;
					break;
				case "id":
					this.lastEventId = value;
					break;
				default:
					break;
			}
		}
	}

	private scheduleReconnection(): void {
		if (this.retryCount >= this.maxRetries) {
			this.setStatus("DISCONNECTED");
			this.emit("error", {
				message: "Max recovery connection counts exhausted. Connection pipeline suspended.",
			});
			return;
		}

		this.setStatus("RETRYING");
		this.retryCount++;

		// Standard Full-Jitter Exponential Backoff Calculation
		const calculatedBackoff = Math.min(
			this.maxRetryDelay,
			this.initialRetryDelay * Math.pow(2, this.retryCount),
		);
		const randomizedJitter = Math.random() * 1000;
		const finalRetryDelay = calculatedBackoff + randomizedJitter;

		this.reconnectTimeoutId = setTimeout(() => {
			this.connect();
		}, finalRetryDelay);
	}

	/**
	 * Explicitly closes connections and tears down all active macro timeout cycles
	 */
	public disconnect(): void {
		if (this.reconnectTimeoutId) {
			clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = null;
		}
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.setStatus("DISCONNECTED");
		this.retryCount = 0;
	}
}
