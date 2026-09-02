export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool'
}

export enum MessageStatus {
  SENDING = 'sending',
  STREAMING = 'streaming',
  DONE = 'done',
  ERROR = 'error'
}

export interface ImageAttachment {
  type: string;
  data: string; // Base64
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinkingContent: string;
  isThinking: boolean;
  thinkingStartedAt?: number;
  thinkingEndedAt?: number;
  thinkingDuration?: number;
  turnStartedAt?: number;
  turnDuration?: number;
  images: ImageAttachment[];
  status: MessageStatus;
  timestamp: number;
}

export interface SessionInfo {
  file: string;
  name: string;
  id?: string;
  sessionName?: string;
  timestamp?: string;
  firstUser?: string;
  messageCount: number;
}

export interface ServerConfig {
  home: string;
  serverCwd: string;
  version: string;
  authRequired: boolean;
}
