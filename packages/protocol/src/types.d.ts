export type ClientMessageType =
  | "auth"
  | "prompt"
  | "client_send"
  | "steer"
  | "abort"
  | "new_session"
  | "switch_session"
  | "set_session_name"
  | "get_entries"
  | "get_state"
  | "get_available_models"
  | "set_model"
  | "set_thinking_level"
  | "cycle_thinking_level"
  | "compact"
  | "ping"
  | "extension_ui_response";

export type ServerMessageType =
  | "agent_start"
  | "agent_end"
  | "agent_settled"
  | "agent_status"
  | "agent_stream"
  | "message_update"
  | "remote_user_prompt"
  | "remote_user_steer"
  | "backfill_start"
  | "backfill_end"
  | "response"
  | "pong"
  | "error"
  | "pi_exit"
  | "extension_ui_request";

export interface ImageAttachment {
  type: "image";
  data: string; // Base64 data URL
  mimeType: string;
}

export interface ClientPromptMessage {
  type: "prompt" | "client_send";
  message: string;
  images?: ImageAttachment[];
}

export interface ClientSteerMessage {
  type: "steer";
  message: string;
}

export interface ClientAbortMessage {
  type: "abort";
}

export interface ClientAuthMessage {
  type: "auth";
  token: string;
}

export interface ClientPingMessage {
  type: "ping";
  timestamp?: number;
}

export interface ClientSwitchSessionMessage {
  type: "switch_session";
  sessionPath: string;
}

export interface ClientSetModelMessage {
  type: "set_model";
  provider: string;
  modelId: string;
}

export interface ClientSetThinkingLevelMessage {
  type: "set_thinking_level";
  level: string;
}

export interface ClientSetSessionNameMessage {
  type: "set_session_name";
  name: string;
}

export interface ClientGetEntriesMessage {
  type: "get_entries";
  since?: number | string;
}

export interface ClientGetStateMessage {
  type: "get_state";
}

export interface ClientGetAvailableModelsMessage {
  type: "get_available_models";
}

export interface ClientExtensionUiResponseMessage {
  type: "extension_ui_response";
  id: string;
  [key: string]: unknown;
}

export interface ClientCycleThinkingLevelMessage {
  type: "cycle_thinking_level";
}

export interface ClientCompactMessage {
  type: "compact";
}

export interface AssistantMessageEvent {
  type: string;
  delta?: string;
  content?: string;
  contentIndex?: number;
  toolCall?: { id?: string; name?: string; arguments?: unknown };
}

export interface ServerMessageUpdateMessage {
  type: "message_update";
  assistantMessageEvent?: AssistantMessageEvent;
  delta?: string;
  isThinking?: boolean;
}

export interface ServerAgentStreamMessage {
  type: "agent_stream";
  delta?: string;
  content?: string;
  role?: string;
  messageId?: string;
  isThinking?: boolean;
}

export interface ServerAgentStatusMessage {
  type: "agent_status";
  status: "idle" | "streaming" | "settled" | "error";
  timestamp?: number;
  details?: unknown;
}

export interface ServerPongMessage {
  type: "pong";
  timestamp: number;
}

export interface ServerErrorMessage {
  type: "error";
  code: string;
  message: string;
  details?: unknown;
}

export interface ServerRemoteUserPromptMessage {
  type: "remote_user_prompt" | "remote_user_steer";
  message: string;
  images?: ImageAttachment[];
  isSteer?: boolean;
}

export interface ServerExtensionUiRequestMessage {
  type: "extension_ui_request";
  id: string;
  method: "notify" | "confirm" | "select" | "input" | "editor" | string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  notifyType?: "info" | "warning" | "error";
  [key: string]: unknown;
}

export interface ServerBackfillStartMessage {
  type: "backfill_start";
  count: number;
}

export interface ServerBackfillEndMessage {
  type: "backfill_end";
  streaming: boolean;
  state: "idle" | "streaming" | "settled" | string;
  overflowed?: boolean;
}

export interface ToolCallPayload {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown> | string;
}

export interface ToolResultPayload {
  toolCallId?: string;
  isError?: boolean;
  content?: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
}

export interface ServerResponse<T = unknown> {
  type: "response";
  id?: string;
  success: boolean;
  data?: T;
  error?: string;
}

export function formatDuration(ms?: number | null): string;


// --- Runtime value exports (P0-10: previously missing, making the entire API untyped) ---

export declare const ClientMessageType: Readonly<{
  AUTH: "auth";
  PROMPT: "prompt";
  CLIENT_SEND: "client_send";
  STEER: "steer";
  ABORT: "abort";
  NEW_SESSION: "new_session";
  SWITCH_SESSION: "switch_session";
  SET_SESSION_NAME: "set_session_name";
  GET_ENTRIES: "get_entries";
  GET_STATE: "get_state";
  GET_AVAILABLE_MODELS: "get_available_models";
  SET_MODEL: "set_model";
  SET_THINKING_LEVEL: "set_thinking_level";
  CYCLE_THINKING_LEVEL: "cycle_thinking_level";
  COMPACT: "compact";
  PING: "ping";
  EXTENSION_UI_RESPONSE: "extension_ui_response";
}>;

export declare const ServerMessageType: Readonly<{
  AGENT_START: "agent_start";
  AGENT_END: "agent_end";
  AGENT_SETTLED: "agent_settled";
  AGENT_STATUS: "agent_status";
  AGENT_STREAM: "agent_stream";
  MESSAGE_UPDATE: "message_update";
  REMOTE_USER_PROMPT: "remote_user_prompt";
  REMOTE_USER_STEER: "remote_user_steer";
  BACKFILL_START: "backfill_start";
  BACKFILL_END: "backfill_end";
  RESPONSE: "response";
  PONG: "pong";
  ERROR: "error";
  PI_EXIT: "pi_exit";
  EXTENSION_UI_REQUEST: "extension_ui_request";
}>;

export declare const ErrorCode: Readonly<{
  UNAUTHORIZED: "unauthorized";
  FORBIDDEN: "forbidden";
  CAPACITY: "capacity";
  INVALID_MESSAGE: "invalid_message";
  AGENT_NOT_FOUND: "agent_not_found";
  SPAWN_FAILED: "spawn_failed";
  INTERNAL_ERROR: "internal_error";
}>;

export declare const AgentState: Readonly<{
  IDLE: "idle";
  STREAMING: "streaming";
  SETTLED: "settled";
  ERROR: "error";
}>;

// Constructor function declarations
export declare function createPromptMessage(message: string, images?: ImageAttachment[]): ClientPromptMessage;
export declare function createSteerMessage(message: string): ClientSteerMessage;
export declare function createAbortMessage(): ClientAbortMessage;
export declare function createAuthMessage(token: string): ClientAuthMessage;
export declare function createPingMessage(): ClientPingMessage;
export declare function createPongMessage(): ServerPongMessage;
export declare function createNewSessionMessage(): { type: "new_session" };
export declare function createSwitchSessionMessage(sessionPath: string): ClientSwitchSessionMessage;
export declare function createSetModelMessage(provider: string, modelId: string): ClientSetModelMessage;
export declare function createSetThinkingLevelMessage(level: string | number): ClientSetThinkingLevelMessage;
export declare function createCycleThinkingLevelMessage(): { type: "cycle_thinking_level" };
export declare function createCompactMessage(): { type: "compact" };
export declare function createSetSessionNameMessage(name: string): ClientSetSessionNameMessage;
export declare function createGetEntriesMessage(since?: number | string): ClientGetEntriesMessage;
export declare function createGetStateMessage(): ClientGetStateMessage;
export declare function createGetAvailableModelsMessage(): ClientGetAvailableModelsMessage;
export declare function createExtensionUiResponseMessage(id: string, extra?: Record<string, unknown>): ClientExtensionUiResponseMessage;
export declare function createRemoteUserPromptMessage(message: string, images?: ImageAttachment[], isSteer?: boolean): ServerRemoteUserPromptMessage;
export declare function createRemoteUserSteerMessage(message: string): ServerRemoteUserPromptMessage;
export declare function createExtensionUiRequestMessage(id: string, method: string, options?: Record<string, unknown>): ServerExtensionUiRequestMessage;
export declare function createBackfillStartMessage(count: number): ServerBackfillStartMessage;
export declare function createBackfillEndMessage(streaming?: boolean, state?: string, overflowed?: boolean): ServerBackfillEndMessage;
export declare function createErrorMessage(code: string, message: string, details?: unknown): ServerErrorMessage;
export declare function createAgentStatusMessage(status: string, extra?: Record<string, unknown>): ServerAgentStatusMessage;

// Validator and normalizer declarations
export declare function normalizeClientMessage(msg: unknown): Record<string, unknown> | null;
export declare function validateClientMessage(msg: unknown): { valid: boolean; error?: string };
