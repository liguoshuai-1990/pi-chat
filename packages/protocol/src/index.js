/**
 * @pi-chat/protocol
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
  BACKFILL_START: "backfill_start",
  BACKFILL_END: "backfill_end",
  RESPONSE: "response",
  PONG: "pong",
  ERROR: "error",
  PI_EXIT: "pi_exit",
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
export function createPromptMessage(message, images = []) {
  return {
    type: ClientMessageType.PROMPT,
    message,
    images: Array.isArray(images) ? images : [],
  };
}

export function createSteerMessage(message) {
  return {
    type: ClientMessageType.STEER,
    message,
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
    token: String(token || ""),
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
    sessionPath: String(sessionPath || ""),
  };
}

export function createSetModelMessage(provider, modelId) {
  return {
    type: ClientMessageType.SET_MODEL,
    provider: String(provider || ""),
    modelId: String(modelId || ""),
  };
}

export function createSetThinkingLevelMessage(level) {
  return {
    type: ClientMessageType.SET_THINKING_LEVEL,
    level: String(level || ""),
  };
}

export function createCycleThinkingLevelMessage() {
  return {
    type: ClientMessageType.CYCLE_THINKING_LEVEL,
  };
}

export function createSetSessionNameMessage(name) {
  return {
    type: ClientMessageType.SET_SESSION_NAME,
    name: String(name || ""),
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
    type: ClientMessageType.EXTENSION_UI_RESPONSE,
    id,
    ...extra,
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
    type: ServerMessageType.AGENT_STATUS,
    status,
    timestamp: Date.now(),
    ...extra,
  };
}

/**
 * Normalizes incoming client messages to standard canonical types.
 * For example, converts client_send -> prompt, heartbeat -> ping.
 */
export function normalizeClientMessage(msg) {
  if (!msg || typeof msg !== "object") return null;

  const normalized = { ...msg };

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
  if (!msg || typeof msg !== "object") {
    return { valid: false, error: "Message must be a JSON object" };
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
      if (!msg.provider || !msg.modelId) {
        return { valid: false, error: "Set model requires 'provider' and 'modelId'" };
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

    case ClientMessageType.ABORT:
    case ClientMessageType.NEW_SESSION:
    case ClientMessageType.GET_STATE:
    case ClientMessageType.GET_AVAILABLE_MODELS:
    case ClientMessageType.GET_ENTRIES:
    case ClientMessageType.CYCLE_THINKING_LEVEL:
    case ClientMessageType.PING:
    case "heartbeat":
    case ClientMessageType.EXTENSION_UI_RESPONSE:
      return { valid: true };

    default:
      // Allow forward compatibility for custom/raw RPC commands
      return { valid: true, warning: `Unrecognized message type '${type}', forwarded as raw RPC command` };
  }
}
