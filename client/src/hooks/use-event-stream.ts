import { useEffect, useRef, useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

export type SSEEventType =
  | "EGNYTE_SYNC_STARTED"
  | "EGNYTE_SYNC_PROGRESS"
  | "EGNYTE_SYNC_DONE"
  | "EGNYTE_SYNC_ERROR"
  | "SAM_INGEST_NEW"
  | "SAM_INGEST_UPDATE"
  | "SAM_INGEST_ATTACHMENTS_DONE"
  | "BID_CHECKLIST_UPDATED"
  | "BINDER_GENERATING"
  | "BINDER_READY"
  | "BINDER_FAILED"
  | "RETRO_SCAN_FOUND"
  | "RETRO_REBUILD_DONE"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED";

export interface SSEMessage {
  type: SSEEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

type ConnectionState = "connected" | "reconnecting" | "polling" | "disconnected";

const EVENT_QUERY_MAP: Partial<Record<SSEEventType, string[][]>> = {
  EGNYTE_SYNC_STARTED: [["/api/egnyte/sync/status"]],
  EGNYTE_SYNC_PROGRESS: [["/api/egnyte/sync/status"]],
  EGNYTE_SYNC_DONE: [["/api/egnyte/sync/status"], ["/api/egnyte/tree"], ["/api/debug/egnyte"]],
  EGNYTE_SYNC_ERROR: [["/api/egnyte/sync/status"], ["/api/debug/egnyte"]],
  SAM_INGEST_NEW: [["/api/opportunities"], ["/api/dashboard/stats"], ["/api/debug/sam"]],
  SAM_INGEST_UPDATE: [["/api/opportunities"], ["/api/dashboard/stats"]],
  SAM_INGEST_ATTACHMENTS_DONE: [["/api/opportunities"]],
  BID_CHECKLIST_UPDATED: [["/api/dashboard/stats"]],
  BINDER_GENERATING: [["/api/dashboard/stats"]],
  BINDER_READY: [["/api/dashboard/stats"]],
  BINDER_FAILED: [["/api/dashboard/stats"]],
  RETRO_SCAN_FOUND: [["/api/retro"]],
  RETRO_REBUILD_DONE: [["/api/retro"]],
  APPROVAL_REQUIRED: [["/api/approvals"], ["/api/dashboard/stats"], ["/api/planner/command-brief"]],
  APPROVAL_APPROVED: [["/api/approvals"], ["/api/dashboard/stats"], ["/api/planner/command-brief"]],
  APPROVAL_REJECTED: [["/api/approvals"], ["/api/dashboard/stats"], ["/api/planner/command-brief"]],
};

export function useEventStream(tenantId = "blackhawk-default") {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [lastEvent, setLastEvent] = useState<SSEMessage | null>(null);
  const [events, setEvents] = useState<SSEMessage[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxEventsRef = useRef(100);

  const invalidateQueriesForEvent = useCallback((eventType: SSEEventType) => {
    const queryKeys = EVENT_QUERY_MAP[eventType];
    if (queryKeys) {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }
  }, []);

  const handleEvent = useCallback((msg: SSEMessage) => {
    setLastEvent(msg);
    setEvents(prev => {
      const next = [...prev, msg];
      return next.length > maxEventsRef.current ? next.slice(-maxEventsRef.current) : next;
    });
    invalidateQueriesForEvent(msg.type);
  }, [invalidateQueriesForEvent]);

  const startPolling = useCallback(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/events/recent?limit=10`);
        if (res.ok) {
          const recentEvents: SSEMessage[] = await res.json();
          for (const evt of recentEvents) {
            handleEvent(evt);
          }
        }
      } catch {}

      const backoff = Math.min(15000 * Math.pow(1.5, reconnectAttemptsRef.current), 300000);
      pollTimerRef.current = setTimeout(poll, backoff);
    };

    setConnectionState("polling");
    poll();
  }, [handleEvent]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/events/stream?tenantId=${encodeURIComponent(tenantId)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnectionState("connected");
      reconnectAttemptsRef.current = 0;
      stopPolling();
    };

    const eventTypes: SSEEventType[] = [
      "EGNYTE_SYNC_STARTED", "EGNYTE_SYNC_PROGRESS", "EGNYTE_SYNC_DONE", "EGNYTE_SYNC_ERROR",
      "SAM_INGEST_NEW", "SAM_INGEST_UPDATE", "SAM_INGEST_ATTACHMENTS_DONE",
      "BID_CHECKLIST_UPDATED", "BINDER_GENERATING", "BINDER_READY", "BINDER_FAILED",
      "RETRO_SCAN_FOUND", "RETRO_REBUILD_DONE",
      "APPROVAL_REQUIRED", "APPROVAL_APPROVED", "APPROVAL_REJECTED",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handleEvent(data as SSEMessage);
        } catch {}
      });
    }

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      reconnectAttemptsRef.current++;
      setConnectionState("reconnecting");

      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);

      if (reconnectAttemptsRef.current > 5) {
        startPolling();
      } else {
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };
  }, [tenantId, handleEvent, stopPolling, startPolling]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopPolling();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect, stopPolling]);

  return {
    connectionState,
    lastEvent,
    events,
    isConnected: connectionState === "connected",
  };
}
