import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { verifyToken } from "./auth";
import { db } from "./db";

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userRole: string;
  subscribedCases: Set<string>;
}

const clients = new Map<WebSocket, ClientConnection>();

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws/case-updates" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const token = url.searchParams.get("token");

    let userId = "anonymous";
    let userRole = "ANONYMOUS";

    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        userId = payload.userId;
        userRole = payload.role;
      }
    }

    const conn: ClientConnection = {
      ws,
      userId,
      userRole,
      subscribedCases: new Set<string>(),
    };

    clients.set(ws, conn);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "AUTHENTICATE" && msg.token) {
          const payload = verifyToken(msg.token);
          if (payload) {
            conn.userId = payload.userId;
            conn.userRole = payload.role;
            ws.send(JSON.stringify({ type: "AUTHENTICATED", userId: conn.userId, role: conn.userRole }));
          }
        } else if (msg.type === "SUBSCRIBE_CASE" && msg.caseId) {
          conn.subscribedCases.add(msg.caseId);
          ws.send(JSON.stringify({ type: "SUBSCRIBED", caseId: msg.caseId }));
        } else if (msg.type === "UNSUBSCRIBE_CASE" && msg.caseId) {
          conn.subscribedCases.delete(msg.caseId);
        }
      } catch (err) {
        // ignore malformed message
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: "CONNECTED", message: "CRIM-INTEL Realtime Link Established" }));
  });

  return wss;
}

export function broadcastCaseUpdate(caseId: string, payload: {
  event_type: string;
  title: string;
  message: string;
  changes: {
    new_evidence?: number;
    new_entities?: number;
    new_relationships?: number;
    new_alerts?: number;
  };
  evidence_id?: string;
  actor_name?: string;
  actor_role?: string;
}): void {
  if (!wss) return;

  const eventMessage = JSON.stringify({
    type: "CASE_UPDATED",
    case_id: caseId,
    timestamp: new Date().toISOString(),
    ...payload,
  });

  for (const [ws, client] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      if (client.subscribedCases.has(caseId) || client.userRole === "ADMIN" || client.subscribedCases.size === 0) {
        ws.send(eventMessage);
      }
    }
  }
}

// Demo mode: broadcast simulated CCTNS tunnel events
export function broadcastCctnsTunnelEvent(payload: {
  stage: "HANDSHAKE" | "AUTHENTICATING" | "TUNNEL_ESTABLISHED" | "QUERY_SENT" | "RESPONSE_RECEIVED" | "ERROR";
  message: string;
  latencyMs?: number;
  packets?: number;
}): void {
  if (!wss) return;

  const eventMessage = JSON.stringify({
    type: "CCTNS_TUNNEL_EVENT",
    timestamp: new Date().toISOString(),
    ...payload,
  });

  for (const [ws, client] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(eventMessage);
    }
  }
}