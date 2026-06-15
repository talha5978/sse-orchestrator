// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { SSEOrchestrator } from "../../core";
import { useSSEMiddleware } from "../hooks/useSSEMiddleware";

interface PipelineEvents {
	step_progress: { name: string };
}

describe("useSSEMiddleware React Hook Lifecycle", () => {
	let mockOrchestrator: SSEOrchestrator<PipelineEvents>;

	beforeEach(() => {
		mockOrchestrator = new SSEOrchestrator<PipelineEvents>({ url: "http://localhost:4001" });
		vi.spyOn(mockOrchestrator, "use");
		vi.spyOn(mockOrchestrator, "ejectMiddleware");
	});

	it("should safely append middleware configuration on component mount", () => {
		const testMiddleware = (event: any) => event;

		renderHook(() => useSSEMiddleware(mockOrchestrator, testMiddleware));

		// Confirms core orchestrator intercepted registration during initialization
		expect(mockOrchestrator.use).toHaveBeenCalledTimes(1);
	});

	it("should cleanly eject middleware footprint from orchestrator array on unmount", () => {
		const testMiddleware = (event: any) => event;

		const { unmount } = renderHook(() => useSSEMiddleware(mockOrchestrator, testMiddleware));
		unmount();

		// Confirms unmount block fired eject, preserving performance footprint
		expect(mockOrchestrator.ejectMiddleware).toHaveBeenCalledTimes(1);
	});

	it("should remain immune to re-render duplication or accumulation bugs", () => {
		const testMiddleware = (event: any) => event;

		const { rerender, unmount } = renderHook(() => useSSEMiddleware(mockOrchestrator, testMiddleware));

		rerender();
		rerender();
		rerender();

		expect(mockOrchestrator.use).toHaveBeenCalledTimes(1);
		expect(mockOrchestrator.ejectMiddleware).toHaveBeenCalledTimes(0);

		unmount();
		expect(mockOrchestrator.ejectMiddleware).toHaveBeenCalledTimes(1);
	});
});
