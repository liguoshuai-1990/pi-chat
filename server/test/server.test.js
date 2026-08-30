import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../src/ws.js";
import { verifyToken, verifyWsAuth, authMiddleware } from "../src/auth.js";
import { config } from "../src/config.js";
import { createServer } from "../src/server.js";

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
  });

  test("Server configuration contains expected defaults and types", () => {
    assert.ok(typeof config.port === "number");
    assert.ok(typeof config.sessionsDir === "string");
    assert.ok(typeof config.idleTimeoutMs === "number");
    assert.ok(typeof config.maxAgentLifetimeMs === "number");
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
});
