import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";
import { config, normalizeCwd, normalizePath } from "./config.js";

export const activeAgents = new Map();
export const allAgents = new Set();

const nowMs = () => Date.now();

export class PiAgent {
  constructor(cwd) {
    this.sockets = new Set();
    this.sseListeners = new Set();
    this.cwd = normalizeCwd(cwd);
    this.sessionKey = null;
    this.reqId = 0;
    this.pending = new Map();      // reqId -> resolve()
    this.proc = null;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.alive = false;
    this.state = "idle";          // "idle" | "streaming"
    this.idleTimer = null;
    this.lifetimeTimer = null;
    this.startedAt = 0;
    this.lastActivityAt = 0;
    this.eventBuffer = [];
    this.bufferHead = 0;
    this.lastUserPrompt = null;
  }

  get hasListeners() {
    return this.sockets.size > 0 || this.sseListeners.size > 0;
  }

  get isBusy() {
    return this.state === "streaming" || this.pending.size > 0;
  }

  attachWs(ws) {
    this.sockets.add(ws);
    this.cancelIdleKill();
    this.replayBufferedWs(ws);
  }

  detachWs(ws) {
    this.sockets.delete(ws);
    this.checkReclamation();
  }

  attachSse(res) {
    this.sseListeners.add(res);
    this.cancelIdleKill();
    this.replayBufferedSse(res);
  }

  detachSse(res) {
    this.sseListeners.delete(res);
    this.checkReclamation();
  }

  checkReclamation() {
    if (!this.hasListeners) {
      if (!this.isBusy) {
        this.eventBuffer = [];
        this.bufferHead = 0;
      }
      if (config.idleDropHeap) {
        try { if (typeof global.gc === "function") global.gc(); } catch {}
      }
      if (!this.sessionKey && !this.isBusy) {
        this.stop();
        return;
      }
      this.maybeScheduleIdleKill();
    }
  }

  setSessionKey(cwd, sessionPath) {
    if (!sessionPath) return;
    const normCwd = normalizeCwd(cwd);
    const resolved = normalizePath(sessionPath);
    const key = `${normCwd}:${resolved}`;
    if (this.sessionKey && this.sessionKey !== key) {
      activeAgents.delete(this.sessionKey);
    }
    const existing = activeAgents.get(key);
    if (existing && existing !== this && !existing.hasListeners && !existing.isBusy) {
      try { existing.stop(); } catch {}
    }
    this.sessionKey = key;
    activeAgents.set(key, this);
  }

  markActivity() {
    this.lastActivityAt = nowMs();
    this.cancelIdleKill();
    if (!this.hasListeners && !this.isBusy) {
      this.maybeScheduleIdleKill();
    }
  }

  setStreaming(streaming) {
    this.state = streaming ? "streaming" : "idle";
    this.markActivity();
  }

  maybeScheduleIdleKill() {
    if (!this.alive || this.hasListeners || this.isBusy) return;
    if (config.idleTimeoutMs === 0) return;
    this.cancelIdleKill();
    const ms = config.idleTimeoutMs;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.alive || this.hasListeners || this.isBusy) return;
      console.log(`[PiAgent] Reclaiming idle agent (key=${this.sessionKey || "unkeyed"})`);
      if (config.idleDropHeap) {
        try { if (typeof global.gc === "function") global.gc(); } catch {}
      }
      this.stop();
    }, ms);
  }

  cancelIdleKill() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  start() {
    const args = [config.piBin, "--mode", "rpc", "--session-dir", config.sessionsDir];
    this.proc = spawn(args[0], args.slice(1), {
      cwd: this.cwd,
      env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
    });
    this.alive = true;
    allAgents.add(this);
    this.startedAt = nowMs();
    this.lastActivityAt = this.startedAt;

    if (config.maxAgentLifetimeMs > 0) {
      this.lifetimeTimer = setTimeout(() => {
        console.warn(`[PiAgent] Max lifetime reached for ${this.sessionKey || "unkeyed"}, stopping`);
        this.stop();
      }, config.maxAgentLifetimeMs);
    }

    this.proc.on("error", (err) => {
      this.alive = false;
      allAgents.delete(this);
      if (this.sessionKey) activeAgents.delete(this.sessionKey);
      this.cancelIdleKill();
      if (this.lifetimeTimer) { clearTimeout(this.lifetimeTimer); this.lifetimeTimer = null; }
      for (const [id, resolve] of this.pending) {
        resolve({ type: "response", id, success: false, error: err.message });
      }
      this.pending.clear();
      console.error(`[PiAgent spawn error]`, err);
      this.broadcast({ type: "pi_exit", error: err.message });
      this.closeAllListeners();
    });

    if (this.proc.stdin) {
      this.proc.stdin.on("error", (err) => {
        console.warn(`[PiAgent stdin error]`, err.message);
      });
    }

    this.proc.stdout.on("data", (d) => this.onStdout(d));
    this.proc.stderr.on("data", (d) => {
      process.stderr.write(`[pi stderr] ${d}`);
    });

    this.proc.on("exit", (code) => {
      this.alive = false;
      allAgents.delete(this);
      console.log(`[PiAgent] pi process exited (code=${code})`);
      this.broadcast({ type: "pi_exit", code });
      if (this.sessionKey) activeAgents.delete(this.sessionKey);
      for (const [id, resolve] of this.pending) {
        resolve({ type: "response", id, success: false, error: "pi exited" });
      }
      this.pending.clear();
      this.closeAllListeners();
      this.cancelIdleKill();
      if (this.lifetimeTimer) { clearTimeout(this.lifetimeTimer); this.lifetimeTimer = null; }
    });
  }

  closeAllListeners() {
    for (const s of this.sockets) { try { s.close(); } catch {} }
    this.sockets.clear();
    for (const res of this.sseListeners) { try { res.end(); } catch {} }
    this.sseListeners.clear();
  }

  onStdout(chunk) {
    this.buffer += this.decoder.write(chunk);
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) break;
      let line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      this.onPiMessage(obj);
    }
  }

  onPiMessage(obj) {
    if (obj.data?.sessionFile) {
      this.setSessionKey(this.cwd, obj.data.sessionFile);
    }

    switch (obj.type) {
      case "agent_start":
        this.setStreaming(true);
        break;
      case "agent_end":
        this.setStreaming(false);
        break;
      case "agent_settled":
        this.setStreaming(false);
        this.eventBuffer = [];
        this.bufferHead = 0;
        if (!this.sessionKey) {
          this.send({ type: "get_state" });
        }
        break;
      case "pi_exit":
        this.state = "idle";
        break;
    }

    if (obj.type === "remote_user_prompt" || obj.type === "remote_user_steer") {
      this.lastUserPrompt = { text: obj.message, isSteer: !!obj.isSteer, at: nowMs() };
    }

    if (obj.type === "response" && obj.id) {
      const res = this.pending.get(obj.id);
      if (res) {
        this.pending.delete(obj.id);
        res(obj);
      }
      this.markActivity();
    }

    this.broadcast(obj);

    if (!this.hasListeners || this.isBusy) {
      this.bufferEvent(obj);
    }
  }

  bufferEvent(obj) {
    const size = config.eventBufferSize;
    if (size <= 0) return;
    if (this.eventBuffer.length < size) {
      this.eventBuffer.push(obj);
    } else {
      this.eventBuffer[this.bufferHead] = obj;
      this.bufferHead = (this.bufferHead + 1) % size;
    }
  }

  replayBufferedWs(ws) {
    if (this.eventBuffer.length === 0 || ws.readyState !== 1) return;
    const count = this.eventBuffer.length;
    try { ws.send(JSON.stringify({ type: "backfill_start", count })); } catch {}
    const start = count === config.eventBufferSize ? this.bufferHead : 0;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % config.eventBufferSize;
      const ev = this.eventBuffer[idx];
      try { ws.send(JSON.stringify(ev)); } catch {}
    }
    try { ws.send(JSON.stringify({ type: "backfill_end", streaming: this.isBusy, state: this.state })); } catch {}
    if (!this.isBusy) {
      this.eventBuffer = [];
      this.bufferHead = 0;
    }
  }

  replayBufferedSse(res) {
    if (this.eventBuffer.length === 0 || res.destroyed || res.writableEnded) return;
    const count = this.eventBuffer.length;
    try { res.write(`data: ${JSON.stringify({ type: "backfill_start", count })}\n\n`); } catch {}
    const start = count === config.eventBufferSize ? this.bufferHead : 0;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % config.eventBufferSize;
      const ev = this.eventBuffer[idx];
      try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch {}
    }
    try { res.write(`data: ${JSON.stringify({ type: "backfill_end", streaming: this.isBusy, state: this.state })}\n\n`); } catch {}
  }

  broadcast(obj, skipWs = null) {
    const str = JSON.stringify(obj);
    for (const ws of this.sockets) {
      if (ws.readyState !== 1) {
        if (ws.readyState === 2 || ws.readyState === 3) this.sockets.delete(ws);
        continue;
      }
      if (ws === skipWs) continue;
      try { ws.send(str); } catch {}
    }
    for (const res of this.sseListeners) {
      if (res.destroyed || res.writableEnded) {
        this.sseListeners.delete(res);
        continue;
      }
      try {
        res.write(`data: ${str}\n\n`);
      } catch {
        this.sseListeners.delete(res);
      }
    }
  }

  send(cmd) {
    return new Promise((resolve) => {
      if (!this.alive || !this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
        return resolve({ type: "response", id: cmd.id || "0", success: false, error: "pi process not alive" });
      }
      const id = cmd.id !== undefined && cmd.id !== null ? String(cmd.id) : String(++this.reqId);
      const payload = { ...cmd, id };
      const longRunning = cmd.type === "prompt" || cmd.type === "steer" || cmd.type === "client_send";
      let timeoutId = null;
      const settled = { done: false };

      const complete = (obj) => {
        if (settled.done) return;
        settled.done = true;
        this.pending.delete(id);
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        resolve(obj);
      };

      this.pending.set(id, complete);
      this.markActivity();

      try {
        this.proc.stdin.write(JSON.stringify(payload) + "\n");
      } catch (err) {
        settled.done = true;
        this.pending.delete(id);
        return resolve({ type: "response", id, success: false, error: err.message });
      }

      if (!longRunning) {
        timeoutId = setTimeout(() => {
          complete({ type: "response", id, success: false, error: "timeout" });
        }, 15000);
      }
    });
  }

  sendNoReply(cmd) {
    if (!this.alive || !this.proc || !this.proc.stdin || this.proc.stdin.destroyed) return;
    this.markActivity();
    try {
      this.proc.stdin.write(JSON.stringify(cmd) + "\n");
    } catch {}
  }

  stop() {
    this.alive = false;
    allAgents.delete(this);
    if (this.sessionKey) activeAgents.delete(this.sessionKey);
    this.cancelIdleKill();
    if (this.lifetimeTimer) { clearTimeout(this.lifetimeTimer); this.lifetimeTimer = null; }
    if (this.proc) {
      try { this.proc.kill("SIGTERM"); } catch {}
      const p = this.proc;
      const killTimer = setTimeout(() => {
        try { p.kill("SIGKILL"); } catch {}
      }, 2000);
      killTimer.unref();
      this.proc = null;
    }
    this.closeAllListeners();
  }

  status() {
    return {
      cwd: this.cwd,
      sessionKey: this.sessionKey,
      alive: this.alive,
      state: this.state,
      isBusy: this.isBusy,
      listenersCount: this.sockets.size + this.sseListeners.size,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      lastUserPrompt: this.lastUserPrompt,
      bufferedEventsCount: this.eventBuffer.length,
    };
  }
}

export function getOrCreateAgent(cwd, sessionPath = null) {
  const normCwd = normalizeCwd(cwd);
  const key = sessionPath ? `${normCwd}:${normalizePath(sessionPath)}` : null;

  if (key && activeAgents.has(key) && activeAgents.get(key).alive) {
    return activeAgents.get(key);
  }

  if (config.maxConcurrentAgents > 0) {
    let live = 0;
    for (const a of allAgents) if (a.alive) live++;
    if (live >= config.maxConcurrentAgents) {
      throw new Error(`Server is at capacity (${live}/${config.maxConcurrentAgents} agents)`);
    }
  }

  const agent = new PiAgent(normCwd);
  agent.start();
  if (sessionPath) {
    agent.setSessionKey(normCwd, sessionPath);
    agent.sendNoReply({ type: "switch_session", sessionPath });
  }
  return agent;
}

export function shutdownAllAgents(reason = "Shutdown") {
  console.log(`\n[PiAgent] ${reason}: stopping ${allAgents.size} agent(s)...`);
  for (const a of [...allAgents]) {
    try { a.stop(); } catch {}
  }
}
