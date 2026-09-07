import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ClientMessageType,
  ServerMessageType,
  ErrorCode,
  AgentState,
  createPromptMessage,
  createSteerMessage,
  createAbortMessage,
  createAuthMessage,
  createPingMessage,
  createPongMessage,
  createNewSessionMessage,
  createSetModelMessage,
  createSetThinkingLevelMessage,
  createCycleThinkingLevelMessage,
  createCompactMessage,
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
  createAgentStatusMessage,
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

    const newSessionMsg = createNewSessionMessage();
    assert.equal(newSessionMsg.type, ClientMessageType.NEW_SESSION);

    const setModelMsg = createSetModelMessage("openai", "gpt-4o");
    assert.equal(setModelMsg.type, ClientMessageType.SET_MODEL);
    assert.equal(setModelMsg.provider, "openai");
    assert.equal(setModelMsg.modelId, "gpt-4o");

    const setThinkingMsg = createSetThinkingLevelMessage("high");
    assert.equal(setThinkingMsg.type, ClientMessageType.SET_THINKING_LEVEL);
    assert.equal(setThinkingMsg.level, "high");

    const cycleThinkingMsg = createCycleThinkingLevelMessage();
    assert.equal(cycleThinkingMsg.type, ClientMessageType.CYCLE_THINKING_LEVEL);

    const compactMsg = createCompactMessage();
    assert.equal(compactMsg.type, ClientMessageType.COMPACT);

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

    const agentStatusMsg = createAgentStatusMessage("streaming", { detail: "thinking" });
    assert.equal(agentStatusMsg.type, ServerMessageType.AGENT_STATUS);
    assert.equal(agentStatusMsg.status, "streaming");
    assert.equal(agentStatusMsg.detail, "thinking");
    assert.ok(typeof agentStatusMsg.timestamp === "number");
  });

  test("Message constructors handle edge cases safely", () => {
    // createAuthMessage with null/undefined should produce empty string
    assert.equal(createAuthMessage(null).token, "");
    assert.equal(createAuthMessage(undefined).token, "");

    // createPromptMessage with non-array images should produce empty array
    assert.deepEqual(createPromptMessage("hi", "not-array").images, []);
    assert.deepEqual(createPromptMessage("hi").images, []);

    // createRemoteUserPromptMessage with isSteer=true
    const steerPrompt = createRemoteUserPromptMessage("steer msg", [], true);
    assert.equal(steerPrompt.type, ServerMessageType.REMOTE_USER_STEER);
    assert.equal(steerPrompt.isSteer, true);

    // createExtensionUiResponseMessage merges extra fields
    const extResp = createExtensionUiResponseMessage("id-1", { result: "yes", confirmed: false });
    assert.equal(extResp.id, "id-1");
    assert.equal(extResp.result, "yes");
    assert.equal(extResp.confirmed, false);

    // createErrorMessage with details
    const errWithDetails = createErrorMessage(ErrorCode.INTERNAL_ERROR, "boom", { stack: "..." });
    assert.equal(errWithDetails.details.stack, "...");

    // createBackfillStartMessage with 0 or negative
    assert.equal(createBackfillStartMessage(0).count, 0);
    assert.equal(createBackfillStartMessage(-1).count, -1); // -1 is truthy so ||0 does not fire

    // createBackfillEndMessage defaults
    const defaultBackfillEnd = createBackfillEndMessage();
    assert.equal(defaultBackfillEnd.streaming, false);
    assert.equal(defaultBackfillEnd.state, "idle");
    assert.equal(defaultBackfillEnd.overflowed, false);

    // createGetEntriesMessage without since param
    const getEntriesNoSince = createGetEntriesMessage();
    assert.equal(getEntriesNoSince.type, ClientMessageType.GET_ENTRIES);
    assert.ok(!("since" in getEntriesNoSince), "since should be omitted when undefined");

    // createSetSessionNameMessage with empty/null
    assert.equal(createSetSessionNameMessage("").name, "");
    assert.equal(createSetSessionNameMessage(null).name, "");
  });

  test("normalizeClientMessage normalizes alias types", () => {
    const sendMsg = { type: "client_send", message: "Hi" };
    const normalized = normalizeClientMessage(sendMsg);
    assert.equal(normalized.type, ClientMessageType.PROMPT);
    assert.equal(normalized.message, "Hi");

    const heartbeatMsg = { type: "heartbeat" };
    const normHeartbeat = normalizeClientMessage(heartbeatMsg);
    assert.equal(normHeartbeat.type, ClientMessageType.PING);

    // Non-object inputs return null
    assert.equal(normalizeClientMessage(null), null);
    assert.equal(normalizeClientMessage("string"), null);
    assert.equal(normalizeClientMessage(123), null);

    // Unknown types pass through unchanged
    const unknown = { type: "unknown_type", data: 123 };
    const normUnknown = normalizeClientMessage(unknown);
    assert.equal(normUnknown.type, "unknown_type");
    assert.equal(normUnknown.data, 123);

    // Normal type passes through unchanged
    const prompt = { type: "prompt", message: "hello" };
    const normPrompt = normalizeClientMessage(prompt);
    assert.equal(normPrompt.type, "prompt");
    assert.equal(normPrompt.message, "hello");
  });

  test("validateClientMessage validates correctness of requests", () => {
    assert.equal(validateClientMessage(null).valid, false);
    assert.equal(validateClientMessage({}).valid, false);

    // Prompt
    assert.equal(validateClientMessage({ type: "prompt", message: "Hello" }).valid, true);
    assert.equal(validateClientMessage({ type: "client_send", message: "Hello" }).valid, true);
    assert.equal(validateClientMessage({ type: "prompt" }).valid, false);

    // Steer
    assert.equal(validateClientMessage({ type: "steer", message: "Go fast" }).valid, true);
    assert.equal(validateClientMessage({ type: "steer", message: "" }).valid, false);
    assert.equal(validateClientMessage({ type: "steer", message: "   " }).valid, false);
    assert.equal(validateClientMessage({ type: "steer" }).valid, false);

    // Switch session
    assert.equal(validateClientMessage({ type: "switch_session", sessionPath: "/session.jsonl" }).valid, true);
    assert.equal(validateClientMessage({ type: "switch_session" }).valid, false);
    assert.equal(validateClientMessage({ type: "switch_session", sessionPath: "" }).valid, false);

    // Set model
    assert.equal(validateClientMessage({ type: "set_model", provider: "anthropic", modelId: "claude-3-5-sonnet" }).valid, true);
    assert.equal(validateClientMessage({ type: "set_model", provider: "anthropic" }).valid, false);
    assert.equal(validateClientMessage({ type: "set_model", modelId: "gpt-4" }).valid, false);

    // Auth
    assert.equal(validateClientMessage({ type: "auth", token: "tok123" }).valid, true);
    assert.equal(validateClientMessage({ type: "auth" }).valid, false);
    assert.equal(validateClientMessage({ type: "auth", token: 123 }).valid, false);

    // Abort, ping, new_session, get_state, get_available_models, get_entries, cycle_thinking_level, compact
    assert.equal(validateClientMessage({ type: "abort" }).valid, true);
    assert.equal(validateClientMessage({ type: "ping" }).valid, true);
    assert.equal(validateClientMessage({ type: "new_session" }).valid, true);
    assert.equal(validateClientMessage({ type: "get_state" }).valid, true);
    assert.equal(validateClientMessage({ type: "get_available_models" }).valid, true);
    assert.equal(validateClientMessage({ type: "get_entries" }).valid, true);
    assert.equal(validateClientMessage({ type: "cycle_thinking_level" }).valid, true);
    assert.equal(validateClientMessage({ type: "compact" }).valid, true);
    assert.equal(validateClientMessage({ type: "heartbeat" }).valid, true);

    // Set session name
    assert.equal(validateClientMessage({ type: "set_session_name", name: "Project A" }).valid, true);
    assert.equal(validateClientMessage({ type: "set_session_name", name: 123 }).valid, false);
    assert.equal(validateClientMessage({ type: "set_session_name" }).valid, true); // name is optional

    // Set thinking level
    assert.equal(validateClientMessage({ type: "set_thinking_level", level: "high" }).valid, true);
    assert.equal(validateClientMessage({ type: "set_thinking_level", level: 2 }).valid, true); // number allowed
    assert.equal(validateClientMessage({ type: "set_thinking_level", level: {} }).valid, false);

    // Extension UI response
    assert.equal(validateClientMessage({ type: "extension_ui_response", id: "req-1" }).valid, true);
    assert.equal(validateClientMessage({ type: "extension_ui_response" }).valid, false);
    assert.equal(validateClientMessage({ type: "extension_ui_response", id: 123 }).valid, false);

    // Unknown type
    assert.equal(validateClientMessage({ type: "totally_fake" }).valid, false);
    assert.equal(validateClientMessage({ type: 123 }).valid, false);
  });

  test("formatDuration formats milliseconds concisely and accurately", () => {
    assert.equal(formatDuration(null), "");
    assert.equal(formatDuration(undefined), "");
    assert.equal(formatDuration(-1), "");
    assert.equal(formatDuration(0), "0.0s");
    assert.equal(formatDuration(450), "0.5s");
    assert.equal(formatDuration(1200), "1.2s");
    assert.equal(formatDuration(59400), "59.4s");
    assert.equal(formatDuration(59950), "1m 0s");
    assert.equal(formatDuration(60000), "1m 0s");
    assert.equal(formatDuration(75400), "1m 15s");
    assert.equal(formatDuration(119950), "2m 0s");
    // Edge: NaN and Infinity
    assert.equal(formatDuration(NaN), "");
    assert.equal(formatDuration(Infinity), "");
    assert.equal(formatDuration(-Infinity), "");
    // Large values
    assert.equal(formatDuration(3600000), "60m 0s");
    assert.equal(formatDuration(3661000), "61m 1s");
  });

  test("Enum constants are frozen and contain expected values", () => {
    // ClientMessageType
    assert.equal(ClientMessageType.AUTH, "auth");
    assert.equal(ClientMessageType.PROMPT, "prompt");
    assert.equal(ClientMessageType.CLIENT_SEND, "client_send");
    assert.equal(ClientMessageType.STEER, "steer");
    assert.equal(ClientMessageType.ABORT, "abort");
    assert.equal(ClientMessageType.NEW_SESSION, "new_session");
    assert.equal(ClientMessageType.SWITCH_SESSION, "switch_session");
    assert.equal(ClientMessageType.COMPACT, "compact");
    assert.equal(ClientMessageType.PING, "ping");
    assert.equal(ClientMessageType.EXTENSION_UI_RESPONSE, "extension_ui_response");

    // ServerMessageType
    assert.equal(ServerMessageType.AGENT_START, "agent_start");
    assert.equal(ServerMessageType.AGENT_END, "agent_end");
    assert.equal(ServerMessageType.AGENT_SETTLED, "agent_settled");
    assert.equal(ServerMessageType.BACKFILL_START, "backfill_start");
    assert.equal(ServerMessageType.BACKFILL_END, "backfill_end");
    assert.equal(ServerMessageType.ERROR, "error");
    assert.equal(ServerMessageType.PI_EXIT, "pi_exit");
    assert.equal(ServerMessageType.EXTENSION_UI_REQUEST, "extension_ui_request");

    // ErrorCode
    assert.equal(ErrorCode.UNAUTHORIZED, "unauthorized");
    assert.equal(ErrorCode.CAPACITY, "capacity");
    assert.equal(ErrorCode.INVALID_MESSAGE, "invalid_message");
    assert.equal(ErrorCode.SPAWN_FAILED, "spawn_failed");

    // AgentState
    assert.equal(AgentState.IDLE, "idle");
    assert.equal(AgentState.STREAMING, "streaming");
    assert.equal(AgentState.SETTLED, "settled");
    assert.equal(AgentState.ERROR, "error");

    // Frozen check
    assert.ok(Object.isFrozen(ClientMessageType));
    assert.ok(Object.isFrozen(ServerMessageType));
    assert.ok(Object.isFrozen(ErrorCode));
    assert.ok(Object.isFrozen(AgentState));
  });
});
