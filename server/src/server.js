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

export function createServer() {
  const app = express();

  // Basic CORS & JSON parser
  app.use(express.json({ limit: "50mb" }));

  // Check static web assets from clients/web/public or local public
  const webPublicCandidates = [
    path.join(__dirname, "../../clients/web/public"),
    path.join(__dirname, "../public"),
  ];
  for (const pub of webPublicCandidates) {
    if (existsSync(pub)) {
      app.use(express.static(pub));
      break;
    }
  }

  // Mount API router
  app.use(router);

  const httpServer = http.createServer(app);
  const { wss, heartbeatInterval } = setupWebSocketGateway(httpServer);

  function listen(port = config.port, host = config.host) {
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
