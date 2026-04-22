import { EventEmitter } from "events";
import type { Response } from "express";

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
  | "APPROVAL_REJECTED"
  | "DASHBOARD_UPDATED"
  | "TASK_UPDATED"
  | "TASK_EXECUTED"
  | "INGESTION_COMPLETE"
  | "BID_JACKET_CHANGED";

export interface SSEEvent {
  id: string;
  type: SSEEventType;
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface SSEClient {
  id: string;
  tenantId: string;
  res: Response;
  connectedAt: Date;
  lastEventId: string | null;
}

const RING_BUFFER_SIZE = 500;
const HEARTBEAT_INTERVAL = 15000;

class EventStreamService extends EventEmitter {
  private clients = new Map<string, SSEClient>();
  private eventBuffer: SSEEvent[] = [];
  private eventCounter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.broadcast({
        id: `hb-${Date.now()}`,
        type: "EGNYTE_SYNC_PROGRESS" as SSEEventType,
        tenantId: "*",
        payload: { heartbeat: true },
        timestamp: new Date().toISOString(),
      }, true);
    }, HEARTBEAT_INTERVAL);
  }

  addClient(clientId: string, tenantId: string, res: Response, lastEventId: string | null): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const client: SSEClient = {
      id: clientId,
      tenantId,
      res,
      connectedAt: new Date(),
      lastEventId,
    };

    this.clients.set(clientId, client);

    res.write(`data: ${JSON.stringify({ type: "connected", clientId, tenantId, timestamp: new Date().toISOString(), bufferedEvents: this.eventBuffer.length })}\n\n`);

    if (lastEventId) {
      this.replayFromId(clientId, lastEventId);
    }

    res.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  private replayFromId(clientId: string, lastEventId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const idx = this.eventBuffer.findIndex(e => e.id === lastEventId);
    if (idx === -1) return;

    const missedEvents = this.eventBuffer.slice(idx + 1);
    for (const event of missedEvents) {
      if (event.tenantId === "*" || event.tenantId === client.tenantId) {
        this.sendToClient(client, event);
      }
    }
  }

  emit(eventType: SSEEventType, tenantId: string, payload: Record<string, unknown>): boolean {
    this.eventCounter++;
    const event: SSEEvent = {
      id: `evt-${this.eventCounter}-${Date.now()}`,
      type: eventType,
      tenantId,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > RING_BUFFER_SIZE) {
      this.eventBuffer = this.eventBuffer.slice(-RING_BUFFER_SIZE);
    }

    this.broadcast(event, false);
    return true;
  }

  private broadcast(event: SSEEvent, isHeartbeat: boolean): void {
    const clientArray = Array.from(this.clients.values());
    for (const client of clientArray) {
      if (isHeartbeat || event.tenantId === "*" || event.tenantId === client.tenantId) {
        this.sendToClient(client, event);
      }
    }
  }

  private sendToClient(client: SSEClient, event: SSEEvent): void {
    try {
      const data = JSON.stringify({
        type: event.type,
        payload: event.payload,
        timestamp: event.timestamp,
      });
      client.res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`);
    } catch {
      this.clients.delete(client.id);
    }
  }

  getStatus() {
    return {
      connectedClients: this.clients.size,
      bufferedEvents: this.eventBuffer.length,
      totalEventsEmitted: this.eventCounter,
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        tenantId: c.tenantId,
        connectedAt: c.connectedAt.toISOString(),
      })),
    };
  }

  getRecentEvents(limit = 50): SSEEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const clientArray = Array.from(this.clients.values());
    for (const client of clientArray) {
      try { client.res.end(); } catch {}
    }
    this.clients.clear();
  }
}

export const eventStreamService = new EventStreamService();
