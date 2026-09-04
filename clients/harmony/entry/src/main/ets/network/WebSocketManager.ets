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
  private reconnectTimer: number = -1;
  private reconnectAttempts: number = 0;
  private isManualClose: boolean = false;
  private lastUrl: string = '';
  private lastToken?: string;
  private lastCwd?: string;
  private lastSession?: string;

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  public connect(url: string, token?: string, cwd?: string, session?: string) {
    this.isManualClose = false;
    this.lastUrl = url;
    this.lastToken = token;
    this.lastCwd = cwd;
    this.lastSession = session;
    this.stopReconnect();
    this.disconnectInternal();
    this.ws = webSocket.createWebSocket();

    // Capture this ws instance so stale handlers from a previous connection
    // can detect they are no longer the active socket and skip reconnect logic.
    const wsRef = this.ws;

    let connectUrl = url.replace(/\/$/, '');
    if (connectUrl.startsWith('http://')) {
      connectUrl = connectUrl.replace('http://', 'ws://');
    } else if (connectUrl.startsWith('https://')) {
      connectUrl = connectUrl.replace('https://', 'wss://');
    }

    if (!connectUrl.endsWith('/ws')) {
      connectUrl += '/ws';
    }

    // Token is sent via Authorization header only — NOT in the query string
    // to avoid leaking it in server/proxy access logs.
    const params: string[] = [];
    if (cwd) params.push(`cwd=${encodeURIComponent(cwd)}`);
    if (session) params.push(`session=${encodeURIComponent(session)}`);
    if (params.length > 0) {
      connectUrl += `?${params.join('&')}`;
    }

    this.currentUrl = connectUrl;

    this.ws.on('open', (err, value) => {
      if (this.ws !== wsRef) return; // stale handler
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.notifyState(true);
      this.startHeartbeat();
    });

    this.ws.on('message', (err, value) => {
      if (this.ws !== wsRef) return; // stale handler
      if (typeof value === 'string') {
        try {
          const msg = JSON.parse(value) as PiProtocol.ServerMessage;
          this.notifyMessage(msg);
        } catch (e) {
          console.error(`[WebSocketManager] Failed to parse message: ${e}`);
        }
      } else {
        console.warn('[WebSocketManager] Received non-string WebSocket message, ignoring');
      }
    });

    this.ws.on('close', (err, value) => {
      if (this.ws !== wsRef) return; // stale handler — skip reconnect for replaced sockets
      this.isConnected = false;
      this.notifyState(false);
      this.stopHeartbeat();
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      if (this.ws !== wsRef) return; // stale handler
      console.error(`[WebSocketManager] WebSocket error: ${err}`);
      this.isConnected = false;
      this.notifyState(false);
      this.stopHeartbeat();
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.connect(connectUrl, {
      header: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).catch((e: Error) => {
      console.error(`[WebSocketManager] WebSocket connect failed: ${e}`);
      this.isConnected = false;
      this.notifyState(false);
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    });
  }

  public send(data: string): boolean {
    if (this.ws && this.isConnected) {
      // ws.send() returns a Promise<boolean> in HarmonyOS API.
      // We return true optimistically (the data was queued for send),
      // but catch any rejection to avoid unhandled promise rejection.
      this.ws.send(data).catch((e: Error) => {
        console.error(`[WebSocketManager] WebSocket send failed: ${e}`);
      });
      return true;
    }
    return false;
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

  private scheduleReconnect() {
    this.stopReconnect();
    const baseDelay = 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 5));
    const jitter = Math.floor(Math.random() * 1000);
    const delayMs = Math.min(30000, baseDelay + jitter);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.isManualClose && this.lastUrl) {
        this.connect(this.lastUrl, this.lastToken, this.lastCwd, this.lastSession);
      }
    }, delayMs);
  }

  private stopReconnect() {
    if (this.reconnectTimer !== -1) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = -1;
    }
  }

  private disconnectInternal() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        // Remove event listeners to prevent memory leaks across reconnect cycles
        this.ws.off('open');
        this.ws.off('message');
        this.ws.off('close');
        this.ws.off('error');
      } catch (e) {
        // off() may throw if no handler was registered; safe to ignore
      }
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  public disconnect() {
    this.isManualClose = true;
    this.reconnectAttempts = 0;
    this.stopReconnect();
    this.disconnectInternal();
    this.notifyState(false);
  }
}
