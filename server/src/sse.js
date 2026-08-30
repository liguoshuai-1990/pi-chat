import { getOrCreateAgent } from "./agent.js";
import { normalizeCwd } from "./config.js";

/**
 * Express SSE stream handler for streaming events to clients.
 */
export function handleSseStream(req, res) {
  const cwd = normalizeCwd(req.query.cwd);
  const session = req.query.session || null;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`: connected at ${new Date().toISOString()}\n\n`);

  let agent;
  try {
    agent = getOrCreateAgent(cwd, session);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", code: "capacity", message: err.message })}\n\n`);
    res.end();
    return;
  }

  agent.attachSse(res);

  // Periodic SSE comment keepalive to prevent proxies/NAT timeouts
  const sseKeepAlive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(sseKeepAlive);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(sseKeepAlive);
    agent.detachSse(res);
  });
}
