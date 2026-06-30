import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAgentRunEventsUrl, useAgentRunStream } from "./ag-ui-stream";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(eventName: string, handler: (event: MessageEvent) => void) {
    this.listeners.set(eventName, handler);
  }

  removeEventListener(eventName: string) {
    this.listeners.delete(eventName);
  }

  emit(eventName: string, event: MessageEvent) {
    this.listeners.get(eventName)?.(event);
  }
}

describe("AG-UI SSE stream subscription", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("builds a resume-aware AG-UI SSE URL", () => {
    expect(buildAgentRunEventsUrl(7, 0)).toBe("/api/runs/7/events");
    expect(buildAgentRunEventsUrl(7, 4)).toBe("/api/runs/7/events?after=4");
  });

  it("subscribes to active run events and tracks the last seen sequence", async () => {
    vi.stubGlobal("EventSource", MockEventSource);

    const { result } = renderHook(() => useAgentRunStream(7));

    expect(MockEventSource.instances[0].url).toBe("/api/runs/7/events");

    act(() => {
      MockEventSource.instances[0].emit(
        "run.status",
        new MessageEvent("run.status", {
          data: JSON.stringify({ sequence: 3, status: "running" }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSeenSequence).toBe(3);
    });
    expect(result.current.status).toBe("connected");
  });
});
