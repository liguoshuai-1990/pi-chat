export namespace PiProtocol {
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
