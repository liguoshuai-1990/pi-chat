// server.js — pi-web-chat runner
// Thin adapter launching the unified @liguoshuai/pi-chat-server gateway engine
import { createServer } from "@liguoshuai/pi-chat-server";
import { config } from "@liguoshuai/pi-chat-server/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const { listen, close } = createServer({
  staticDir: publicDir,
});

const PORT = Number(process.env.PORT) || config.port || 3000;
const HOST = process.env.HOST || config.host || "0.0.0.0";

await listen(PORT, HOST);

function handleShutdown(sig) {
  console.log(`\n[pi-web-chat] Received ${sig}, shutting down...`);
  close().then(() => process.exit(0));
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
