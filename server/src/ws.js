import { WebSocketServer } from "ws";
import { config, normalizeCwd, normalizePath } from "./config.js";
import { verifyWsAuth, verifyToken } from "./auth.js";
import { getOrCreateAgent, activeAgents } from "./agent.js";
import {
  normalizeClientMessage,
  validateClientMessage,
  createPongMessage,
  createErrorMessage,
  ErrorCode,
  ClientMessageType,
} from "@liguoshuai/pi-chat-protocol";

export function isAllowedOrigin(origin, host) {
  if (!origin) return true; // Direct non-browser clients (curl, mobile apps)
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    if (originHost.toLowerCase() === (host || "").toLowerCase()) return true;

    const isLocalOrigin = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === "::1";
    const hostName = (host || "").split(":")[0].toLowerCase();
    const isLocalHost = hostName === "localhost" || hostName === "127.0.0.1" || hostName === "::1";
    if (isLocalOrigin && isLocalHost) return true;

    if (config.allowedOrigins) {
      const allowed = config.allowedOrigins.split(",").map(s => s.trim().toLowerCase());
      if (allowed.includes(origin.toLowerCase()) || allowed.includes(originUrl.origin.toLowerCase())) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function setupWebSocketGateway(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: (info, callback) => {
      const origin = info.origin || info.req.headers.origin;
      const host = info.req.headers.host;
      if (!isAllowedOrigin(origin, host)) {
        console.warn(`[Gateway] Rejected connection from unauthorized origin: ${origin} (host: ${host})`);
        return callback(false, 403, "Forbidden: Cross-origin WebSocket connection denied");
      }

      // If token is provided in upgrade request, verify it immediately
      if (config.authToken && !verifyWsAuth(info.req)) {
        const url = new URL(info.req.url, "http://localhost");
        // If client connects without token in URL, allow connection temporarily for handshake auth message
        // within 3 seconds, or reject if strict header/query requirement.
      }
      callback(true);
    }
  });

  // Heartbeat interval at protocol frame level (ping/pong)
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log("[Gateway] Terminating unresponsive WebSocket client");
        if (ws.piAgent) {
          ws.piAgent.detachWs(ws);
        }
        return ws.terminate();
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);
  heartbeatInterval.unref();

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;
    ws.isAuthenticated = !config.authToken || verifyWsAuth(req);

    // If unauthenticated, start an auth grace timer (3 seconds to send {type: "auth", token: "..."})
    let authTimer = null;
    if (!ws.isAuthenticated) {
      authTimer = setTimeout(() => {
        if (!ws.isAuthenticated) {
          try {
            ws.send(JSON.stringify(createErrorMessage(ErrorCode.UNAUTHORIZED, "Authentication timeout. Send {type: 'auth', token: '...'} within 3 seconds.")));
            ws.close(4401, "Unauthorized");
          } catch {}
        }
      }, 3000);
    }

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const url = new URL(req.url, "http://localhost");
    const cwd = normalizeCwd(url.searchParams.get("cwd"));
    const session = url.searchParams.get("session") || null;

    let agent = null;
    if (ws.isAuthenticated) {
      try {
        agent = getOrCreateAgent(cwd, session);
        agent.attachWs(ws);
        ws.piAgent = agent;
      } catch (err) {
        try {
          ws.send(JSON.stringify(createErrorMessage(ErrorCode.CAPACITY, err.message)));
          ws.close(1013, "Capacity");
        } catch {}
        return;
      }
    }

    ws.on("message", (raw) => {
      let rawMsg;
      try {
        rawMsg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Handle auth message during handshake
      if (rawMsg.type === ClientMessageType.AUTH) {
        if (verifyToken(rawMsg.token)) {
          ws.isAuthenticated = true;
          if (authTimer) { clearTimeout(authTimer); authTimer = null; }
          try {
            if (!ws.piAgent) {
              agent = getOrCreateAgent(cwd, session);
              agent.attachWs(ws);
              ws.piAgent = agent;
            }
            ws.send(JSON.stringify({ type: "response", success: true, message: "Authenticated successfully" }));
          } catch (err) {
            try {
              ws.send(JSON.stringify(createErrorMessage(ErrorCode.CAPACITY, err.message)));
              ws.close(1013, "Capacity");
            } catch {}
          }
        } else {
          try {
            ws.send(JSON.stringify(createErrorMessage(ErrorCode.UNAUTHORIZED, "Invalid authentication token")));
            ws.close(4401, "Unauthorized");
          } catch {}
        }
        return;
      }

      // Guard all other operations if token auth is required and not verified
      if (config.authToken && !ws.isAuthenticated) {
        try {
          ws.send(JSON.stringify(createErrorMessage(ErrorCode.UNAUTHORIZED, "Unauthorized. Must authenticate first.")));
        } catch {}
        return;
      }

      const activeAgent = ws.piAgent || agent;
      if (!activeAgent) {
        try {
          ws.send(JSON.stringify(createErrorMessage(ErrorCode.AGENT_NOT_FOUND, "Agent instance not initialized")));
        } catch {}
        return;
      }

      // Application level ping/pong
      if (rawMsg.type === ClientMessageType.PING || rawMsg.type === "heartbeat") {
        try { ws.send(JSON.stringify(createPongMessage())); } catch {}
        return;
      }

      const validation = validateClientMessage(rawMsg);
      if (!validation.valid) {
        try { ws.send(JSON.stringify(createErrorMessage(ErrorCode.INVALID_MESSAGE, validation.error))); } catch {}
        return;
      }

      const msg = normalizeClientMessage(rawMsg);
      const nowMs = Date.now();

      switch (msg.type) {
        case ClientMessageType.PROMPT:
          activeAgent.broadcast({ type: "remote_user_prompt", message: msg.message, images: msg.images }, ws);
          activeAgent.lastUserPrompt = { text: msg.message, isSteer: false, at: nowMs };
          activeAgent.send({ type: "prompt", message: msg.message, images: msg.images });
          break;

        case ClientMessageType.STEER:
          activeAgent.broadcast({ type: "remote_user_prompt", message: msg.message, isSteer: true }, ws);
          activeAgent.lastUserPrompt = { text: msg.message, isSteer: true, at: nowMs };
          activeAgent.send({ type: "steer", message: msg.message });
          break;

        case ClientMessageType.ABORT:
          activeAgent.sendNoReply({ type: "abort" });
          break;

        case ClientMessageType.NEW_SESSION:
          if (activeAgent.sessionKey) {
            activeAgents.delete(activeAgent.sessionKey);
            activeAgent.sessionKey = null;
          }
          activeAgent.lastUserPrompt = null;
          activeAgent.eventBuffer = [];
          activeAgent.bufferHead = 0;
          activeAgent.send({ type: "new_session" });
          break;

        case ClientMessageType.SWITCH_SESSION:
          if (!msg.sessionPath) break;
          activeAgent.setSessionKey(cwd, msg.sessionPath);
          activeAgent.send({ type: "switch_session", sessionPath: msg.sessionPath });
          break;

        case ClientMessageType.SET_SESSION_NAME:
          activeAgent.send({ type: "set_session_name", name: msg.name });
          break;

        case ClientMessageType.GET_ENTRIES:
          activeAgent.send({ type: "get_entries", since: msg.since });
          break;

        case ClientMessageType.GET_STATE:
          activeAgent.send({ type: "get_state" });
          break;

        case ClientMessageType.GET_AVAILABLE_MODELS:
          activeAgent.send({ type: "get_available_models" });
          break;

        case ClientMessageType.SET_MODEL:
          activeAgent.send({ type: "set_model", provider: msg.provider, modelId: msg.modelId });
          break;

        case ClientMessageType.SET_THINKING_LEVEL:
          activeAgent.send({ type: "set_thinking_level", level: msg.level });
          break;

        case ClientMessageType.CYCLE_THINKING_LEVEL:
          activeAgent.send({ type: "cycle_thinking_level" });
          break;

        case ClientMessageType.EXTENSION_UI_RESPONSE:
          activeAgent.sendNoReply({ type: "extension_ui_response", ...msg });
          break;

        default:
          activeAgent.send(msg);
      }
    });

    ws.on("close", () => {
      if (authTimer) { clearTimeout(authTimer); authTimer = null; }
      if (ws.piAgent) {
        ws.piAgent.detachWs(ws);
      }
    });

    ws.on("error", () => {
      if (authTimer) { clearTimeout(authTimer); authTimer = null; }
      if (ws.piAgent) {
        ws.piAgent.detachWs(ws);
      }
    });
  });

  return { wss, heartbeatInterval };
}
