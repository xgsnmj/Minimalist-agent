import { useEffect, useMemo, useState } from "react";

type AgentRunStreamStatus = "idle" | "connected" | "unavailable";

type AgUiEvent = MessageEvent<string>;

const STORAGE_PREFIX = "minimalist-agent:last-seen-event";

export function buildAgentRunEventsUrl(runId: number, lastSeenSequence: number) {
  if (lastSeenSequence > 0) {
    return `/api/runs/${runId}/events?after=${lastSeenSequence}`;
  }

  return `/api/runs/${runId}/events`;
}

function storageKey(runId: number) {
  return `${STORAGE_PREFIX}:${runId}`;
}

function loadLastSeenSequence(runId: number) {
  const storedValue = window.localStorage.getItem(storageKey(runId));
  const parsedValue = storedValue ? Number(storedValue) : 0;
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function saveLastSeenSequence(runId: number, sequence: number) {
  window.localStorage.setItem(storageKey(runId), String(sequence));
}

function extractSequence(event: AgUiEvent) {
  const fromEventId = Number(event.lastEventId);
  if (Number.isFinite(fromEventId) && fromEventId > 0) {
    return fromEventId;
  }

  try {
    const parsed = JSON.parse(event.data) as { sequence?: number };
    if (typeof parsed.sequence === "number" && parsed.sequence > 0) {
      return parsed.sequence;
    }
  } catch {
    return null;
  }

  return null;
}

export function useAgentRunStream(runId: number | null) {
  const [status, setStatus] = useState<AgentRunStreamStatus>("idle");
  const [lastSeenSequence, setLastSeenSequence] = useState(0);

  const streamUrl = useMemo(() => {
    if (runId == null) {
      return null;
    }

    return buildAgentRunEventsUrl(runId, lastSeenSequence);
  }, [lastSeenSequence, runId]);

  useEffect(() => {
    if (runId == null) {
      setStatus("idle");
      setLastSeenSequence(0);
      return;
    }

    const persistedLastSeenSequence = loadLastSeenSequence(runId);
    setLastSeenSequence(persistedLastSeenSequence);

    const EventSourceImpl = globalThis.EventSource;
    if (typeof EventSourceImpl !== "function") {
      setStatus("unavailable");
      return;
    }

    const source = new EventSourceImpl(
      buildAgentRunEventsUrl(runId, persistedLastSeenSequence),
    );
    const handleEvent = (event: Event) => {
      const agUiEvent = event as AgUiEvent;
      const sequence = extractSequence(agUiEvent);
      if (sequence == null) {
        return;
      }

      setLastSeenSequence(sequence);
      saveLastSeenSequence(runId, sequence);
    };

    const eventNames = [
      "run.status",
      "run.error",
      "process.summary",
      "message.completed",
      "tool.call",
      "artifact.ready",
      "card.rendered",
    ];

    for (const eventName of eventNames) {
      source.addEventListener(eventName, handleEvent);
    }

    source.onopen = () => {
      setStatus("connected");
    };
    source.onerror = () => {
      setStatus("connected");
    };
    setStatus("connected");

    return () => {
      for (const eventName of eventNames) {
        source.removeEventListener(eventName, handleEvent);
      }
      source.close();
    };
  }, [runId]);

  return {
    lastSeenSequence,
    runId,
    status,
    streamUrl,
  };
}
