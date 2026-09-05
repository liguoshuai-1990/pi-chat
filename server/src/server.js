import express from "express";
import http from "http";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import zlib from "zlib";
import { config } from "./config.js";
import { router } from "./routes.js";
import { setupWebSocketGateway } from "./ws.js";
import { shutdownAllAgents } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Lightweight gzip compression middleware (no external dependency) ---
const COMPRESSIBLE_TYPES = new Set([
  "text/html", "text/css", "text/javascript", "text/plain", "text/xml",
  "application/json", "application/javascript", "application/xml",
  "application/x-javascript", "image/svg+xml",
]);
const MIN_COMPRESS_SIZE = 1024; // Don't compress responses < 1KB

function compressionMiddleware(req, res, next) {
  // Only compress GET/HEAD responses
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const acceptEncoding = req.headers["accept-encoding"] || "";
  if (!acceptEncoding.includes("gzip")) return next();

  // Set Vary header for proper caching
  const existingVary = res.getHeader("Vary");
  if (existingVary) {
    if (!String(existingVary).includes("Accept-Encoding")) {
      res.setHeader("Vary", `${existingVary}, Accept-Encoding`);
    }
  } else {
    res.setHeader("Vary", "Accept-Encoding");
  }

  const chunks = [];
  let capturing = null; // null=unknown, true=capturing, false=passthrough

  function shouldCapture() {
    if (capturing !== null) return capturing;
    const ct = (res.getHeader("Content-Type") || "").split(";")[0].trim().toLowerCase();
    // Skip SSE and non-text types
    capturing = (ct !== "text/event-stream" && COMPRESSIBLE_TYPES.has(ct));
    return capturing;
  }

  const origWrite = res.write;
  const origEnd = res.end;

  res.write = function (chunk, ...args) {
    if (shouldCapture() && chunk) {
      chunks.push(Buffer.from(chunk));
      return true;
    }
    return origWrite.call(this, chunk, ...args);
  };

  res.end = function (chunk, ...args) {
    if (chunk && shouldCapture()) {
      chunks.push(Buffer.from(chunk));
    }
    if (!shouldCapture()) {
      return origEnd.call(this, chunk, ...args);
    }
    const body = Buffer.concat(chunks);
    // Skip small responses or already-encoded
    if (body.length < MIN_COMPRESS_SIZE || res.getHeader("Content-Encoding")) {
      return origEnd.call(this, body);
    }
    // If headers already sent (streaming started), can't compress — send raw
    if (res.headersSent) {
      return origEnd.call(this, body);
    }
    zlib.gzip(body, { level: 6 }, (err, compressed) => {
      if (err) {
        return origEnd.call(this, body);
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", compressed.length);
      res.removeHeader("ETag"); // ETag was for uncompressed body
      origEnd.call(this, compressed);
    });
  };

  next();
}

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

  // Gzip compression for text-based responses (app.js, style.css, JSON, etc.)
  app.use(compressionMiddleware);

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
      // Cache static assets: 1 day for regular files, 1 year for immutable hashed files
      app.use(express.static(pub, {
        maxAge: "1d",
        setHeaders: (res, filePath) => {
          // Longer cache for files with hash in name (e.g., app.abc123.js)
          if (/\.[a-f0-9]{8,}\./.test(path.basename(filePath))) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }));
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
      for (const client of wss.clients) {
        try { client.terminate(); } catch {}
      }
      try { wss.close(); } catch {}
      if (typeof httpServer.closeAllConnections === "function") {
        try { httpServer.closeAllConnections(); } catch {}
      }
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
