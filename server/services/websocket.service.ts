import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";

interface ClientConnection {
  ws: WebSocket;
  tenantId: string;
  userId: string;
  subscribedChannels: Set<string>;
  lastPing: number;
}

interface BroadcastMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private eventHistory: BroadcastMessage[] = [];
  private maxHistorySize = 100;

  initialize(server: HttpServer) {
    this.wss = new WebSocketServer({ 
      server, 
      path: "/ws",
      perMessageDeflate: false,
    });

    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId();
      const url = new URL(req.url || "/", `ws://${req.headers.host}`);
      const tenantId = url.searchParams.get("tenantId") || "blackhawk-default";
      const userId = url.searchParams.get("userId") || "anonymous";

      const connection: ClientConnection = {
        ws,
        tenantId,
        userId,
        subscribedChannels: new Set(["global", `tenant:${tenantId}`]),
        lastPing: Date.now(),
      };

      this.clients.set(clientId, connection);
      console.log(`[WebSocket] Client connected: ${clientId} (tenant: ${tenantId})`);

      ws.send(JSON.stringify({
        type: "connected",
        clientId,
        channels: Array.from(connection.subscribedChannels),
        timestamp: new Date().toISOString(),
      }));

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (e) {
          console.error("[WebSocket] Invalid message:", e);
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        console.log(`[WebSocket] Client disconnected: ${clientId}`);
      });

      ws.on("error", (error) => {
        console.error(`[WebSocket] Client error ${clientId}:`, error.message);
        this.clients.delete(clientId);
      });

      ws.on("pong", () => {
        connection.lastPing = Date.now();
      });
    });

    setInterval(() => this.heartbeat(), 30000);

    console.log("[WebSocket] Server initialized on /ws");
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleClientMessage(clientId: string, message: any) {
    const connection = this.clients.get(clientId);
    if (!connection) return;

    switch (message.type) {
      case "subscribe":
        if (message.channel) {
          connection.subscribedChannels.add(message.channel);
          connection.ws.send(JSON.stringify({
            type: "subscribed",
            channel: message.channel,
          }));
        }
        break;

      case "unsubscribe":
        if (message.channel) {
          connection.subscribedChannels.delete(message.channel);
          connection.ws.send(JSON.stringify({
            type: "unsubscribed",
            channel: message.channel,
          }));
        }
        break;

      case "ping":
        connection.ws.send(JSON.stringify({ type: "pong" }));
        break;

      case "get_history":
        const history = this.eventHistory.filter(
          (e) => connection.subscribedChannels.has(e.channel)
        ).slice(-50);
        connection.ws.send(JSON.stringify({
          type: "history",
          events: history,
        }));
        break;
    }
  }

  private heartbeat() {
    const now = Date.now();
    const timeout = 60000;

    this.clients.forEach((connection, clientId) => {
      if (now - connection.lastPing > timeout) {
        console.log(`[WebSocket] Client timeout: ${clientId}`);
        connection.ws.terminate();
        this.clients.delete(clientId);
      } else if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.ping();
      }
    });
  }

  broadcast(channel: string, event: string, data: unknown) {
    const message: BroadcastMessage = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.eventHistory.push(message);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const payload = JSON.stringify({
      type: "event",
      ...message,
    });

    let sent = 0;
    this.clients.forEach((connection) => {
      if (
        connection.ws.readyState === WebSocket.OPEN &&
        connection.subscribedChannels.has(channel)
      ) {
        connection.ws.send(payload);
        sent++;
      }
    });

    if (sent > 0) {
      console.log(`[WebSocket] Broadcast to ${sent} clients: ${channel}/${event}`);
    }
  }

  broadcastToTenant(tenantId: string, event: string, data: unknown) {
    this.broadcast(`tenant:${tenantId}`, event, data);
  }

  broadcastDocument(tenantId: string, action: string, document: unknown) {
    this.broadcast(`tenant:${tenantId}`, `document:${action}`, document);
    this.broadcast("documents", action, { tenantId, ...document as object });
  }

  broadcastEgnyteChange(tenantId: string, change: {
    action: "created" | "modified" | "deleted" | "moved" | "renamed";
    path: string;
    name: string;
    isFolder: boolean;
    egnyteFileId?: string;
    timestamp: string;
  }) {
    this.broadcast(`tenant:${tenantId}`, "egnyte:change", change);
    this.broadcast("egnyte", "change", { tenantId, ...change });
  }

  broadcastApproval(tenantId: string, action: string, approval: unknown) {
    this.broadcast(`tenant:${tenantId}`, `approval:${action}`, approval);
  }

  broadcastAlert(tenantId: string, alert: {
    type: string;
    title: string;
    message: string;
    severity: "info" | "warning" | "critical";
    entityType?: string;
    entityId?: string;
  }) {
    this.broadcast(`tenant:${tenantId}`, "alert", alert);
  }

  getStatus() {
    return {
      clientCount: this.clients.size,
      eventHistorySize: this.eventHistory.length,
      recentEvents: this.eventHistory.slice(-10),
      clients: Array.from(this.clients.entries()).map(([id, c]) => ({
        id,
        tenantId: c.tenantId,
        userId: c.userId,
        channels: Array.from(c.subscribedChannels),
        lastPing: new Date(c.lastPing).toISOString(),
      })),
    };
  }

  getEventHistory(limit = 50) {
    return this.eventHistory.slice(-limit);
  }
}

export const websocketService = new WebSocketService();
