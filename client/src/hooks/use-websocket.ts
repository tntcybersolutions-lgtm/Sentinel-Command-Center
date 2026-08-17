import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

interface UseWebSocketOptions {
  url?: string;
  reconnectInterval?: number;
  pollFallbackInterval?: number;
  onMessage?: (message: WebSocketMessage) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
    reconnectInterval = 3000,
    pollFallbackInterval = 15000,
    onMessage,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  const invalidateQueries = useCallback((type: string) => {
    switch (type) {
      case "document_change":
      case "egnyte_sync":
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/recent-documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/egnyte/changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents/intelligence/stats"] });
        break;
      case "opportunity_update":
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/recent-opportunities"] });
        queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
        // Distinct key, not a prefix of the one above, so it needs its own line
        // or the home page's counts silently stop refreshing on live updates.
        queryClient.invalidateQueries({ queryKey: ["/api/opportunities/summary"] });
        break;
      case "approval_update":
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pending-approvals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        break;
      case "bid_update":
        queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        break;
      case "herbie_activity":
        queryClient.invalidateQueries({ queryKey: ["/api/herbie/autonomous/activity-log"] });
        queryClient.invalidateQueries({ queryKey: ["/api/herbie/autonomous/status"] });
        break;
      case "alert":
        queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
        break;
      default:
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    }
  }, [queryClient]);

  const startPollingFallback = useCallback(() => {
    if (pollIntervalRef.current) return;
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch("/api/egnyte/changes?limit=10");
        if (response.ok) {
          const data = await response.json();
          if (data.changes && data.changes.length > 0) {
            invalidateQueries("document_change");
          }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/herbie/autonomous/status"] });
      } catch (error) {
        console.warn("[WebSocket] Polling fallback error:", error);
      }
    }, pollFallbackInterval);
  }, [pollFallbackInterval, queryClient, invalidateQueries]);

  const stopPollingFallback = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        setIsConnected(true);
        setConnectionError(null);
        stopPollingFallback();
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          
          if (message.type !== "heartbeat") {
            invalidateQueries(message.type);
          }
          
          onMessage?.(message);
        } catch (error) {
          console.warn("[WebSocket] Failed to parse message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Disconnected:", event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        
        startPollingFallback();
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        setConnectionError("WebSocket connection failed");
        startPollingFallback();
      };
    } catch (error) {
      console.error("[WebSocket] Failed to create connection:", error);
      setConnectionError("Failed to create WebSocket connection");
      startPollingFallback();
    }
  }, [url, reconnectInterval, onMessage, invalidateQueries, startPollingFallback, stopPollingFallback]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    stopPollingFallback();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [stopPollingFallback]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    connectionError,
    sendMessage,
    connect,
    disconnect,
  };
}
