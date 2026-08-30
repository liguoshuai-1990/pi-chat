import webSocket from '@ohos.net.webSocket';
import { PiProtocol } from '../protocol/PiProtocol';

export type MessageCallback = (msg: PiProtocol.ServerMessage) => void;
export type StateCallback = (isConnected: boolean) => void;

export class WebSocketManager {
  private static instance: WebSocketManager;
  private ws: webSocket.WebSocket | null = null;
  private isConnected: boolean = false;
  private messageListeners: MessageCallback[] = [];
  private stateListeners: StateCallback[] = [];
  private pingInterval: number = -1;
  private currentUrl: string = '';

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  public connect(url: string, token?: string, cwd?: string, session?: string) {
    this.disconnect();
    this.ws = webSocket.createWebSocket();

    let connectUrl = url.replace(/\/$/, '');
    if (connectUrl.startsWith('http://')) {
      connectUrl = connectUrl.replace('http://', 'ws://');
    } else if (connectUrl.startsWith('https://')) {
      connectUrl = connectUrl.replace('https://', 'wss://');
    }

    if (!connectUrl.endsWith('/ws')) {
      connectUrl += '/ws';
    }

    const params: string[] = [];
    if (cwd) params.push(`cwd=${encodeURIComponent(cwd)}`);
    if (session) params.push(`session=${encodeURIComponent(session)}`);
    if (token) params.push(`token=${encodeURIComponent(token)}`);
    if (params.length > 0) {
      connectUrl += `?${params.join('&')}`;
    }

    this.currentUrl = connectUrl;

    this.ws.on('open', (err, value) => {
      this.isConnected = true;
      this.notifyState(true);
      this.startHeartbeat();
    });

    this.ws.on('message', (err, value) => {
      if (typeof value === 'string') {
        try {
          const msg = JSON.parse(value) as PiProtocol.ServerMessage;
          this.notifyMessage(msg);
        } catch (e) {}
      }
    });

    this.ws.on('close', (err, value) => {
      this.isConnected = false;
      this.notifyState(false);
      this.stopHeartbeat();
    });

    this.ws.on('error', (err) => {
      this.isConnected = false;
      this.notifyState(false);
      this.stopHeartbeat();
    });

    this.ws.connect(connectUrl, {
      header: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
  }

  public send(data: string) {
    if (this.ws && this.isConnected) {
      this.ws.send(data);
    }
  }

  public addMessageListener(cb: MessageCallback) {
    this.messageListeners.push(cb);
  }

  public removeMessageListener(cb: MessageCallback) {
    const idx = this.messageListeners.indexOf(cb);
    if (idx !== -1) this.messageListeners.splice(idx, 1);
  }

  public addStateListener(cb: StateCallback) {
    this.stateListeners.push(cb);
    cb(this.isConnected);
  }

  public removeStateListener(cb: StateCallback) {
    const idx = this.stateListeners.indexOf(cb);
    if (idx !== -1) this.stateListeners.splice(idx, 1);
  }

  private notifyMessage(msg: PiProtocol.ServerMessage) {
    for (const listener of this.messageListeners) {
      listener(msg);
    }
  }

  private notifyState(connected: boolean) {
    for (const listener of this.stateListeners) {
      listener(connected);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send(PiProtocol.createPing());
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval !== -1) {
      clearInterval(this.pingInterval);
      this.pingInterval = -1;
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.notifyState(false);
  }
}
