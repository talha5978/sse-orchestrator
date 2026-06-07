import { useEffect, useRef, useState } from "react";
import { SSEOrchestrator } from "../core.js";
import type { SSEOrchestratorConfig, SSEStatus } from "../types.js";

export function useSSEOrchestrator<T extends Record<string, any>>(config: SSEOrchestratorConfig) {
	const orchestratorRef = useRef<SSEOrchestrator<T> | null>(null);

	if (!orchestratorRef.current) {
		orchestratorRef.current = new SSEOrchestrator<T>(config);
	}

	const orchestrator = orchestratorRef.current;

	const [status, setStatus] = useState<SSEStatus>("DISCONNECTED");

	useEffect(() => {
		const unsubscribeStatus = orchestrator.onStatusChange((newStatus) => {
			setStatus(newStatus);
		});

		orchestrator.connect();

		return () => {
			unsubscribeStatus();
			orchestrator.disconnect();
		};
	}, [orchestrator]);

	return { orchestrator, status };
}
