import { test, describe } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { isAllowedOrigin } from "../src/ws.js";
import { verifyToken, verifyWsAuth, authMiddleware } from "../src/auth.js";
import { config, normalizePath, home } from "../src/config.js";
import { createServer } from "../src/server.js";
import { PiAgent, activeAgents } from "../src/agent.js";
import { fileURLToPath } from "node:url";

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

    // Query param
    const reqWithQuery = { url: "/ws?token=my-secret-token", headers: {} };
    assert.equal(verifyWsAuth(reqWithQuery), true);

    // Bearer header
    const reqWithBearer = { url: "/ws", headers: { authorization: "Bearer my-secret-token" } };
    assert.equal(verifyWsAuth(reqWithBearer), true);

    // Custom header
    const reqWithCustomHeader = { url: "/ws", headers: { "x-api-token": "my-secret-token" } };
    assert.equal(verifyWsAuth(reqWithCustomHeader), true);

    // Wrong token
    const reqWithWrongToken = { url: "/ws?token=invalid", headers: {} };
    assert.equal(verifyWsAuth(reqWithWrongToken), false);

    config.authToken = origToken;
  });

  test("authMiddleware handles unauthorized and authorized requests", () => {
    const origToken = config.authToken;
    config.authToken = "test-token";

    let nextCalled = false;
    const next = () => { nextCalled = true; };

    // Authorized request
    nextCalled = false;
    const reqAuth = { headers: { authorization: "Bearer test-token" }, query: {} };
    const resAuth = {};
    authMiddleware(reqAuth, resAuth, next);
    assert.equal(nextCalled, true);

    // Unauthorized request
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

    config.authToken = origToken;
  });

  test("isAllowedOrigin defends against Cross-Site WebSocket Hijacking", () => {
    assert.equal(isAllowedOrigin("http://localhost:3000", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:8080", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://[::1]:3000", "[::1]:3000"), true);
    assert.equal(isAllowedOrigin("http://localhost:3000", "[::1]:3000"), true);

    // Non-browser direct requests (origin undefined)
    assert.equal(isAllowedOrigin("", "localhost:3000"), true);
    assert.equal(isAllowedOrigin(undefined, "localhost:3000"), true);

    // Untrusted external origins
    assert.equal(isAllowedOrigin("http://evil-attacker.xyz", "localhost:3000"), false);
    assert.equal(isAllowedOrigin("https://phishing.site", "localhost:3000"), false);

    // Wildcard allowed origins
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
  });

  test("normalizePath handles tilde expansion and relative paths", () => {
    assert.equal(normalizePath("~"), home());
    assert.equal(normalizePath("~/test.jsonl"), `${home()}/test.jsonl`);
    assert.equal(normalizePath(""), "");
    assert.ok(normalizePath("/tmp/foo").startsWith("/tmp/foo"));
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

    // OPTIONS preflight
    const optRes = await fetch(`http://127.0.0.1:${port}/api/config`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get("access-control-allow-origin"), "http://example.com");
    assert.ok(optRes.headers.get("access-control-allow-methods")?.includes("OPTIONS"));

    // GET with origin
    const getRes = await fetch(`http://127.0.0.1:${port}/api/config`, {
      headers: { Origin: "http://example.com" },
    });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("access-control-allow-origin"), "http://example.com");

    await serverInstance.close();
  });

  test("WebSocket server handles non-object JSON messages safely without crashing", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => {
        // Send non-object JSON payloads
        ws.send("null");
        ws.send("123");
        ws.send("true");
        ws.send("\"string\"");
        setTimeout(() => {
          ws.close();
          resolve();
        }, 50);
      });
      ws.on("error", reject);
    });

    await serverInstance.close();
  });

  test("PiAgent tracks isStreaming vs isBusy accurately without false positives", () => {
    const agent = new PiAgent(process.cwd());
    assert.equal(agent.state, "idle");
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, false);

    // Simulated pending RPC command (like get_state or get_available_models)
    agent.pending.set("1", () => {});
    assert.equal(agent.isStreaming, false); // Pending RPC should NOT make isStreaming true!
    assert.equal(agent.isBusy, true);       // But isBusy is true (for GC / reclamation)

    agent.pending.clear();
    assert.equal(agent.isBusy, false);

    // Turn starts
    agent.onPiMessage({ type: "agent_start" });
    assert.equal(agent.isStreaming, true);
    assert.equal(agent.isBusy, true);

    // Turn ends
    agent.onPiMessage({ type: "agent_end" });
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, false);

    // agent_settled
    agent.onPiMessage({ type: "agent_settled" });
    assert.equal(agent.isStreaming, false);
    assert.equal(agent.isBusy, false);
    assert.equal(agent.eventBuffer.length, 0);

    // Non-streaming response when idle should NOT be buffered
    agent.onPiMessage({ type: "response", command: "get_state", success: true, data: { isStreaming: false } });
    assert.equal(agent.eventBuffer.length, 0);
  });

  test("WebSocket gateway NEW_SESSION preserves busy background agent and attaches to new agent", async () => {
    const serverInstance = createServer();
    const { httpServer } = await serverInstance.listen(0, "127.0.0.1");
    const port = httpServer.address().port;
    const sessionFile = "test_background_session.jsonl";
    const expectedKey = `${normalizePath(process.cwd())}:${normalizePath(sessionFile)}`;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?cwd=${encodeURIComponent(process.cwd())}&session=${encodeURIComponent(sessionFile)}`);
      ws.on("open", () => {
        const firstAgent = activeAgents.get(expectedKey);
        if (firstAgent) {
          firstAgent.setStreaming(true); // Simulate background streaming
        }

        // Send new_session
        ws.send(JSON.stringify({ type: "new_session", id: "test_new" }));

        setTimeout(() => {
          // The previous background agent should still exist in activeAgents
          const prevAgent = activeAgents.get(expectedKey);
          assert.ok(prevAgent, "Previous busy agent must remain in activeAgents");
          assert.equal(prevAgent.isStreaming, true);

          ws.close();
          resolve();
        }, 100);
      });
      ws.on("error", reject);
    });

    await serverInstance.close();
  });

  test("Session sorting handles both numeric and string timestamps safely", () => {
    const mockSessions = [
      { id: "1", timestamp: 1725200000000 },
      { id: "2", timestamp: "2026-09-02T12:00:00.000Z" },
      { id: "3", timestamp: 1725300000000 },
      { id: "4", timestamp: null },
      { id: "5", timestamp: undefined }
    ];

    mockSessions.sort((a, b) => {
      const tsA = typeof a.timestamp === "number" ? a.timestamp : (new Date(a.timestamp || 0).getTime() || 0);
      const tsB = typeof b.timestamp === "number" ? b.timestamp : (new Date(b.timestamp || 0).getTime() || 0);
      return tsB - tsA;
    });

    assert.equal(mockSessions[0].id, "2"); // 2026 is latest
    assert.equal(mockSessions[1].id, "3");
    assert.equal(mockSessions[2].id, "1");
  });
});
