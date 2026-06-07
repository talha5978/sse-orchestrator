import { useEffect, useRef } from "react";
import type { SSEOrchestrator } from "../../core.js";
import type { SSEEventMap } from "../../types.js";

export function useSSEEvent<T extends SSEEventMap, K extends keyof T>(
	orchestrator: SSEOrchestrator<T>,
	eventName: K,
	callback: (data: T[K]) => void,
) {
	const savedCallback = useRef(callback);

	useEffect(() => {
		savedCallback.current = callback;
	}, [callback]);

	useEffect(() => {
		const handler = (data: T[K]) => {
			savedCallback.current(data);
		};

		const unsubscribe = orchestrator.on(eventName, handler);

		return () => {
			unsubscribe();
		};
	}, [orchestrator, eventName]);
}
