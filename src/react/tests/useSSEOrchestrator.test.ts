// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { SSEOrchestrator } from "../../core";
import { useSSEOrchestrator } from "../index";
import { beforeEach, describe, expect, it, vi } from "vitest";

const connectSpy = vi.spyOn(SSEOrchestrator.prototype, "connect").mockImplementation(async () => {});
const disconnectSpy = vi.spyOn(SSEOrchestrator.prototype, "disconnect").mockImplementation(() => {});

describe("useSSEOrchestrator Hook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should initialize and connect on mount", () => {
		const { result } = renderHook(() => useSSEOrchestrator({ url: "http://test.com" }));

		expect(result.current.orchestrator).toBeInstanceOf(SSEOrchestrator);
		expect(result.current.status).toBe("DISCONNECTED");

		expect(connectSpy).toHaveBeenCalledTimes(1);
	});

	it("should disconnect when the component unmounts", () => {
		const { unmount } = renderHook(() => useSSEOrchestrator({ url: "http://test.com" }));

		unmount();

		expect(disconnectSpy).toHaveBeenCalledTimes(1);
	});
});
