import express from "express";
import http from "http";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { router } from "./routes.js";
import { setupWebSocketGateway } from "./ws.js";
import { shutdownAllAgents } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer(options = {}) {
  const app = express();

  // CORS middleware supporting allowed origins and preflight requests
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (config.allowedOrigins) {
        const allowed = config.allowedOrigins.split(",").map((s) => s.trim().toLowerCase());
        if (allowed.includes("*") || allowed.includes(origin.toLowerCase())) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      } else {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-token");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // JSON parser
  app.use(express.json({ limit: "50mb" }));

  // Check static web assets from explicit option, clients/web/public or local public
  const staticDirs = [
    options.staticDir,
    path.join(__dirname, "../../clients/web/public"),
    path.join(__dirname, "../public"),
    path.join(process.cwd(), "public"),
  ].filter(Boolean);

  for (const pub of staticDirs) {
    if (existsSync(pub)) {
      app.use(express.static(pub));
      break;
    }
  }

  // Mount API router
  app.use(router);

  const httpServer = http.createServer(app);
  const { wss, heartbeatInterval } = setupWebSocketGateway(httpServer);

  function listen(port = options.port || config.port, host = options.host || config.host) {
    return new Promise((resolve) => {
      httpServer.listen(port, host, () => {
        console.log(`[Pi-Chat Server] Gateway running on http://${host}:${port}`);
        console.log(`[Pi-Chat Server] WebSocket endpoint at ws://${host}:${port}/ws`);
        console.log(`[Pi-Chat Server] SSE endpoint at http://${host}:${port}/api/stream`);
        if (config.authToken) {
          console.log(`[Pi-Chat Server] Token authentication is ENABLED`);
        } else {
          console.log(`[Pi-Chat Server] Token authentication is DISABLED (dev mode)`);
        }
        resolve({ httpServer, wss, app });
      });
    });
  }

  function close() {
    return new Promise((resolve) => {
      clearInterval(heartbeatInterval);
      shutdownAllAgents("Server close");
      try { wss.close(); } catch {}
      httpServer.close(() => resolve());
    });
  }

  return { app, httpServer, wss, listen, close };
}

export { config } from "./config.js";
export { setupWebSocketGateway } from "./ws.js";
export { shutdownAllAgents, getOrCreateAgent, PiAgent, activeAgents, allAgents } from "./agent.js";
export { authMiddleware, verifyToken, verifyWsAuth } from "./auth.js";
export { router } from "./routes.js";
