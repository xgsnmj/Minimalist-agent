import { useEffect, useMemo, useState } from "react";
import { getAuthenticatedStreamUrl } from "../features/workspace/workspace-api";

type AgentRunStreamStatus = "idle" | "connected" | "unavailable";

type AgUiEvent = MessageEvent<string>;

const STORAGE_PREFIX = "minimalist-agent:last-seen-event";

export type AgentRunStreamEvent = {
  data: Record<string, unknown>;
  eventType: string;
  sequence: number;
};

export function buildAgentRunEventsUrl(runId: number, lastSeenSequence: number) {
  if (lastSeenSequence > 0) {
    return getAuthenticatedStreamUrl(`/runs/${runId}/events?after=${lastSeenSequence}`);
  }

  return getAuthenticatedStreamUrl(`/runs/${runId}/events`);
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

function parseEventData(event: AgUiEvent) {
  try {
    const parsed = JSON.parse(event.data) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function useAgentRunStream(runId: number | null) {
  const [events, setEvents] = useState<AgentRunStreamEvent[]>([]);
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
      setEvents([]);
      setStatus("idle");
      setLastSeenSequence(0);
      return;
    }

    const persistedLastSeenSequence = loadLastSeenSequence(runId);
    setEvents([]);
    setLastSeenSequence(persistedLastSeenSequence);

    const EventSourceImpl = globalThis.EventSource;
    if (typeof EventSourceImpl !== "function") {
      setStatus("unavailable");
      return;
    }

    const source = new EventSourceImpl(
      buildAgentRunEventsUrl(runId, persistedLastSeenSequence),
    );
    const handleEvent = (eventName: string, event: Event) => {
      const agUiEvent = event as AgUiEvent;
      const sequence = extractSequence(agUiEvent);
      if (sequence == null) {
        return;
      }

      setLastSeenSequence(sequence);
      saveLastSeenSequence(runId, sequence);
      setEvents((currentEvents) => {
        if (currentEvents.some((currentEvent) => currentEvent.sequence === sequence)) {
          return currentEvents;
        }
        return [
          ...currentEvents,
          {
            data: parseEventData(agUiEvent),
            eventType: eventName,
            sequence,
          },
        ];
      });
    };

    const eventNames = [
      "run.status",
      "run.error",
      "process.summary",
      "message.delta",
      "message.completed",
      "tool.call",
      "artifact.ready",
      "card.rendered",
    ];

    const eventHandlers = eventNames.map((eventName) => {
      const handler = (event: Event) => handleEvent(eventName, event);
      source.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    source.onopen = () => {
      setStatus("connected");
    };
    source.onerror = () => {
      setStatus("connected");
    };
    setStatus("connected");

    return () => {
      for (const { eventName, handler } of eventHandlers) {
        source.removeEventListener(eventName, handler);
      }
      source.close();
    };
  }, [runId]);

  return {
    events,
    lastSeenSequence,
    runId,
    status,
    streamUrl,
  };
}
