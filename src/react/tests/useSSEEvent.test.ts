// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { SSEOrchestrator } from "../../core";
import { useSSEEvent } from "../index";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUnsubscribe = vi.fn();
const onSpy = vi.spyOn(SSEOrchestrator.prototype, "on").mockReturnValue(mockUnsubscribe);

describe("useSSEEvent Hook", () => {
	let mockOrchestrator: SSEOrchestrator<any>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockOrchestrator = new SSEOrchestrator({ url: "http://test.com" });
	});

	it("should register the event listener on mount", () => {
		const mockCallback = vi.fn();

		renderHook(() => useSSEEvent(mockOrchestrator, "test_event", mockCallback));

		expect(onSpy).toHaveBeenCalledTimes(1);
		expect(onSpy).toHaveBeenCalledWith("test_event", expect.any(Function));
	});

	it("should unregister the event listener on unmount", () => {
		const mockCallback = vi.fn();

		const { unmount } = renderHook(() => useSSEEvent(mockOrchestrator, "test_event", mockCallback));

		expect(mockUnsubscribe).not.toHaveBeenCalled();

		unmount();

		expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
	});
});
