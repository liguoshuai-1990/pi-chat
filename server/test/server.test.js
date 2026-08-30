import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../src/ws.js";
import { verifyToken } from "../src/auth.js";
import { config } from "../src/config.js";

describe("Pi-Chat Server Gateway Unit Tests", () => {
  test("verifyToken validates correctly when AUTH_TOKEN is unset or set", () => {
    // When config.authToken is empty, all tokens pass
    const origToken = config.authToken;
    config.authToken = "";
    assert.equal(verifyToken(""), true);
    assert.equal(verifyToken("any-token"), true);

    // When config.authToken is configured
    config.authToken = "secret-vps-key-123";
    assert.equal(verifyToken("secret-vps-key-123"), true);
    assert.equal(verifyToken("wrong-key"), false);
    assert.equal(verifyToken(""), false);
    assert.equal(verifyToken(null), false);

    // Restore
    config.authToken = origToken;
  });

  test("isAllowedOrigin defends against Cross-Site WebSocket Hijacking", () => {
    assert.equal(isAllowedOrigin("http://localhost:3000", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:8080", "localhost:3000"), true);

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
});
