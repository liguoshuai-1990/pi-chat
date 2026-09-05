import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";
import { writeFile, readFile } from "fs/promises";
import path from "path";
import { config, normalizeCwd, normalizePath } from "./config.js";
import { createBackfillStartMessage, createBackfillEndMessage } from "@liguoshuai/pi-chat-protocol";

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
    this.hasBufferOverflowed = false;
    this.lastUserPrompt = null;
    // Timing tracking for persistence
    this.turnStart = null;
    this.thinkingStart = null;
    this.toolStarts = new Map();
    this.timingData = null;
  }

  get hasListeners() {
    return this.sockets.size > 0 || this.sseListeners.size > 0;
  }

  get isBusy() {
    return this.isStreaming || this.pending.size > 0;
  }

  get isStreaming() {
    return this.state === "streaming";
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

  maybeScheduleLifetimeKill() {
    if (config.maxAgentLifetimeMs <= 0) return;
    this.cancelLifetimeKill();
    this.lifetimeTimer = setTimeout(() => {
      this.lifetimeTimer = null;
      if (!this.alive) return;
      if (this.isBusy || this.hasListeners) {
        console.log(`[PiAgent] Max lifetime reached for ${this.sessionKey || "unkeyed"}, but agent is busy or active. Deferring stop.`);
        this.maybeScheduleLifetimeKill();
        return;
      }
      console.warn(`[PiAgent] Max lifetime reached and idle for ${this.sessionKey || "unkeyed"}, stopping`);
      this.stop();
    }, config.maxAgentLifetimeMs);
  }

  cancelLifetimeKill() {
    if (this.lifetimeTimer) {
      clearTimeout(this.lifetimeTimer);
      this.lifetimeTimer = null;
    }
  }

  start() {
    const args = [config.piBin, "--mode", "rpc", "--session-dir", config.sessionsDir];
    const isWin = process.platform === "win32";
    this.proc = spawn(args[0], args.slice(1), {
      cwd: this.cwd,
      env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
      shell: isWin,
    });
    this.alive = true;
    allAgents.add(this);
    this.startedAt = nowMs();
    this.lastActivityAt = this.startedAt;

    if (config.maxAgentLifetimeMs > 0) {
      this.maybeScheduleLifetimeKill();
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
    if (this.buffer.length > 50 * 1024 * 1024) {
      console.warn(`[PiAgent] Buffer length exceeded 50MB, truncating`);
      this.buffer = this.buffer.slice(-10 * 1024 * 1024);
    }
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
    if (!obj || typeof obj !== "object") return;

    const sessFile = obj.data?.sessionFile || obj.sessionFile || obj.data?.sessionPath || obj.sessionPath;
    if (sessFile) {
      this.setSessionKey(this.cwd, sessFile);
    }

    switch (obj.type) {
      case "agent_start":
        this.setStreaming(true);
        this.hasBufferOverflowed = false;
        break;
      case "agent_end":
        this.setStreaming(false);
        break;
      case "agent_settled":
        this.setStreaming(false);
        this.eventBuffer = [];
        this.bufferHead = 0;
        this.hasBufferOverflowed = false;
        if (!this.sessionKey) {
          this.send({ type: "get_state" });
        }
        break;
      case "error":
      case "pi_exit":
        this.setStreaming(false);
        this.eventBuffer = [];
        this.bufferHead = 0;
        this.hasBufferOverflowed = false;
        break;
    }

    // Track timing for persistence (thinking, tool, turn durations)
    this.trackTiming(obj);

    if (obj.type === "response" && (obj.command === "prompt" || obj.command === "abort") && !obj.success) {
      this.setStreaming(false);
    }

    if (obj.type === "remote_user_prompt" || obj.type === "remote_user_steer") {
      this.lastUserPrompt = { text: obj.message, isSteer: !!obj.isSteer, at: nowMs() };
    }

    if (obj.type === "response" && obj.id !== undefined && obj.id !== null) {
      const idStr = String(obj.id);
      const res = this.pending.get(idStr);
      if (res) {
        this.pending.delete(idStr);
        res(obj);
      }
      this.markActivity();
    }

    this.broadcast(obj);

    // Only buffer live streaming turn events (agent_start, message deltas, tool calls, agent_end)
    // When agent is idle or settled, eventBuffer is empty since full transcript is saved on disk.
    if (this.isStreaming || obj.type === "agent_start" || obj.type === "agent_end") {
      this.bufferEvent(obj);
    }
  }

  trackTiming(obj) {
    switch (obj.type) {
      case "agent_start":
        this.turnStart = Date.now();
        this.thinkingStart = null;
        this.toolStarts.clear();
        this.timingData = { turnDuration: null, thinkingDurations: [], toolDurations: {} };
        break;
      case "agent_end":
        if (this.turnStart && this.timingData) {
          this.timingData.turnDuration = Math.max(0, Date.now() - this.turnStart);
          this.saveTimingData();
        }
        break;
      case "message_update": {
        const ev = obj.assistantMessageEvent;
        if (!ev) break;
        if (ev.type === "thinking_start") {
          this.thinkingStart = Date.now();
        } else if (ev.type === "thinking_end") {
          if (this.thinkingStart && this.timingData) {
            this.timingData.thinkingDurations.push(Math.max(0, Date.now() - this.thinkingStart));
            this.thinkingStart = null;
          }
        }
        break;
      }
      case "tool_execution_start":
        if (obj.toolCallId) this.toolStarts.set(obj.toolCallId, Date.now());
        break;
      case "tool_execution_end":
        if (obj.toolCallId && this.toolStarts.has(obj.toolCallId) && this.timingData) {
          const dur = Math.max(0, Date.now() - this.toolStarts.get(obj.toolCallId));
          this.timingData.toolDurations[obj.toolCallId] = dur;
          this.toolStarts.delete(obj.toolCallId);
        }
        break;
    }
  }

  async saveTimingData() {
    if (!this.timingData || !this.sessionKey) return;
    try {
      // sessionKey is "cwd:sessionPath" — extract sessionPath
      const idx = this.sessionKey.indexOf(":");
      if (idx < 0) return;
      const sessionPath = this.sessionKey.slice(idx + 1);
      const timingPath = sessionPath + ".timing.json";
      // Read existing timing data (array of turns)
      let turns = [];
      try {
        const existing = await readFile(timingPath, "utf8");
        turns = JSON.parse(existing);
        if (!Array.isArray(turns)) turns = [];
      } catch {}
      // Append current turn timing
      turns.push(this.timingData);
      // Keep last 1000 turns to avoid unbounded growth
      if (turns.length > 1000) turns = turns.slice(-1000);
      await writeFile(timingPath, JSON.stringify(turns), "utf8");
    } catch (e) {
      console.warn("[PiAgent] Failed to save timing data:", e.message);
    }
  }

  bufferEvent(obj) {
    const size = config.eventBufferSize;
    if (size <= 0) return;
    if (this.eventBuffer.length < size) {
      this.eventBuffer.push(obj);
    } else {
      this.hasBufferOverflowed = true;
      this.eventBuffer[this.bufferHead] = obj;
      this.bufferHead = (this.bufferHead + 1) % size;
    }
  }

  replayBufferedWs(ws) {
    if (this.eventBuffer.length === 0 || ws.readyState !== 1) return;
    const count = this.eventBuffer.length;
    try { ws.send(JSON.stringify(createBackfillStartMessage(count))); } catch {}
    const size = config.eventBufferSize || 5000;
    const start = this.hasBufferOverflowed ? this.bufferHead : 0;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % size;
      const ev = this.eventBuffer[idx];
      if (ev !== undefined) {
        try { ws.send(JSON.stringify(ev)); } catch {}
      }
    }
    try {
      ws.send(JSON.stringify(createBackfillEndMessage(this.isStreaming, this.state, this.hasBufferOverflowed)));
    } catch {}
    if (!this.isStreaming) {
      this.eventBuffer = [];
      this.bufferHead = 0;
      this.hasBufferOverflowed = false;
    }
  }

  replayBufferedSse(res) {
    if (this.eventBuffer.length === 0 || res.destroyed || res.writableEnded) return;
    const count = this.eventBuffer.length;
    try { res.write(`data: ${JSON.stringify(createBackfillStartMessage(count))}\n\n`); } catch {}
    const size = config.eventBufferSize || 5000;
    const start = this.hasBufferOverflowed ? this.bufferHead : 0;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % size;
      const ev = this.eventBuffer[idx];
      if (ev !== undefined) {
        try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch {}
      }
    }
    try {
      res.write(`data: ${JSON.stringify(createBackfillEndMessage(this.isStreaming, this.state, this.hasBufferOverflowed))}\n\n`);
    } catch {}
    if (!this.isStreaming) {
      this.eventBuffer = [];
      this.bufferHead = 0;
      this.hasBufferOverflowed = false;
    }
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
      const id = cmd.id !== undefined && cmd.id !== null ? String(cmd.id) : String(++this.reqId);
      if (!this.alive || !this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
        return resolve({ type: "response", id, success: false, error: "pi process not alive" });
      }
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
      } else if (config.longRunningTimeoutMs > 0) {
        // Long-running commands (prompt, steer, client_send) get a configurable
        // timeout (default 10 min). Without this, a hung pi subprocess leaves the
        // pending entry forever, making isBusy permanently true and the agent
        // becomes an unreclaimable zombie.
        timeoutId = setTimeout(() => {
          console.warn(`[PiAgent] long-running command "${cmd.type}" (id=${id}) timed out after ${config.longRunningTimeoutMs}ms`);
          this.setStreaming(false);
          this.broadcast({ type: "error", code: "long_running_timeout", message: `任务执行超时（${Math.round(config.longRunningTimeoutMs / 1000)}秒），可能子进程已僵死` });
          complete({ type: "response", id, success: false, error: "long_running_timeout" });
        }, config.longRunningTimeoutMs);
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
    this.state = "idle";
    allAgents.delete(this);
    if (this.sessionKey) activeAgents.delete(this.sessionKey);
    this.cancelIdleKill();
    if (this.lifetimeTimer) { clearTimeout(this.lifetimeTimer); this.lifetimeTimer = null; }
    for (const [id, resolve] of this.pending) {
      resolve({ type: "response", id, success: false, error: "pi process stopped" });
    }
    this.pending.clear();
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
      isStreaming: this.isStreaming,
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

  if (key && activeAgents.has(key)) {
    const existing = activeAgents.get(key);
    if (existing && existing.alive) {
      return existing;
    }
    activeAgents.delete(key);
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
