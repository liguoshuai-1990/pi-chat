#!/usr/bin/env node
import { createServer } from "./server.js";
import { config } from "./config.js";
import { shutdownAllAgents } from "./agent.js";

const { listen, close } = createServer();

const server = await listen(config.port, config.host);

// Global unhandled error handlers to prevent unhandled socket or promise errors from crashing the gateway process
process.on("uncaughtException", (err) => {
  console.error("[Pi-Chat Server] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Pi-Chat Server] Unhandled rejection at:", promise, "reason:", reason);
});

function handleExit(signal) {
  console.log(`\nReceived ${signal}. Shutting down gateway...`);
  close().then(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));
process.on("exit", () => {
  shutdownAllAgents("Exit");
});

// Global handlers for uncaught errors — prevent silent process crash
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Pi-Chat Server] Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Pi-Chat Server] Uncaught Exception:", err);
});
