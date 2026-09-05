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
  public currentSessionFile: string = '';
  public cwd: string = '';
  public serverUrl: string = 'http://10.0.2.2:3000'; // Default, overridable via init()
  public token: string = '';
  public errorMessage: string = '';

  private wsManager: WebSocketManager = WebSocketManager.getInstance();
  private httpService: HttpService = new HttpService(this.serverUrl, this.token);
  private updateCallback: () => void = () => {};

  // Track listener references so we can remove them on re-init to prevent leaks
  private stateListener: ((connected: boolean) => void) | null = null;
  private messageListener: ((msg: PiProtocol.ServerMessage) => void) | null = null;

  // Watchdog: if streaming stays true for too long without agent_end, reset it
  private streamingWatchdogTimer: number = -1;
  private readonly STREAMING_WATCHDOG_MS: number = 5 * 60 * 1000; // 5 minutes

  public bindUI(cb: () => void) {
    this.updateCallback = cb;
  }

  public init(serverUrl: string = 'http://10.0.2.2:3000', token: string = '', cwd: string = '') {
    this.serverUrl = serverUrl;
    this.token = token;
    this.cwd = cwd;
    this.httpService = new HttpService(serverUrl, token);

    // Remove previous listeners to prevent duplicate message processing and memory leaks
    if (this.stateListener) {
      this.wsManager.removeStateListener(this.stateListener);
    }
    if (this.messageListener) {
      this.wsManager.removeMessageListener(this.messageListener);
    }

    this.stateListener = (connected: boolean) => {
      this.isConnected = connected;
      this.notifyUI();
    };
    this.messageListener = (msg: PiProtocol.ServerMessage) => {
      this.handleServerMessage(msg);
    };

    this.wsManager.addStateListener(this.stateListener);
    this.wsManager.addMessageListener(this.messageListener);

    // Reset streaming state from any previous session to avoid orphaned streaming bubble
    this.isStreaming = false;
    this.cancelStreamingWatchdog();

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
    this.startStreamingWatchdog();
    this.notifyUI();

    if (!this.wsManager.send(PiProtocol.createPrompt(text, images))) {
      // WebSocket send failed — mark user message as ERROR and remove assistant placeholder
      this.isStreaming = false;
      this.cancelStreamingWatchdog();
      // Remove the streaming assistant placeholder
      if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === MessageRole.ASSISTANT && this.messages[this.messages.length - 1].status === MessageStatus.STREAMING) {
        this.messages = this.messages.slice(0, -1);
      }
      // Mark the user message as ERROR so the user sees the failure
      if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === MessageRole.USER) {
        this.messages[this.messages.length - 1].status = MessageStatus.ERROR;
      }
      this.errorMessage = 'Failed to send message: WebSocket not connected';
      this.notifyUI();
    }
  }

  public sendSteer(text: string) {
    if (!text.trim()) return;
    if (!this.wsManager.send(PiProtocol.createSteer(text))) {
      this.errorMessage = 'Failed to send steer: WebSocket not connected';
      this.notifyUI();
    }
  }

  public abort() {
    if (this.wsManager.send(PiProtocol.createAbort())) {
      this.isStreaming = false;
      this.cancelStreamingWatchdog();
      this.notifyUI();
    }
  }

  public newSession() {
    this.messages = [];
    this.currentTitle = 'New Chat';
    this.isStreaming = false;
    this.cancelStreamingWatchdog();
    if (!this.wsManager.send(PiProtocol.createNewSession())) {
      this.connect();
    } else {
      this.wsManager.send(JSON.stringify({ type: 'get_state' }));
      this.wsManager.send(JSON.stringify({ type: 'get_available_models' }));
    }
    this.loadSessions();
    this.notifyUI();
  }

  public switchSession(session: SessionInfo) {
    if (!this.wsManager.send(PiProtocol.createSwitchSession(session.file))) {
      this.errorMessage = 'Failed to switch session: WebSocket not connected';
      this.notifyUI();
      return;
    }
    this.messages = [];
    this.currentTitle = session.sessionName || session.firstUser || session.name;
    this.currentSessionFile = session.file;
    this.notifyUI();
    this.loadSessionHistory(session.file);
  }

  /**
   * 重新加载当前会话的历史消息（下拉刷新调用）。
   * 如果没有当前会话（新对话/无会话），则不做任何操作。
   */
  public async refreshCurrentSession() {
    if (this.currentSessionFile) {
      await this.loadSessionHistory(this.currentSessionFile);
      this.notifyUI();
    }
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
    } else if (!detail) {
      // Session history load failed — don't leave the user with a blank screen
      this.errorMessage = 'Failed to load session history';
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

  private startStreamingWatchdog() {
    this.cancelStreamingWatchdog();
    this.streamingWatchdogTimer = setTimeout(() => {
      if (this.isStreaming) {
        this.isStreaming = false;
        this.markAssistantDone();
        this.errorMessage = `Streaming timed out after ${this.STREAMING_WATCHDOG_MS / 1000}s`;
        this.notifyUI();
      }
    }, this.STREAMING_WATCHDOG_MS);
  }

  private cancelStreamingWatchdog() {
    if (this.streamingWatchdogTimer !== -1) {
      clearTimeout(this.streamingWatchdogTimer);
      this.streamingWatchdogTimer = -1;
    }
  }

  private handleServerMessage(msg: PiProtocol.ServerMessage) {
    switch (msg.type) {
      case 'response':
        if (msg.command === 'new_session') {
          if (msg.success) {
            this.messages = [];
            this.currentTitle = 'New Chat';
            this.isStreaming = false;
            this.cancelStreamingWatchdog();
            this.wsManager.send(JSON.stringify({ type: 'get_state' }));
            this.wsManager.send(JSON.stringify({ type: 'get_available_models' }));
            this.loadSessions();
          } else {
            this.errorMessage = msg.error || 'Failed to create new session';
          }
          this.notifyUI();
        } else if (msg.command === 'prompt') {
          if (msg.success === false) {
            this.isStreaming = false;
            this.cancelStreamingWatchdog();
            const errMsg = msg.error || 'Generation failed (model error)';
            const lastIdx = this.messages.length - 1;
            if (lastIdx >= 0 && this.messages[lastIdx].role === MessageRole.ASSISTANT && this.messages[lastIdx].status === MessageStatus.STREAMING) {
              this.messages[lastIdx].status = MessageStatus.ERROR;
              this.messages[lastIdx].content = `⚠️ ${errMsg}`;
            }
            this.errorMessage = errMsg;
            this.notifyUI();
          }
        } else if (msg.command === 'switch_session') {
          if (msg.success) {
            this.wsManager.send(JSON.stringify({ type: 'get_state' }));
          } else {
            this.errorMessage = msg.error || 'Failed to switch session';
            this.notifyUI();
          }
        }
        break;
      case 'agent_start':
      case 'message_start':
        this.isStreaming = true;
        this.startStreamingWatchdog();
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
      case 'message_end':
        const m = (msg as any).message;
        if (m && m.role === 'assistant' && m.stopReason === 'error') {
          const errMsg = m.errorMessage || '生成失败（模型返回错误）。可能是当前模型不可用，请切换模型后重试。';
          const lastIdx = this.messages.length - 1;
          if (lastIdx >= 0 && this.messages[lastIdx].role === MessageRole.ASSISTANT && !this.messages[lastIdx].content) {
            this.messages[lastIdx].content = `⚠️ ${errMsg}`;
            this.messages[lastIdx].status = MessageStatus.ERROR;
          }
          this.errorMessage = errMsg;
          this.notifyUI();
        }
        break;
      case 'agent_stream':
      case 'message_update':
        const evType = msg.assistantMessageEvent?.type;
        if (evType === 'thinking_start') {
          this.startThinking();
        } else if (evType === 'thinking_end' || evType === 'text_start') {
          this.finishThinking();
        } else if (evType === 'text_end') {
          this.finishThinking();
          const content = typeof msg.assistantMessageEvent?.content === 'string' ? msg.assistantMessageEvent.content : '';
          if (content) {
            this.setAssistantFinalText(content);
          }
        } else {
          const delta = msg.assistantMessageEvent?.delta || msg.delta || '';
          const isThinking = evType === 'thinking_delta' || msg.isThinking === true;
          if (delta) {
            this.updateAssistantStream(delta, isThinking);
          }
        }
        break;
      case 'tool_execution_start':
        this.finishThinking();
        break;
      case 'agent_end':
      case 'agent_settled':
      case 'error':
      case 'pi_exit':
        this.isStreaming = false;
        this.cancelStreamingWatchdog();
        this.markAssistantDone();
        if (msg.type === 'error' || msg.type === 'pi_exit') {
          const errMsg = (msg as any).error || (msg as any).message || 'Agent error';
          const lastIdx = this.messages.length - 1;
          if (lastIdx >= 0 && this.messages[lastIdx].role === MessageRole.ASSISTANT) {
            if (!this.messages[lastIdx].content) {
              this.messages[lastIdx].content = `⚠️ ${errMsg}`;
            }
            this.messages[lastIdx].status = MessageStatus.ERROR;
          }
          this.errorMessage = errMsg;
        }
        if (msg.type === 'agent_settled') {
          this.wsManager.send(JSON.stringify({ type: 'get_state' }));
          this.loadSessions();
        }
        this.notifyUI();
        break;
      case 'remote_user_prompt':
        if (msg.message && !msg.isSteer) {
          // Dedup: skip if the last user message already has this content (locally sent).
          // Check the last message that is a USER role message — this handles both
          // the case where an assistant placeholder follows the user message and
          // where the user message is truly last.
          const lastUserIdx = this.messages.length - 1;
          // Walk backwards to find the most recent USER message
          for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === MessageRole.USER) {
              if (this.messages[i].content === msg.message) {
                // This prompt was already sent locally, skip duplicate
                break;
              }
              // Found a different user message — this is a remote prompt from another client
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
              this.startStreamingWatchdog();
              this.notifyUI();
              break;
            }
          }
        }
        break;
    }
  }

  private startThinking() {
    let lastIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT && this.messages[i].status === MessageStatus.STREAMING) {
        lastIdx = i;
        break;
      }
    }
    const now = Date.now();
    if (lastIdx === -1) {
      this.messages.push({
        id: `assistant_${now}`,
        role: MessageRole.ASSISTANT,
        content: '',
        thinkingContent: '',
        isThinking: true,
        thinkingStartedAt: now,
        turnStartedAt: now,
        images: [],
        status: MessageStatus.STREAMING,
        timestamp: now
      });
    } else {
      this.messages[lastIdx].isThinking = true;
      if (!this.messages[lastIdx].thinkingStartedAt) {
        this.messages[lastIdx].thinkingStartedAt = now;
      }
    }
    this.messages = [...this.messages];
    this.notifyUI();
  }

  private finishThinking() {
    let lastIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT && this.messages[i].status === MessageStatus.STREAMING) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx !== -1 && this.messages[lastIdx].isThinking) {
      const now = Date.now();
      this.messages[lastIdx].isThinking = false;
      this.messages[lastIdx].thinkingEndedAt = now;
      this.messages[lastIdx].thinkingDuration = now - (this.messages[lastIdx].thinkingStartedAt || now);
      this.messages = [...this.messages];
      this.notifyUI();
    }
  }

  private setAssistantFinalText(content: string) {
    let lastIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT && this.messages[i].status === MessageStatus.STREAMING) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx !== -1) {
      this.messages[lastIdx].content = content;
      this.messages[lastIdx].isThinking = false;
      this.messages = [...this.messages];
      this.notifyUI();
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
