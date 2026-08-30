#!/usr/bin/env node
import { createServer } from "./server.js";
import { config } from "./config.js";
import { shutdownAllAgents } from "./agent.js";

const { listen, close } = createServer();

const server = await listen(config.port, config.host);

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
