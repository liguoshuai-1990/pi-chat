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
  }

  private handleServerMessage(msg: PiProtocol.ServerMessage) {
    switch (msg.type) {
      case 'agent_start':
        this.isStreaming = true;
        this.notifyUI();
        break;
      case 'agent_stream':
      case 'message_update':
        const delta = msg.delta || '';
        const isThinking = msg.isThinking === true;
        this.updateAssistantStream(delta, isThinking);
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
          this.notifyUI();
        }
        break;
    }
  }

  private updateAssistantStream(delta: string, isThinking: boolean) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT) {
        if (isThinking) {
          this.messages[i].thinkingContent += delta;
          this.messages[i].isThinking = true;
        } else {
          this.messages[i].content += delta;
          this.messages[i].isThinking = false;
        }
        this.messages[i].status = MessageStatus.STREAMING;
        this.notifyUI();
        break;
      }
    }
  }

  private markAssistantDone() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === MessageRole.ASSISTANT) {
        this.messages[i].status = MessageStatus.DONE;
        this.messages[i].isThinking = false;
        this.notifyUI();
        break;
      }
    }
  }

  private notifyUI() {
    if (this.updateCallback) {
      this.updateCallback();
    }
  }
}
