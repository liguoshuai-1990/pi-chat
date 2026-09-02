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
  createSetSessionNameMessage,
  createGetEntriesMessage,
  createGetStateMessage,
  createGetAvailableModelsMessage,
  createExtensionUiResponseMessage,
  createRemoteUserPromptMessage,
  createRemoteUserSteerMessage,
  createExtensionUiRequestMessage,
  createErrorMessage,
  createBackfillStartMessage,
  createBackfillEndMessage,
  normalizeClientMessage,
  validateClientMessage,
  formatDuration,
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

    const setNameMsg = createSetSessionNameMessage("My Session");
    assert.equal(setNameMsg.type, ClientMessageType.SET_SESSION_NAME);
    assert.equal(setNameMsg.name, "My Session");

    const getEntriesMsg = createGetEntriesMessage(10);
    assert.equal(getEntriesMsg.type, ClientMessageType.GET_ENTRIES);
    assert.equal(getEntriesMsg.since, 10);

    const getStateMsg = createGetStateMessage();
    assert.equal(getStateMsg.type, ClientMessageType.GET_STATE);

    const getModelsMsg = createGetAvailableModelsMessage();
    assert.equal(getModelsMsg.type, ClientMessageType.GET_AVAILABLE_MODELS);

    const extUiResp = createExtensionUiResponseMessage("req-1", { confirmed: true });
    assert.equal(extUiResp.type, ClientMessageType.EXTENSION_UI_RESPONSE);
    assert.equal(extUiResp.id, "req-1");
    assert.equal(extUiResp.confirmed, true);

    const remotePrompt = createRemoteUserPromptMessage("User says hello");
    assert.equal(remotePrompt.type, ServerMessageType.REMOTE_USER_PROMPT);
    assert.equal(remotePrompt.message, "User says hello");

    const remoteSteer = createRemoteUserSteerMessage("Change topic");
    assert.equal(remoteSteer.type, ServerMessageType.REMOTE_USER_STEER);
    assert.equal(remoteSteer.message, "Change topic");
    assert.equal(remoteSteer.isSteer, true);

    const extUiReq = createExtensionUiRequestMessage("req-2", "confirm", { message: "Proceed?" });
    assert.equal(extUiReq.type, ServerMessageType.EXTENSION_UI_REQUEST);
    assert.equal(extUiReq.id, "req-2");
    assert.equal(extUiReq.method, "confirm");
    assert.equal(extUiReq.message, "Proceed?");

    const errorMsg = createErrorMessage(ErrorCode.UNAUTHORIZED, "Invalid token");
    assert.equal(errorMsg.type, ServerMessageType.ERROR);
    assert.equal(errorMsg.code, ErrorCode.UNAUTHORIZED);
    assert.equal(errorMsg.message, "Invalid token");

    const backfillStart = createBackfillStartMessage(5);
    assert.equal(backfillStart.type, ServerMessageType.BACKFILL_START);
    assert.equal(backfillStart.count, 5);

    const backfillEnd = createBackfillEndMessage(true, "streaming", true);
    assert.equal(backfillEnd.type, ServerMessageType.BACKFILL_END);
    assert.equal(backfillEnd.streaming, true);
    assert.equal(backfillEnd.state, "streaming");
    assert.equal(backfillEnd.overflowed, true);
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

    assert.equal(validateClientMessage({ type: "set_session_name", name: "Project A" }).valid, true);
    assert.equal(validateClientMessage({ type: "set_session_name", name: 123 }).valid, false);

    assert.equal(validateClientMessage({ type: "set_thinking_level", level: "high" }).valid, true);
    assert.equal(validateClientMessage({ type: "set_thinking_level", level: {} }).valid, false);

    assert.equal(validateClientMessage({ type: "extension_ui_response", id: "req-1" }).valid, true);
    assert.equal(validateClientMessage({ type: "extension_ui_response" }).valid, false);
  });

  test("formatDuration formats milliseconds concisely and accurately", () => {
    assert.equal(formatDuration(null), "");
    assert.equal(formatDuration(undefined), "");
    assert.equal(formatDuration(-1), "");
    assert.equal(formatDuration(0), "0.0s");
    assert.equal(formatDuration(450), "0.5s");
    assert.equal(formatDuration(1200), "1.2s");
    assert.equal(formatDuration(59900), "59.9s");
    assert.equal(formatDuration(60000), "1m 0s");
    assert.equal(formatDuration(75400), "1m 15s");
  });
});
