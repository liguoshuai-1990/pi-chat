export namespace PiProtocol {
  // S8: Complete message type constants for protocol coverage
  export const ClientMessageType = {
    PROMPT: 'prompt',
    STEER: 'steer',
    ABORT: 'abort',
    AUTH: 'auth',
    PING: 'ping',
    NEW_SESSION: 'new_session',
    SWITCH_SESSION: 'switch_session',
    SET_MODEL: 'set_model',
    SET_THINKING_LEVEL: 'set_thinking_level',
    EXTENSION_UI_RESPONSE: 'extension_ui_response',
  } as const;

  export const ServerMessageType = {
    AGENT_START: 'agent_start',
    AGENT_END: 'agent_end',
    AGENT_SETTLED: 'agent_settled',
    MESSAGE_UPDATE: 'message_update',
    MESSAGE_END: 'message_end',
    TOOL_EXECUTION_START: 'tool_execution_start',
    TOOL_EXECUTION_END: 'tool_execution_end',
    REMOTE_USER_PROMPT: 'remote_user_prompt',
    REMOTE_USER_STEER: 'remote_user_steer',
    BACKFILL_START: 'backfill_start',
    BACKFILL_END: 'backfill_end',
    RESPONSE: 'response',
    ERROR: 'error',
    PONG: 'pong',
    PI_EXIT: 'pi_exit',
  } as const;

  export interface ClientBaseMessage {
    type: string;
    [key: string]: any;
  }

  export interface AssistantMessageEvent {
    type?: string;
    delta?: string;
    content?: string;
    contentIndex?: number;
    toolCall?: any;
    id?: string;
    toolName?: string;
  }

  export interface ServerMessage {
    type: string;
    assistantMessageEvent?: AssistantMessageEvent;
    delta?: string;
    content?: any;
    message?: any;
    isThinking?: boolean;
    isSteer?: boolean;
    status?: string;
    id?: any;
    success?: boolean;
    code?: any;
    count?: number;
    streaming?: boolean;
    state?: string;
    overflowed?: boolean;
    data?: any;
    error?: string;
    command?: string;
    toolCallId?: string;
    toolName?: string;
    args?: any;
    result?: any;
    partialResult?: any;
    isError?: boolean;
  }

  export function createPrompt(text: string, images: any[] = []): string {
    return JSON.stringify({
      type: 'prompt',
      message: text,
      images: images
    });
  }

  export function createSteer(text: string): string {
    return JSON.stringify({
      type: 'steer',
      message: text
    });
  }

  export function createAbort(): string {
    return JSON.stringify({
      type: 'abort'
    });
  }

  // S8: Add missing auth message creator
  export function createAuth(token: string): string {
    return JSON.stringify({
      type: 'auth',
      token: token
    });
  }

  export function createPing(): string {
    return JSON.stringify({
      type: 'ping',
      timestamp: Date.now()
    });
  }

  export function createSwitchSession(sessionPath: string): string {
    return JSON.stringify({
      type: 'switch_session',
      sessionPath: sessionPath
    });
  }

  export function createNewSession(): string {
    return JSON.stringify({
      type: 'new_session'
    });
  }

  export function createSetModel(provider: string, modelId: string): string {
    return JSON.stringify({
      type: 'set_model',
      provider: provider,
      modelId: modelId
    });
  }

  export function createSetThinkingLevel(level: string): string {
    return JSON.stringify({
      type: 'set_thinking_level',
      level: level
    });
  }

  export function createExtensionUiResponse(id: string, extra: any = {}): string {
    return JSON.stringify({
      type: 'extension_ui_response',
      id: id,
      ...extra
    });
  }
}
