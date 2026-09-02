import { ChatMessage, MessageRole, MessageStatus, SessionInfo } from '../model/ChatModel';
import { WebSocketManager } from '../network/WebSocketManager';
import { HttpService } from '../network/HttpService';
import { PiProtocol } from '../protocol/PiProtocol';

export class ChatViewModel {
  public messages: ChatMessage[] = [];
  public sessions: SessionInfo[] = [];
  public isConnected: boolean = false;
  public isStreaming: boolean = false;
  public currentTitle: string = 'New Chat';
  public cwd: string = '';
  public serverUrl: string = 'http://192.168.1.100:3000';
  public token: string = '';

  private wsManager: WebSocketManager = WebSocketManager.getInstance();
  private httpService: HttpService = new HttpService(this.serverUrl, this.token);
  private updateCallback: () => void = () => {};

  public bindUI(cb: () => void) {
    this.updateCallback = cb;
  }

  public init(serverUrl: string = 'http://192.168.1.100:3000', token: string = '', cwd: string = '') {
    this.serverUrl = serverUrl;
    this.token = token;
    this.cwd = cwd;
    this.httpService = new HttpService(serverUrl, token);

    this.wsManager.addStateListener((connected) => {
      this.isConnected = connected;
      this.notifyUI();
    });

    this.wsManager.addMessageListener((msg) => {
      this.handleServerMessage(msg);
    });

    this.connect();
    this.loadSessions();
  }

  public connect() {
    this.wsManager.connect(this.serverUrl, this.token, this.cwd);
  }

  public async loadSessions() {
    const list = await this.httpService.getSessions(this.cwd);
    this.sessions = list;
    this.notifyUI();
  }

  public sendMessage(text: string, images: any[] = []) {
    if (!text.trim() && images.length === 0) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: MessageRole.USER,
      content: text,
      thinkingContent: '',
      isThinking: false,
      images: images,
      status: MessageStatus.DONE,
      timestamp: Date.now()
    };

    const assistantMsg: ChatMessage = {
      id: `assistant_${Date.now()}`,
      role: MessageRole.ASSISTANT,
      content: '',
      thinkingContent: '',
      isThinking: false,
      turnStartedAt: Date.now(),
      images: [],
      status: MessageStatus.STREAMING,
      timestamp: Date.now()
    };

    this.messages.push(userMsg);
    this.messages.push(assistantMsg);
    this.isStreaming = true;
    this.notifyUI();

    this.wsManager.send(PiProtocol.createPrompt(text, images));
  }

  public sendSteer(text: string) {
    if (!text.trim()) return;
    this.wsManager.send(PiProtocol.createSteer(text));
  }

  public abort() {
    this.wsManager.send(PiProtocol.createAbort());
    this.isStreaming = false;
    this.notifyUI();
  }

  public newSession() {
    this.messages = [];
    this.currentTitle = 'New Chat';
    this.wsManager.send(PiProtocol.createNewSession());
    this.notifyUI();
  }

  public switchSession(session: SessionInfo) {
    this.messages = [];
    this.currentTitle = session.sessionName || session.firstUser || session.name;
    this.wsManager.send(PiProtocol.createSwitchSession(session.file));
    this.notifyUI();
    this.loadSessionHistory(session.file);
  }

  public async loadSessionHistory(sessionPath: string) {
    const detail = await this.httpService.getSession(sessionPath);
    if (detail && Array.isArray(detail.entries)) {
      const reconstructed: ChatMessage[] = [];
      let lastUserTs: number = 0;
      for (const entry of detail.entries) {
        if (entry.type !== 'message' || !entry.message) continue;
        const m = entry.message;
        const role = m.role === 'user' ? MessageRole.USER : (m.role === 'assistant' ? MessageRole.ASSISTANT : null);
        if (!role) continue;
        const msgTs = typeof m.timestamp === 'number' ? m.timestamp : Date.now();
        if (role === MessageRole.USER) {
          lastUserTs = msgTs;
          const text = this.extractTextContent(m.content);
          if (text) {
            reconstructed.push({
              id: entry.id || `msg_${Date.now()}_${Math.random()}`,
              role: role,
              content: text,
              thinkingContent: '',
              isThinking: false,
              images: [],
              status: MessageStatus.DONE,
              timestamp: msgTs
            });
          }
        } else if (role === MessageRole.ASSISTANT) {
          let turnDuration: number | undefined = undefined;
          if (lastUserTs > 0 && msgTs >= lastUserTs) {
            const diff = msgTs - lastUserTs;
            if (diff > 0 && diff < 900000) {
              turnDuration = diff;
            }
          }
          let textContent = '';
          let thinkingContent = '';
          if (Array.isArray(m.content)) {
            for (const item of m.content) {
              if (item && item.type === 'text' && typeof item.text === 'string') {
                textContent += item.text;
              } else if (item && item.type === 'thinking' && typeof item.thinking === 'string') {
                thinkingContent += item.thinking;
              } else if (typeof item === 'string') {
                textContent += item;
              }
            }
          } else if (typeof m.content === 'string') {
            textContent = m.content;
          }

          if (textContent || thinkingContent) {
            reconstructed.push({
              id: entry.id || `msg_${Date.now()}_${Math.random()}`,
              role: role,
              content: textContent,
              thinkingContent: thinkingContent,
              isThinking: false,
              turnDuration: turnDuration,
              images: [],
              status: MessageStatus.DONE,
              timestamp: msgTs
            });
          }
        }
      }
      this.messages = reconstructed;
      this.notifyUI();
    }
  }

  private extractTextContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      let result = '';
      for (const item of content) {
        if (typeof item === 'string') {
          result += item;
        } else if (item && item.type === 'text' && typeof item.text === 'string') {
          result += item.text;
        }
      }
      return result;
    }
    return '';
  }

  private handleServerMessage(msg: PiProtocol.ServerMessage) {
    switch (msg.type) {
      case 'agent_start':
        this.isStreaming = true;
        if (this.messages.length === 0 || this.messages[this.messages.length - 1].role !== MessageRole.ASSISTANT || this.messages[this.messages.length - 1].status !== MessageStatus.STREAMING) {
          this.messages.push({
            id: `assistant_${Date.now()}`,
            role: MessageRole.ASSISTANT,
            content: '',
            thinkingContent: '',
            isThinking: false,
            turnStartedAt: Date.now(),
            images: [],
            status: MessageStatus.STREAMING,
            timestamp: Date.now()
          });
        }
        this.notifyUI();
        break;
      case 'agent_stream':
      case 'message_update':
        const delta = msg.assistantMessageEvent?.delta || msg.delta || '';
        const isThinking = msg.assistantMessageEvent?.type === 'thinking_delta' || msg.isThinking === true;
        if (delta) {
          this.updateAssistantStream(delta, isThinking);
        }
        break;
      case 'agent_end':
      case 'agent_settled':
        this.isStreaming = false;
        this.markAssistantDone();
        break;
      case 'remote_user_prompt':
        if (msg.message && !msg.isSteer) {
          this.messages.push({
            id: `user_sync_${Date.now()}`,
            role: MessageRole.USER,
            content: msg.message,
            thinkingContent: '',
            isThinking: false,
            images: [],
            status: MessageStatus.DONE,
            timestamp: Date.now()
          });
          this.messages.push({
            id: `assistant_${Date.now()}`,
            role: MessageRole.ASSISTANT,
            content: '',
            thinkingContent: '',
            isThinking: false,
            turnStartedAt: Date.now(),
            images: [],
            status: MessageStatus.STREAMING,
            timestamp: Date.now()
          });
          this.isStreaming = true;
          this.notifyUI();
        }
        break;
    }
  }

  private updateAssistantStream(delta: string, isThinking: boolean) {
    let lastIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT && this.messages[i].status === MessageStatus.STREAMING) {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx === -1) {
      this.messages.push({
        id: `assistant_${Date.now()}`,
        role: MessageRole.ASSISTANT,
        content: '',
        thinkingContent: '',
        isThinking: false,
        turnStartedAt: Date.now(),
        images: [],
        status: MessageStatus.STREAMING,
        timestamp: Date.now()
      });
      lastIdx = this.messages.length - 1;
    }

    const last = this.messages[lastIdx];
    const now = Date.now();
    if (isThinking) {
      if (!last.thinkingStartedAt) {
        last.thinkingStartedAt = now;
      }
      last.thinkingContent += delta;
      last.isThinking = true;
      last.thinkingDuration = now - last.thinkingStartedAt;
    } else {
      if (last.isThinking) {
        last.thinkingEndedAt = now;
        last.thinkingDuration = now - (last.thinkingStartedAt || last.timestamp);
      }
      last.content += delta;
      last.isThinking = false;
    }
    last.status = MessageStatus.STREAMING;
    this.messages = [...this.messages];
    this.notifyUI();
  }

  private markAssistantDone() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT) {
        const last = this.messages[i];
        const now = Date.now();
        last.status = MessageStatus.DONE;
        last.isThinking = false;
        last.turnDuration = now - (last.turnStartedAt || last.timestamp);
        if (!last.thinkingDuration && last.thinkingContent) {
          last.thinkingDuration = (last.thinkingEndedAt || now) - (last.thinkingStartedAt || last.timestamp);
        }
        break;
      }
    }
    this.messages = [...this.messages];
    this.notifyUI();
  }

  private notifyUI() {
    if (this.updateCallback) {
      this.updateCallback();
    }
  }
}
