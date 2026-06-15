import { useEffect, useRef } from "react";
import { SSEMiddleware } from "../../types.js";
import type { SSEOrchestrator } from "../../core.js";

export function useSSEMiddleware<T extends Record<string, any>>(
	orchestrator: SSEOrchestrator<T>,
	middleware: SSEMiddleware<T>,
) {
	const middlewareRef = useRef(middleware);
	middlewareRef.current = middleware;

	useEffect(() => {
		const interceptor: SSEMiddleware<T> = (event) => {
			return middlewareRef.current(event);
		};

		orchestrator.use(interceptor);

		return () => {
			orchestrator.ejectMiddleware(interceptor);
		};
	}, [orchestrator]);
}
