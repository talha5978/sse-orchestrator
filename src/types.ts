export type SSEEventMap = Record<string, any>;

export type SSEStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "RETRYING";

export type DynamicHeaders = Record<string, string>;
export type HeadersFactory = () => DynamicHeaders | Promise<DynamicHeaders>;

export interface SSEOrchestratorConfig {
	url: string;
	method?: "GET" | "POST";
	headers?: DynamicHeaders | HeadersFactory;
	body?: unknown;
	maxRetries?: number;
	initialRetryDelay?: number;
	maxRetryDelay?: number;
}

export type StatusCallback = (status: SSEStatus) => void;
export type EventCallback<T> = (data: T) => void;
