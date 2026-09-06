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

