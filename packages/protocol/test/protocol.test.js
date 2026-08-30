import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ClientMessageType,
  ServerMessageType,
  ErrorCode,
  createPromptMessage,
  createSteerMessage,
  createAbortMessage,
  createAuthMessage,
  createPingMessage,
  createPongMessage,
  createSetModelMessage,
  createSetThinkingLevelMessage,
  createCycleThinkingLevelMessage,
  createSwitchSessionMessage,
  createErrorMessage,
  normalizeClientMessage,
  validateClientMessage,
} from "../src/index.js";

describe("Pi-Chat Protocol Unit Tests", () => {
  test("Message creation helpers generate compliant schemas", () => {
    const promptMsg = createPromptMessage("Hello Pi", [{ type: "image", data: "base64", mimeType: "image/png" }]);
    assert.equal(promptMsg.type, ClientMessageType.PROMPT);
    assert.equal(promptMsg.message, "Hello Pi");
    assert.equal(promptMsg.images.length, 1);

    const steerMsg = createSteerMessage("Use Python");
    assert.equal(steerMsg.type, ClientMessageType.STEER);
    assert.equal(steerMsg.message, "Use Python");

    const abortMsg = createAbortMessage();
    assert.equal(abortMsg.type, ClientMessageType.ABORT);

    const authMsg = createAuthMessage("secret-token");
    assert.equal(authMsg.type, ClientMessageType.AUTH);
    assert.equal(authMsg.token, "secret-token");

    const pingMsg = createPingMessage();
    assert.equal(pingMsg.type, ClientMessageType.PING);
    assert.ok(typeof pingMsg.timestamp === "number");

    const pongMsg = createPongMessage();
    assert.equal(pongMsg.type, ServerMessageType.PONG);
    assert.ok(typeof pongMsg.timestamp === "number");

    const setModelMsg = createSetModelMessage("openai", "gpt-4o");
    assert.equal(setModelMsg.type, ClientMessageType.SET_MODEL);
    assert.equal(setModelMsg.provider, "openai");
    assert.equal(setModelMsg.modelId, "gpt-4o");

    const setThinkingMsg = createSetThinkingLevelMessage("high");
    assert.equal(setThinkingMsg.type, ClientMessageType.SET_THINKING_LEVEL);
    assert.equal(setThinkingMsg.level, "high");

    const cycleThinkingMsg = createCycleThinkingLevelMessage();
    assert.equal(cycleThinkingMsg.type, ClientMessageType.CYCLE_THINKING_LEVEL);

    const switchMsg = createSwitchSessionMessage("/path/to/session.jsonl");
    assert.equal(switchMsg.type, ClientMessageType.SWITCH_SESSION);
    assert.equal(switchMsg.sessionPath, "/path/to/session.jsonl");

    const errorMsg = createErrorMessage(ErrorCode.UNAUTHORIZED, "Invalid token");
    assert.equal(errorMsg.type, ServerMessageType.ERROR);
    assert.equal(errorMsg.code, ErrorCode.UNAUTHORIZED);
    assert.equal(errorMsg.message, "Invalid token");
  });

  test("normalizeClientMessage normalizes alias types", () => {
    const sendMsg = { type: "client_send", message: "Hi" };
    const normalized = normalizeClientMessage(sendMsg);
    assert.equal(normalized.type, ClientMessageType.PROMPT);
    assert.equal(normalized.message, "Hi");

    const heartbeatMsg = { type: "heartbeat" };
    const normHeartbeat = normalizeClientMessage(heartbeatMsg);
    assert.equal(normHeartbeat.type, ClientMessageType.PING);
  });

  test("validateClientMessage validates correctness of requests", () => {
    assert.equal(validateClientMessage(null).valid, false);
    assert.equal(validateClientMessage({}).valid, false);

    assert.equal(validateClientMessage({ type: "prompt", message: "Hello" }).valid, true);
    assert.equal(validateClientMessage({ type: "client_send", message: "Hello" }).valid, true);
    assert.equal(validateClientMessage({ type: "prompt" }).valid, false);

    assert.equal(validateClientMessage({ type: "steer", message: "Go fast" }).valid, true);
    assert.equal(validateClientMessage({ type: "steer", message: "" }).valid, false);

    assert.equal(validateClientMessage({ type: "switch_session", sessionPath: "/session.jsonl" }).valid, true);
    assert.equal(validateClientMessage({ type: "switch_session" }).valid, false);

    assert.equal(validateClientMessage({ type: "set_model", provider: "anthropic", modelId: "claude-3-5-sonnet" }).valid, true);
    assert.equal(validateClientMessage({ type: "set_model", provider: "anthropic" }).valid, false);

    assert.equal(validateClientMessage({ type: "auth", token: "tok123" }).valid, true);
    assert.equal(validateClientMessage({ type: "auth" }).valid, false);

    assert.equal(validateClientMessage({ type: "abort" }).valid, true);
    assert.equal(validateClientMessage({ type: "ping" }).valid, true);
  });
});
