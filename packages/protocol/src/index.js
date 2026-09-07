/**
 * @liguoshuai/pi-chat-protocol
 * Standardized communication protocol definitions, helpers, and validators
 * for Web, Android, and HarmonyOS clients connecting to the Pi Agent Gateway.
 */

export const ClientMessageType = Object.freeze({
  AUTH: "auth",
  PROMPT: "prompt",
  CLIENT_SEND: "client_send", // Alias for prompt
  STEER: "steer",
  ABORT: "abort",
  NEW_SESSION: "new_session",
  SWITCH_SESSION: "switch_session",
  SET_SESSION_NAME: "set_session_name",
  GET_ENTRIES: "get_entries",
  GET_STATE: "get_state",
  GET_AVAILABLE_MODELS: "get_available_models",
  SET_MODEL: "set_model",
  SET_THINKING_LEVEL: "set_thinking_level",
  CYCLE_THINKING_LEVEL: "cycle_thinking_level",
  COMPACT: "compact",
  PING: "ping",
  EXTENSION_UI_RESPONSE: "extension_ui_response",
});

export const ServerMessageType = Object.freeze({
  AGENT_START: "agent_start",
  AGENT_END: "agent_end",
  AGENT_SETTLED: "agent_settled",
  AGENT_STATUS: "agent_status",
  AGENT_STREAM: "agent_stream",
  MESSAGE_UPDATE: "message_update",
  REMOTE_USER_PROMPT: "remote_user_prompt",
  REMOTE_USER_STEER: "remote_user_steer",
  BACKFILL_START: "backfill_start",
  BACKFILL_END: "backfill_end",
  RESPONSE: "response",
  PONG: "pong",
  ERROR: "error",
  PI_EXIT: "pi_exit",
  EXTENSION_UI_REQUEST: "extension_ui_request",
});

export const ErrorCode = Object.freeze({
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  CAPACITY: "capacity",
  INVALID_MESSAGE: "invalid_message",
  AGENT_NOT_FOUND: "agent_not_found",
  SPAWN_FAILED: "spawn_failed",
  INTERNAL_ERROR: "internal_error",
});

export const AgentState = Object.freeze({
  IDLE: "idle",
  STREAMING: "streaming",
  SETTLED: "settled",
  ERROR: "error",
});

/**
 * Message Constructors
 */
export function createPromptMessage(message, images = [], id = null) {
  return {
    type: ClientMessageType.PROMPT,
    message,
    images: Array.isArray(images) ? images : [],
    ...(id ? { id } : {}),
  };
}

export function createSteerMessage(message, id = null) {
  return {
    type: ClientMessageType.STEER,
    message,
    ...(id ? { id } : {}),
  };
}

export function createAbortMessage() {
  return {
    type: ClientMessageType.ABORT,
  };
}

export function createAuthMessage(token) {
  return {
    type: ClientMessageType.AUTH,
    token: String(token ?? ""),
  };
}

export function createPingMessage() {
  return {
    type: ClientMessageType.PING,
    timestamp: Date.now(),
  };
}

export function createPongMessage() {
  return {
    type: ServerMessageType.PONG,
    timestamp: Date.now(),
  };
}

export function createNewSessionMessage() {
  return {
    type: ClientMessageType.NEW_SESSION,
  };
}

export function createSwitchSessionMessage(sessionPath) {
  return {
    type: ClientMessageType.SWITCH_SESSION,
    sessionPath: String(sessionPath ?? ""),
  };
}

export function createSetModelMessage(provider, modelId) {
  return {
    type: ClientMessageType.SET_MODEL,
    provider: String(provider ?? ""),
    modelId: String(modelId ?? ""),
  };
}

export function createSetThinkingLevelMessage(level) {
  return {
    type: ClientMessageType.SET_THINKING_LEVEL,
    level: String(level ?? ""),
  };
}

export function createCycleThinkingLevelMessage() {
  return {
    type: ClientMessageType.CYCLE_THINKING_LEVEL,
  };
}

export function createCompactMessage() {
  return {
    type: ClientMessageType.COMPACT,
  };
}

export function createSetSessionNameMessage(name) {
  return {
    type: ClientMessageType.SET_SESSION_NAME,
    name: String(name ?? ""),
  };
}

export function createGetEntriesMessage(since = undefined) {
  return {
    type: ClientMessageType.GET_ENTRIES,
    ...(since !== undefined ? { since } : {}),
  };
}

export function createGetStateMessage() {
  return {
    type: ClientMessageType.GET_STATE,
  };
}

export function createGetAvailableModelsMessage() {
  return {
    type: ClientMessageType.GET_AVAILABLE_MODELS,
  };
}

export function createExtensionUiResponseMessage(id, extra = {}) {
  return {
    ...extra,
    type: ClientMessageType.EXTENSION_UI_RESPONSE,
    id: String(id ?? ""),
  };
}

export function createRemoteUserPromptMessage(message, images = [], isSteer = false) {
  return {
    type: isSteer ? ServerMessageType.REMOTE_USER_STEER : ServerMessageType.REMOTE_USER_PROMPT,
    message: String(message ?? ""),
    images: Array.isArray(images) ? images : [],
    ...(isSteer ? { isSteer: true } : {}),
  };
}

export function createRemoteUserSteerMessage(message) {
  return createRemoteUserPromptMessage(message, [], true);
}

export function createExtensionUiRequestMessage(id, method, options = {}) {
  return {
    ...options,
    type: ServerMessageType.EXTENSION_UI_REQUEST,
    id: String(id ?? ""),
    method: String(method ?? ""),
  };
}

export function createBackfillStartMessage(count, backfillId = null) {
  return {
    type: ServerMessageType.BACKFILL_START,
    count: Number(count || 0),
    ...(backfillId ? { backfillId } : {}),
  };
}

export function createBackfillEndMessage(streaming = false, state = "idle", overflowed = false, backfillId = null) {
  return {
    type: ServerMessageType.BACKFILL_END,
    streaming: Boolean(streaming),
    state: String(state ?? "idle"),
    overflowed: Boolean(overflowed),
    ...(backfillId ? { backfillId } : {}),
  };
}

export function createErrorMessage(code, message, details = null) {
  return {
    type: ServerMessageType.ERROR,
    code,
    message,
    ...(details ? { details } : {}),
  };
}

export function createAgentStatusMessage(status, extra = {}) {
  return {
    ...extra,
    type: ServerMessageType.AGENT_STATUS,
    status,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes incoming client messages to standard canonical types.
 * For example, converts client_send -> prompt, heartbeat -> ping.
 */
export function normalizeClientMessage(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return null;

  const normalized = { ...msg };
  // P1-13: Strip dangerous keys to prevent prototype pollution
  delete normalized.__proto__;
  delete normalized.constructor;
  delete normalized.prototype;

  if (normalized.type === "client_send") {
    normalized.type = ClientMessageType.PROMPT;
  } else if (normalized.type === "heartbeat") {
    normalized.type = ClientMessageType.PING;
  }

  return normalized;
}

/**
 * Validates whether a client message conforms to the protocol contract.
 */
export function validateClientMessage(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { valid: false, error: "Message must be a JSON object" };
  }

  // P1-13: Reject messages with dangerous prototype-polluting keys
  if (Object.prototype.hasOwnProperty.call(msg, "__proto__") ||
      Object.prototype.hasOwnProperty.call(msg, "constructor") ||
      Object.prototype.hasOwnProperty.call(msg, "prototype")) {
    return { valid: false, error: "Forbidden property in message" };
  }

  const { type } = msg;
  if (!type || typeof type !== "string") {
    return { valid: false, error: "Missing or invalid 'type' field in message" };
  }

  switch (type) {
    case ClientMessageType.PROMPT:
    case "client_send":
      if (typeof msg.message !== "string" && !Array.isArray(msg.images)) {
        return { valid: false, error: "Prompt message requires a string 'message' or 'images' array" };
      }
      // P1-16: Enforce size limits to prevent DoS
      if (typeof msg.message === "string" && msg.message.length > 1000000) {
        return { valid: false, error: "Message too large (max 1MB)" };
      }
      if (Array.isArray(msg.images) && msg.images.length > 10) {
        return { valid: false, error: "Too many images (max 10)" };
      }
      return { valid: true };

    case ClientMessageType.STEER:
      if (typeof msg.message !== "string" || !msg.message.trim()) {
        return { valid: false, error: "Steer message requires a non-empty 'message' string" };
      }
      return { valid: true };

    case ClientMessageType.SWITCH_SESSION:
      if (typeof msg.sessionPath !== "string" || !msg.sessionPath.trim()) {
        return { valid: false, error: "Switch session requires a valid 'sessionPath' string" };
      }
      return { valid: true };

    case ClientMessageType.SET_MODEL:
      if (typeof msg.provider !== "string" || !msg.provider.trim() ||
          typeof msg.modelId !== "string" || !msg.modelId.trim()) {
        return { valid: false, error: "Set model requires non-empty string 'provider' and 'modelId'" };
      }
      return { valid: true };

    case ClientMessageType.AUTH:
      if (typeof msg.token !== "string") {
        return { valid: false, error: "Auth message requires 'token' string" };
      }
      return { valid: true };

    case ClientMessageType.SET_SESSION_NAME:
      if (msg.name !== undefined && typeof msg.name !== "string") {
        return { valid: false, error: "Set session name requires 'name' to be a string" };
      }
      return { valid: true };

    case ClientMessageType.SET_THINKING_LEVEL:
      if (typeof msg.level !== "string" && typeof msg.level !== "number") {
        return { valid: false, error: "Set thinking level requires 'level' string or number" };
      }
      return { valid: true };

    case ClientMessageType.EXTENSION_UI_RESPONSE:
      if (!msg.id || typeof msg.id !== "string") {
        return { valid: false, error: "Extension UI response requires string 'id'" };
      }
      return { valid: true };

    case ClientMessageType.ABORT:
    case ClientMessageType.NEW_SESSION:
    case ClientMessageType.GET_STATE:
    case ClientMessageType.GET_AVAILABLE_MODELS:
    case ClientMessageType.GET_ENTRIES:
    case ClientMessageType.CYCLE_THINKING_LEVEL:
    case ClientMessageType.COMPACT:
    case ClientMessageType.PING:
    case "heartbeat":
      return { valid: true };

    default:
      // Reject unknown message types to prevent arbitrary command forwarding
      return { valid: false, error: `Unknown message type '${type}'` };
  }
}

/**
 * Validates whether a server message conforms to the protocol contract.
 * Use this before sending messages to clients to prevent malformed data.
 */
export function validateServerMessage(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { valid: false, error: "Server message must be a JSON object" };
  }

  const { type } = msg;
  if (!type || typeof type !== "string") {
    return { valid: false, error: "Missing or invalid 'type' field in server message" };
  }

  const validTypes = Object.values(ServerMessageType);
  if (!validTypes.includes(type)) {
    return { valid: false, error: `Unknown server message type '${type}'` };
  }

  // Type-specific validation
  switch (type) {
    case ServerMessageType.ERROR:
      if (typeof msg.message !== "string") {
        return { valid: false, error: "Error message requires 'message' string" };
      }
      return { valid: true };

    case ServerMessageType.BACKFILL_START:
      if (typeof msg.count !== "number" || msg.count < 0) {
        return { valid: false, error: "Backfill start requires non-negative 'count' number" };
      }
      return { valid: true };

    case ServerMessageType.BACKFILL_END:
      if (typeof msg.streaming !== "boolean") {
        return { valid: false, error: "Backfill end requires 'streaming' boolean" };
      }
      return { valid: true };

    case ServerMessageType.REMOTE_USER_PROMPT:
    case ServerMessageType.REMOTE_USER_STEER:
      if (typeof msg.message !== "string") {
        return { valid: false, error: "Remote user prompt requires 'message' string" };
      }
      return { valid: true };

    case ServerMessageType.RESPONSE:
      if (typeof msg.success !== "boolean") {
        return { valid: false, error: "Response requires 'success' boolean" };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

/**
 * Formats duration in milliseconds into a concise, human-readable string.
 * Examples: 450 -> "0.5s", 3200 -> "3.2s", 65000 -> "1m 5s"
 */
export function formatDuration(ms) {
  if (ms == null || isNaN(ms) || !isFinite(ms) || ms < 0) return "";
  const totalSecs = Math.round(ms / 1000);
  if (totalSecs < 60) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m ${secs}s`;
}

