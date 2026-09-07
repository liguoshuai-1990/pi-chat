import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { isAllowedOrigin } from "../src/ws.js";
import { verifyToken, verifyWsAuth, authMiddleware } from "../src/auth.js";
import { config, normalizePath, normalizeCwd, home } from "../src/config.js";
import { createServer } from "../src/server.js";
import { PiAgent, activeAgents, allAgents, getOrCreateAgent, shutdownAllAgents } from "../src/agent.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

// CI runners don't have the real `pi` CLI installed, so `PiAgent.start()`'s
// spawn("pi") fails with ENOENT and leaves the test process hanging. Stub it
// to a long-lived no-op so gateway unit tests are self-contained.
const piStub = fileURLToPath(new URL("../fixtures/pi-stub.mjs", import.meta.url));
config.piBin = piStub;

describe("Pi-Chat Server Gateway Unit Tests", () => {
  test("verifyToken validates correctly when AUTH_TOKEN is unset or set", () => {
    const origToken = config.authToken;
    config.authToken = "";
    assert.equal(verifyToken(""), true);
    assert.equal(verifyToken("any-token"), true);

    config.authToken = "secret-vps-key-123";
    assert.equal(verifyToken("secret-vps-key-123"), true);
    assert.equal(verifyToken("wrong-key"), false);
    assert.equal(verifyToken(""), false);
    assert.equal(verifyToken(null), false);

    config.authToken = origToken;
  });

  test("verifyWsAuth parses queries and authorization headers", () => {
    const origToken = config.authToken;
    config.authToken = "my-secret-token";

    const reqWithQuery = { url: "/ws?token=my-secret-token", headers: {} };
    assert.equal(verifyWsAuth(reqWithQuery), true);

    const reqWithBearer = { url: "/ws", headers: { authorization: "Bearer my-secret-token" } };
    assert.equal(verifyWsAuth(reqWithBearer), true);

    const reqWithCustomHeader = { url: "/ws", headers: { "x-api-token": "my-secret-token" } };
    assert.equal(verifyWsAuth(reqWithCustomHeader), true);

    const reqWithWrongToken = { url: "/ws?token=invalid", headers: {} };
    assert.equal(verifyWsAuth(reqWithWrongToken), false);

    const reqNoToken = { url: "/ws", headers: {} };
    assert.equal(verifyWsAuth(reqNoToken), false);

    config.authToken = "";
    assert.equal(verifyWsAuth({ url: "/ws", headers: {} }), true);

    config.authToken = origToken;
  });

  test("authMiddleware handles unauthorized and authorized requests", () => {
    const origToken = config.authToken;
    config.authToken = "test-token";

    let nextCalled = false;
    const next = () => { nextCalled = true; };

    nextCalled = false;
    const reqAuth = { headers: { authorization: "Bearer test-token" }, query: {} };
    authMiddleware(reqAuth, {}, next);
    assert.equal(nextCalled, true);

    nextCalled = false;
    let statusSet = 0;
    let jsonResult = null;
    const reqUnauth = { headers: {}, query: {} };
    const resUnauth = {
      status(code) { statusSet = code; return this; },
      json(data) { jsonResult = data; return this; }
    };
    authMiddleware(reqUnauth, resUnauth, next);
    assert.equal(nextCalled, false);
    assert.equal(statusSet, 401);
    assert.equal(jsonResult?.code, "unauthorized");

    config.authToken = "";
    nextCalled = false;
    authMiddleware({ headers: {}, query: {} }, {}, next);
    assert.equal(nextCalled, true);

    config.authToken = origToken;
  });

  test("isAllowedOrigin defends against Cross-Site WebSocket Hijacking", () => {
    assert.equal(isAllowedOrigin("http://localhost:3000", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:8080", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://[::1]:3000", "[::1]:3000"), true);
    assert.equal(isAllowedOrigin("http://localhost:3000", "[::1]:3000"), true);

    assert.equal(isAllowedOrigin("", "localhost:3000"), true);
    assert.equal(isAllowedOrigin(undefined, "localhost:3000"), true);

    assert.equal(isAllowedOrigin("http://evil-attacker.xyz", "localhost:3000"), false);
    assert.equal(isAllowedOrigin("https://phishing.site", "localhost:3000"), false);
    assert.equal(isAllowedOrigin("not-a-url", "localhost:3000"), false);

    const origOrigins = config.allowedOrigins;
    config.allowedOrigins = "*";
    assert.equal(isAllowedOrigin("https://any-external-domain.com", "localhost:3000"), true);
    config.allowedOrigins = "https://custom.app.com, https://another.app.com";
    assert.equal(isAllowedOrigin("https://custom.app.com", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("https://unknown.com", "localhost:3000"), false);
    config.allowedOrigins = origOrigins;
  });

  test("Server configuration contains expected defaults and types", () => {
    assert.ok(typeof config.port === "number");
    assert.ok(typeof config.sessionsDir === "string");
    assert.ok(typeof config.idleTimeoutMs === "number");
    assert.ok(typeof config.maxAgentLifetimeMs === "number");
    assert.ok(typeof config.eventBufferSize === "number");
    assert.ok(typeof config.longRunningTimeoutMs === "number");
    assert.ok(typeof config.maxConcurrentAgents === "number");
    assert.ok(typeof config.version === "string");
  });

  test("normalizePath handles tilde expansion and relative paths", () => {
    assert.equal(normalizePath("~"), home());
    assert.equal(normalizePath("~/test.jsonl"), `${home()}/test.jsonl`);
    assert.equal(normalizePath(""), "");
    assert.ok(normalizePath("/tmp/foo").startsWith("/tmp/foo"));
  });

  test("normalizeCwd respects ALLOWED_CWD_DIRS when set", () => {
    const origAllowed = process.env.ALLOWED_CWD_DIRS;
    try {
      delete process.env.ALLOWED_CWD_DIRS;
      assert.equal(normalizeCwd("/tmp"), "/tmp");
      assert.equal(normalizeCwd("/etc"), "/etc");

      process.env.ALLOWED_CWD_DIRS = "/tmp,/home";
      assert.equal(normalizeCwd("/tmp"), "/tmp");
      assert.ok(normalizeCwd("/tmp/subdir").startsWith("/tmp/"));
      assert.throws(() => normalizeCwd("/etc"), /outside allowed directories/);
      assert.throws(() => normalizeCwd("/var/log"), /outside allowed directories/);
    } finally {
      if (origAllowed !== undefined) process.env.ALLOWED_CWD_DIRS = origAllowed;
      else delete process.env.ALLOWED_CWD_DIRS;
    }
  });

  test("createServer initializes express app and routes correctly", async () => {
    const serverInstance = createServer();
    assert.ok(serverInstance.app);
    assert.ok(serverInstance.httpServer);
    assert.ok(serverInstance.wss);
    assert.equal(typeof serverInstance.listen, "function");
    assert.equal(typeof serverInstance.close, "function");
    await serverInstance.close();
  });

  test("CORS middleware handles cross-origin requests and OPTIONS preflight correctly", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    const optRes = await fetch(`http://127.0.0.1:${port}/api/config`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.ok(optRes.headers.get("access-control-allow-methods")?.includes("OPTIONS"));

    const getRes = await fetch(`http://127.0.0.1:${port}/api/config`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("access-control-allow-origin"), "http://localhost:3000");

    await serverInstance.close();
  });

  test("/api/config returns version, piVersion, and authRequired fields", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/config`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.version === "string");
    assert.ok(typeof data.authRequired === "boolean");
    assert.ok("piVersion" in data, "piVersion field must exist");
    assert.ok("home" in data, "home field must exist");
    assert.ok("serverCwd" in data, "serverCwd field must exist");
    assert.ok("defaultModel" in data, "defaultModel field must exist");
    assert.ok(typeof data.defaultModel === "object");
    assert.ok("source" in data.defaultModel, "defaultModel.source must exist");

    await serverInstance.close();
  });

  test("/api/validate-dir validates directory existence correctly", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    const validRes = await fetch(`http://127.0.0.1:${port}/api/validate-dir?path=${encodeURIComponent("/tmp")}`);
    assert.equal(validRes.status, 200);
    const validData = await validRes.json();
    assert.equal(validData.ok, true);

    const invalidRes = await fetch(`http://127.0.0.1:${port}/api/validate-dir?path=${encodeURIComponent("/nonexistent-dir-xyz-123")}`);
    assert.equal(invalidRes.status, 200);
    const invalidData = await invalidRes.json();
    assert.equal(invalidData.ok, false);

    await serverInstance.close();
  });

  test("/api/agents lists live agents correctly", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/agents`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.count === "number");
    assert.ok(Array.isArray(data.agents));
    assert.ok(typeof data.idleTimeoutMs === "number");
    assert.ok(typeof data.maxLifetimeMs === "number");

    await serverInstance.close();
  });

  test("WebSocket server handles non-object JSON messages safely without crashing", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => {
        ws.send("null");
        ws.send("123");
        ws.send("true");
        ws.send("\"string\"");
        setTimeout(() => { ws.close(); resolve(); }, 50);
      });
      ws.on("error", reject);
    });

    await serverInstance.close();
  });

  test("WebSocket server handles invalid JSON gracefully without crashing", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => {
        ws.send("not-json-at-all");
        ws.send("{broken");
        setTimeout(() => { ws.close(); resolve(); }, 50);
      });
      ws.on("error", reject);
    });

    await serverInstance.close();
  });

  test("WebSocket server responds to ping with pong", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ping/pong test timed out")), 5000);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => { ws.send(JSON.stringify({ type: "ping" })); });
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "pong") {
          clearTimeout(timer);
          assert.ok(typeof msg.timestamp === "number");
          ws.close();
          resolve();
        }
      });
      ws.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    await serverInstance.close();
  });

  test("WebSocket server rejects unknown message type with error", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("unknown type test timed out")), 5000);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => { ws.send(JSON.stringify({ type: "totally_fake_type" })); });
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "error" && msg.code === "invalid_message") {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    await serverInstance.close();
  });

  test("PiAgent tracks isStreaming vs isBusy accurately without false positives", () => {
    const agent = new PiAgent(process.cwd());
    assert.equal(agent.state, "idle");
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, false);

    agent.pending.set("1", () => {});
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, true);

    agent.pending.clear();
    assert.equal(agent.isBusy, false);

    agent.onPiMessage({ type: "agent_start" });
    assert.equal(agent.isStreaming, true);
    assert.equal(agent.isBusy, true);

    agent.onPiMessage({ type: "agent_end" });
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, false);

    agent.onPiMessage({ type: "agent_settled" });
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, false);
    assert.equal(agent.eventBuffer.length, 0);

    agent.onPiMessage({ type: "response", command: "get_state", success: true, data: { isStreaming: false } });
    assert.equal(agent.eventBuffer.length, 0);
  });

  test("PiAgent bufferEvent handles ring buffer overflow correctly", () => {
    const origSize = config.eventBufferSize;
    config.eventBufferSize = 3;

    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    agent.bufferEvent({ type: "test", n: 1 });
    agent.bufferEvent({ type: "test", n: 2 });
    agent.bufferEvent({ type: "test", n: 3 });
    assert.equal(agent.eventBuffer.length, 3);
    assert.equal(agent.hasBufferOverflowed, false);

    agent.bufferEvent({ type: "test", n: 4 });
    assert.equal(agent.eventBuffer.length, 3);
    assert.equal(agent.hasBufferOverflowed, true);
    assert.equal(agent.bufferHead, 1);

    agent.bufferEvent({ type: "test", n: 5 });
    assert.equal(agent.bufferHead, 2);

    config.eventBufferSize = origSize;
  });

  test("PiAgent error and pi_exit events clear buffer and stop streaming", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    agent.onPiMessage({ type: "agent_start" });
    assert.equal(agent.isStreaming, true);
    assert.ok(agent.eventBuffer.length > 0);

    agent.onPiMessage({ type: "error", message: "test error" });
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.eventBuffer.length, 0);

    agent.onPiMessage({ type: "agent_start" });
    assert.ok(agent.eventBuffer.length > 0);
    agent.onPiMessage({ type: "pi_exit", code: 1 });
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.eventBuffer.length, 0);
  });

  test("PiAgent send returns failure when process not alive", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = false;
    agent.proc = null;

    return agent.send({ type: "prompt", message: "test" }).then((res) => {
      assert.equal(res.success, false);
    });
  });

  test("PiAgent status returns expected fields", () => {
    const agent = new PiAgent(process.cwd());
    const s = agent.status();
    assert.ok("cwd" in s);
    assert.ok("sessionKey" in s);
    assert.ok("alive" in s);
    assert.ok("state" in s);
    assert.ok("isBusy" in s);
    assert.ok("isStreaming" in s);
    assert.ok("listenersCount" in s);
    assert.ok("startedAt" in s);
    assert.ok("lastActivityAt" in s);
    assert.ok("bufferedEventsCount" in s);
  });

  test("WebSocket gateway replies with switch_session command response when switching session", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("switch_session test timed out")), 5000);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "switch_session", sessionPath: "/tmp/test-session.jsonl" }));
      });
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "response" && msg.command === "switch_session") {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    await serverInstance.close();
  });

  test("Static assets set appropriate Cache-Control headers", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    // HTML files should have no-cache
    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(htmlRes.status, 200);
    const htmlCache = htmlRes.headers.get("cache-control");
    assert.ok(htmlCache?.includes("no-cache") || htmlCache?.includes("no-store"));

    // Static assets should have immutable cache
    const jsRes = await fetch(`http://127.0.0.1:${port}/app.js`);
    assert.equal(jsRes.status, 200);
    const jsCache = jsRes.headers.get("cache-control");
    assert.ok(jsCache?.includes("no-cache") || jsCache?.includes("max-age"));

    await serverInstance.close();
  });

  test("/api/sessions and /api/session include active in-memory sessions not yet flushed to disk", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    // Query sessions for a temp dir
    const res = await fetch(`http://127.0.0.1:${port}/api/sessions?cwd=${encodeURIComponent("/tmp")}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.sessions));

    await serverInstance.close();
  });

  test("PiAgent trackTiming captures thinking and tool durations", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    // Start a turn
    agent.onPiMessage({ type: "agent_start" });
    assert.ok(agent.turnStart > 0);
    assert.ok(agent.timingData);

    // Thinking start/end
    agent.onPiMessage({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } });
    assert.ok(agent.thinkingStart > 0);

    agent.onPiMessage({ type: "message_update", assistantMessageEvent: { type: "thinking_end" } });
    assert.equal(agent.thinkingStart, null);
    assert.equal(agent.timingData.thinkingDurations.length, 1);
    assert.ok(agent.timingData.thinkingDurations[0] >= 0);

    // Tool execution
    agent.onPiMessage({ type: "tool_execution_start", toolCallId: "tool-1" });
    assert.ok(agent.toolStarts.has("tool-1"));

    agent.onPiMessage({ type: "tool_execution_end", toolCallId: "tool-1" });
    assert.ok(!agent.toolStarts.has("tool-1"));
    assert.ok("tool-1" in agent.timingData.toolDurations);

    // End turn
    agent.onPiMessage({ type: "agent_end" });
    assert.ok(agent.timingData.turnDuration >= 0);
  });

  test("PiAgent onPiMessage handles response with pending callback", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    let resolved = null;
    agent.pending.set("42", (obj) => { resolved = obj; });

    agent.onPiMessage({ type: "response", id: 42, success: true, data: { result: "ok" } });

    assert.ok(resolved !== null);
    assert.equal(resolved.success, true);
    assert.equal(resolved.data.result, "ok");
    assert.ok(!agent.pending.has("42"));
  });

  test("PiAgent onPiMessage tracks remote_user_prompt", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    agent.onPiMessage({ type: "remote_user_prompt", message: "hello world" });
    assert.ok(agent.lastUserPrompt !== null);
    assert.equal(agent.lastUserPrompt.text, "hello world");
    assert.equal(agent.lastUserPrompt.isSteer, false);

    agent.onPiMessage({ type: "remote_user_steer", message: "steer msg", isSteer: true });
    assert.equal(agent.lastUserPrompt.text, "steer msg");
    assert.equal(agent.lastUserPrompt.isSteer, true);
  });

  test("PiAgent onPiMessage extracts sessionFile from various locations", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    // sessionFile in data
    agent.onPiMessage({ type: "response", data: { sessionFile: "/tmp/sess1.jsonl" } });
    assert.ok(agent.sessionKey?.includes("/tmp/sess1.jsonl"));

    // sessionFile at top level
    agent.onPiMessage({ type: "response", sessionFile: "/tmp/sess2.jsonl" });
    assert.ok(agent.sessionKey?.includes("/tmp/sess2.jsonl"));

    // sessionPath in data
    agent.onPiMessage({ type: "response", data: { sessionPath: "/tmp/sess3.jsonl" } });
    assert.ok(agent.sessionKey?.includes("/tmp/sess3.jsonl"));
  });

  test("PiAgent onStdout handles large buffer without crashing", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    // Send a large chunk that exceeds 50MB threshold
    const huge = "x".repeat(51 * 1024 * 1024);
    agent.onStdout(Buffer.from(huge));
    // Buffer should be truncated, not crashed
    assert.ok(agent.buffer.length < 51 * 1024 * 1024);
  });

  test("PiAgent onStdout handles multi-line JSON messages", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    let received = null;
    agent.broadcast = (obj) => { received = obj; };

    // Send two valid JSON lines in one chunk
    const chunk = JSON.stringify({ type: "agent_start" }) + "\n" + JSON.stringify({ type: "agent_end" }) + "\n";
    agent.onStdout(Buffer.from(chunk));

    // Both should be processed (agent_end is the last broadcast)
    assert.equal(agent.isStreaming, false);
  });

  test("PiAgent onStdout ignores non-JSON lines silently", () => {
    const agent = new PiAgent(process.cwd());
    agent.alive = true;

    // Mix of valid and invalid lines
    const chunk = "not json\n" + JSON.stringify({ type: "agent_start" }) + "\n  \n{broken\n";
    agent.onStdout(Buffer.from(chunk));

    // Should not crash, agent_start should be processed
    assert.equal(agent.isStreaming, true);
  });

  test("getOrCreateAgent reuses existing agent for same session key", () => {
    const origMax = config.maxConcurrentAgents;
    config.maxConcurrentAgents = 0; // Disable limit

    const cwd = "/tmp";
    const sessionPath = "/tmp/test-reuse.jsonl";

    const agent1 = getOrCreateAgent(cwd, sessionPath);
    assert.ok(agent1.alive);

    const agent2 = getOrCreateAgent(cwd, sessionPath);
    assert.equal(agent1, agent2); // Same instance

    // Cleanup
    agent1.stop();
    config.maxConcurrentAgents = origMax;
  });

  test("getOrCreateAgent throws at capacity", () => {
    const origMax = config.maxConcurrentAgents;
    config.maxConcurrentAgents = 1;

    const agent1 = getOrCreateAgent("/tmp", null);
    assert.ok(agent1.alive);

    // Second agent should throw
    assert.throws(() => getOrCreateAgent("/tmp", "/tmp/another.jsonl"), /capacity/);

    agent1.stop();
    config.maxConcurrentAgents = origMax;
  });

  test("shutdownAllAgents stops all live agents", () => {
    const origMax = config.maxConcurrentAgents;
    config.maxConcurrentAgents = 0;

    const a1 = getOrCreateAgent("/tmp", null);
    const a2 = getOrCreateAgent("/tmp", "/tmp/sess-x.jsonl");
    assert.ok(a1.alive || a2.alive);

    shutdownAllAgents("Test shutdown");
    assert.equal(a1.alive, false);
    assert.equal(a2.alive, false);

    config.maxConcurrentAgents = origMax;
  });

  after(() => {
    shutdownAllAgents("Test cleanup");
  });
});
