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
  | "backfill_start"
  | "backfill_end"
  | "response"
  | "pong"
  | "error"
  | "pi_exit";

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

export interface ServerResponse<T = unknown> {
  type: "response";
  id?: string;
  success: boolean;
  data?: T;
  error?: string;
}
