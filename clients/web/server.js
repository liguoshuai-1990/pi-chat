// server.js — pi-web-chat backend
// Bridges a browser WebSocket to a `pi --mode rpc` subprocess, and REST APIs
// for listing sessions and reading session history from the JSONL store.
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFile, readdir, stat, writeFile, mkdir, realpath as fsRealpath, unlink } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import { StringDecoder } from "string_decoder";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let PKG_VERSION = "1.0.0";
try {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8"));
  if (pkg.version) PKG_VERSION = pkg.version;
} catch {}

// Resolve pi binary: prefer PI_BIN env, else search PATH, else fall back to ~/.npm-global/bin/pi
function resolvePiBin() {
  if (process.env.PI_BIN && existsSync(process.env.PI_BIN)) return process.env.PI_BIN;
  const home = os.homedir();
  const candidates = [
    path.join(home, ".npm-global/bin/pi"),
    "/usr/local/bin/pi",
    "/usr/bin/pi",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi"; // hope it's on PATH of the spawned shell
}
const PI_BIN = resolvePiBin();
function home() { return os.homedir(); }

function normalizePath(p) {
  if (!p) return "";
  let resolved = p;
  if (p.startsWith("~")) {
    resolved = path.join(home(), p.slice(1));
  }
  return path.resolve(resolved);
}

function normalizeCwd(dir) {
  if (!dir) return process.cwd() || home();
  return normalizePath(dir);
}

// Where pi stores sessions, organized by cwd-encoded subdirectory.
const SESSIONS_DIR = process.env.PI_SESSIONS_DIR || path.join(home(), ".pi", "agent", "sessions");
const PORT = process.env.PORT || 3000;

// Idle timeout (ms). When a pi agent has NO WebSocket attached AND is truly
// idle (no streaming/pending tasks), after this many ms the subprocess is
// killed to reclaim memory. Browser-close alone does NOT trigger this — only
// true idleness does — so a task that is mid-flight keeps running in the
// background after you close the tab, and survives until it finishes.
// Set IDLE_TIMEOUT_MS=0 to disable idle reclamation entirely (agents live
// until MAX_AGENT_LIFETIME_MS or server shutdown).
const IDLE_TIMEOUT_MS = (() => {
  const raw = process.env.IDLE_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 5 * 60 * 1000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[pi-web-chat] Invalid IDLE_TIMEOUT_MS="${raw}", falling back to 300000`);
    return 5 * 60 * 1000;
  }
  return n;
})();

// Hard ceiling on how long a background pi agent may live, even if still busy.
// Protects against runaway agents that never terminate. 0 = unlimited.
const MAX_AGENT_LIFETIME_MS = (() => {
  const raw = process.env.MAX_AGENT_LIFETIME_MS;
  if (raw === undefined || raw === "") return 30 * 60 * 1000; // 30 min
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[pi-web-chat] Invalid MAX_AGENT_LIFETIME_MS="${raw}", falling back to 1800000`);
    return 30 * 60 * 1000;
  }
  return n;
})();

// How many pi->browser events to buffer while no WebSocket is attached, so a
// reconnecting client can replay what happened in the background after they
// closed the tab. Ring buffer; oldest events are dropped on overflow.
const EVENT_BUFFER_SIZE = (() => {
  const raw = process.env.EVENT_BUFFER_SIZE;
  if (raw === undefined || raw === "") return 2000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 2000;
  return n;
})();

// Maximum number of concurrently-pooled pi RPC subprocesses. New WebSocket
// connections beyond the cap are rejected with a clear message instead of
// silently exhausting memory. Set MAX_CONCURRENT_AGENTS=0 to disable.
const MAX_CONCURRENT_AGENTS = (() => {
  const raw = process.env.MAX_CONCURRENT_AGENTS;
  if (raw === undefined || raw === "") return 0; // 0 = unlimited (back-compat)
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.warn(`[pi-web-chat] Invalid MAX_CONCURRENT_AGENTS="${raw}", falling back to 0 (unlimited)`);
    return 0;
  }
  return n;
})();

// If true, when pi becomes idle (no WebSocket attached) we attempt to give the
// OS an early hint that this agent's memory is reclaimable. Node has no direct
// API for this, but --expose-gc + global.gc() drops the V8 heap lazily. When
// enabled, idle agents will voluntarily release heap before being killed by the
// idle timer, reducing pressure on small-memory hosts. Default: false.
const IDLE_DROP_HEAP = process.env.IDLE_DROP_HEAP === "1" || process.env.IDLE_DROP_HEAP === "true";

const nowMs = () => Date.now();

// Active pi RPC processes pooled by session key (`${cwd}:${resolvedSessionPath}`)
const activeAgents = new Map();
// Master set of all live PiAgent instances (both keyed and unkeyed)
const allAgents = new Set();

class PiAgent {
  constructor(cwd) {
    this.sockets = new Set();
    this.cwd = normalizeCwd(cwd);
    this.sessionKey = null;
    this.reqId = 0;
    this.pending = new Map();      // reqId -> resolve()
    this.proc = null;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.alive = false;
    // lifecycle / background-task state
    this.state = "idle";            // "idle" | "streaming"
    this.idleTimer = null;         // true-idle reclamation timer
    this.lifetimeTimer = null;     // hard max-lifetime kill
    this.startedAt = 0;
    this.lastActivityAt = 0;
    // ring buffer of pi->browser events while no socket is attached, so a
    // reconnecting client can replay what happened in the background.
    this.eventBuffer = [];
    this.bufferHead = 0;
    // lightweight summary of the task currently running in background, for
    // the /api/agents dashboard and reconnecting clients.
    this.lastUserPrompt = null;
  }

  get hasWs() { return this.sockets.size > 0; }
  get isBusy() { return this.state === "streaming" || this.pending.size > 0; }

  attachWs(ws) {
    this.sockets.add(ws);
    this.cancelIdleKill();
    // Replay buffered background events to the newly attached client so it can
    // catch up on whatever pi produced while no one was watching.
    this.replayBuffered(ws);
  }

  detachWs(ws) {
    this.sockets.delete(ws);
    if (this.sockets.size === 0) {
      // Reset event buffer only if NOT busy.
      // If we are currently streaming/busy, we must retain the buffer so a reconnecting client
      // can replay the full stream from the beginning of the active generation.
      if (!this.isBusy) {
        this.eventBuffer = [];
        this.bufferHead = 0;
      }
      // Browser closed. We do NOT kill the subprocess here: a background task
      // keeps running. We only arm the idle-kill, which fires once the agent
      // is truly idle (no streaming, no pending requests) for IDLE_TIMEOUT_MS.
      if (IDLE_DROP_HEAP) {
        try { if (typeof global.gc === "function") global.gc(); } catch {}
      }
      // If unkeyed AND truly idle (never had a session assigned and not busy),
      // no client can ever re-attach to it. Stop immediately to reclaim memory.
      if (!this.sessionKey && !this.isBusy) {
        this.stop();
        return;
      }
      this.maybeScheduleIdleKill();
    }
  }

  setSessionKey(cwd, sessionPath) {
    if (!sessionPath) return;
    const resolved = normalizePath(sessionPath);
    const key = `${cwd}:${resolved}`;
    if (this.sessionKey && this.sessionKey !== key) {
      activeAgents.delete(this.sessionKey);
    }
    this.sessionKey = key;
    activeAgents.set(key, this);
  }

  markActivity() {
    this.lastActivityAt = nowMs();
    // any activity cancels a pending idle-kill; it will be re-armed when idle.
    this.cancelIdleKill();
    if (!this.hasWs && !this.isBusy) this.maybeScheduleIdleKill();
  }

  setStreaming(streaming) {
    this.state = streaming ? "streaming" : "idle";
    this.markActivity();
  }

  maybeScheduleIdleKill() {
    // Only arm the reclamation timer when: no client attached AND truly idle.
    // A background task that is still running must never be killed here.
    if (!this.alive || this.hasWs || this.isBusy) return;
    if (IDLE_TIMEOUT_MS === 0) return; // disabled
    this.cancelIdleKill();
    const ms = IDLE_TIMEOUT_MS;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      // re-check at fire time — a reconnect or new task may have started.
      if (!this.alive || this.hasWs || this.isBusy) return;
      console.log(`Reclaiming truly-idle pi agent after ${Math.round(ms / 1000)}s (key=${this.sessionKey || "unkeyed"})`);
      if (IDLE_DROP_HEAP) {
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

  // Back-compat shim for any caller that used the old name.
  scheduleCleanup(delayMs = 300000) {
    this.cancelIdleKill();
    if (delayMs === 0) { this.stop(); return; }
    // treat as immediate idle-kill after the given delay only if truly idle
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.hasWs || this.isBusy) return;
      this.stop();
    }, delayMs);
  }
  cancelCleanup() { this.cancelIdleKill(); }

  start() {
    const args = [PI_BIN, "--mode", "rpc", "--session-dir", SESSIONS_DIR];
    this.proc = spawn(args[0], args.slice(1), {
      cwd: this.cwd,
      env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
    });
    this.alive = true;
    allAgents.add(this);
    this.startedAt = nowMs();
    this.lastActivityAt = this.startedAt;
    if (MAX_AGENT_LIFETIME_MS > 0) {
      this.lifetimeTimer = setTimeout(() => {
        console.warn(`pi agent hit MAX_AGENT_LIFETIME_MS (${Math.round(MAX_AGENT_LIFETIME_MS / 1000)}s), force-stopping (key=${this.sessionKey || "unkeyed"})`);
        this.stop();
      }, MAX_AGENT_LIFETIME_MS);
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
      console.error(`[pi spawn error]`, err);
      this.wsSend({ type: "pi_exit", error: err.message });
      for (const s of this.sockets) { try { s.close(); } catch {} }
      this.sockets.clear();
    });
    if (this.proc.stdin) {
      this.proc.stdin.on("error", (err) => {
        console.warn(`[pi stdin error]`, err.message);
      });
    }
    this.proc.stdout.on("data", (d) => this.onStdout(d));
    this.proc.stderr.on("data", (d) => {
      process.stderr.write(`[pi stderr] ${d}`);
    });
    this.proc.on("exit", (code) => {
      this.alive = false;
      allAgents.delete(this);
      console.log(`pi exited (code=${code})`);
      this.wsSend({ type: "pi_exit", code });
      if (this.sessionKey) activeAgents.delete(this.sessionKey);
      for (const [id, resolve] of this.pending) {
        resolve({ type: "response", id, success: false, error: "pi exited" });
      }
      this.pending.clear();
      for (const s of this.sockets) { try { s.close(); } catch {} }
      this.sockets.clear();
      this.cancelIdleKill();
      if (this.lifetimeTimer) { clearTimeout(this.lifetimeTimer); this.lifetimeTimer = null; }
    });
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
    // Automatically register sessionKey if sessionFile is present in RPC response/event
    if (obj.data?.sessionFile) {
      this.setSessionKey(this.cwd, obj.data.sessionFile);
    }
    // Track streaming lifecycle so background tasks are not killed mid-flight.
    switch (obj.type) {
      case "agent_start": this.setStreaming(true); break;
      case "agent_end": this.setStreaming(false); break;
      case "agent_settled":
        this.setStreaming(false);
        this.eventBuffer = [];
        this.bufferHead = 0;
        // If unkeyed, actively query state from pi so sessionKey is recorded
        if (!this.sessionKey) {
          this.send({ type: "get_state" });
        }
        break;
      case "pi_exit": this.state = "idle"; break;
    }
    // Capture the most recent user prompt for the background-task dashboard.
    if (obj.type === "remote_user_prompt" || obj.type === "remote_user_steer") {
      this.lastUserPrompt = { text: obj.message, isSteer: !!obj.isSteer, at: nowMs() };
    }
    // RPC responses carry `id`; events do not.
    if (obj.type === "response" && obj.id) {
      const res = this.pending.get(obj.id);
      if (res) { this.pending.delete(obj.id); res(obj); }
      this.markActivity();
    }
    // Forward every event / response to connected browsers as-is.
    this.wsSend(obj);
    // If nobody is listening, or if the agent is currently busy (streaming), remember it
    // so any reconnecting or newly connecting clients can replay and catch up.
    if (!this.hasWs || this.isBusy) {
      this.bufferEvent(obj);
    }
  }

  bufferEvent(obj) {
    if (EVENT_BUFFER_SIZE <= 0) return;
    if (this.eventBuffer.length < EVENT_BUFFER_SIZE) {
      this.eventBuffer.push(obj);
    } else {
      this.eventBuffer[this.bufferHead] = obj;
      this.bufferHead = (this.bufferHead + 1) % EVENT_BUFFER_SIZE;
    }
  }

  replayBuffered(ws) {
    if (this.eventBuffer.length === 0) return;
    if (ws.readyState !== 1) return;
    const count = this.eventBuffer.length;
    // Send a marker so the client knows the next burst is backfill, not live.
    try { ws.send(JSON.stringify({ type: "backfill_start", count })); } catch {}
    const start = count === EVENT_BUFFER_SIZE ? this.bufferHead : 0;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % EVENT_BUFFER_SIZE;
      const ev = this.eventBuffer[idx];
      try { ws.send(JSON.stringify(ev)); } catch {}
    }
    try { ws.send(JSON.stringify({ type: "backfill_end", streaming: this.isBusy, state: this.state })); } catch {}
    // Only clear the buffer if the agent is not busy.
    // If the agent is still busy, keep the buffer so that other clients or future reconnects can still catch up.
    if (!this.isBusy) {
      this.eventBuffer = [];
      this.bufferHead = 0;
    }
  }

  send(cmd) {
    return new Promise((resolve) => {
      if (!this.alive || !this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
        return resolve({ type: "response", id: cmd.id || "0", success: false, error: "pi process not alive" });
      }
      const id = String(++this.reqId);
      const payload = { ...cmd, id };
      // Long-running commands (prompt/steer) are tracked for their whole
      // lifetime: pi's response may legitimately take many minutes, and the
      // pending entry doubles as the isBusy guard that protects a working
      // agent from idle-kill. Fire-and-forget queries (get_state etc.) keep a
      // safety timeout so a dropped response doesn't leak the promise.
      const longRunning = cmd.type === "prompt" || cmd.type === "steer";
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
        this.pending.delete(id);
        return resolve({ type: "response", id, success: false, error: err.message });
      }
      if (!longRunning) {
        timeoutId = setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            resolve({ type: "response", id, success: false, error: "timeout" });
          }
        }, 60000);
      }
    });
  }

  sendNoReply(cmd) {
    if (!this.alive || !this.proc || !this.proc.stdin || this.proc.stdin.destroyed) return;
    this.markActivity();
    try {
      this.proc.stdin.write(JSON.stringify(cmd) + "\n");
    } catch (e) {
      console.error("[pi sendNoReply error]", e);
    }
  }

  wsSend(obj, excludeSocket = null) {
    const payload = typeof obj === "string" ? obj : JSON.stringify(obj);
    for (const ws of [...this.sockets]) {
      if (ws.readyState > 1) { // CLOSING or CLOSED
        this.sockets.delete(ws);
        continue;
      }
      if (ws !== excludeSocket && ws.readyState === 1) {
        try {
          ws.send(payload);
        } catch (e) {
          console.error("wsSend error", e);
          this.sockets.delete(ws);
        }
      }
    }
  }

  status() {
    return {
      cwd: this.cwd,
      sessionKey: this.sessionKey,
      alive: this.alive,
      state: this.state,
      busy: this.isBusy,
      hasClients: this.hasWs,
      clientCount: this.sockets.size,
      pendingRequests: this.pending.size,
      startedAt: this.startedAt || null,
      lastActivityAt: this.lastActivityAt || null,
      uptimeMs: this.startedAt ? nowMs() - this.startedAt : 0,
      bufferedEvents: this.eventBuffer.length,
      lastUserPrompt: this.lastUserPrompt,
    };
  }

  stop() {
    this.alive = false;
    allAgents.delete(this);
    this.cancelIdleKill();
    if (this.lifetimeTimer) { clearTimeout(this.lifetimeTimer); this.lifetimeTimer = null; }
    if (this.sessionKey) {
      activeAgents.delete(this.sessionKey);
    }
    for (const [id, resolve] of this.pending) {
      resolve({ type: "response", id, success: false, error: "pi process stopped" });
    }
    this.pending.clear();
    for (const s of this.sockets) { try { s.close(); } catch {} }
    this.sockets.clear();
    this.buffer = "";
    this.eventBuffer = [];
    this.bufferHead = 0;
    this.lastUserPrompt = null;
    try { this.proc && this.proc.kill("SIGTERM"); } catch {}
  }
}

// ---- REST: list sessions + read one session's messages ----
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Endpoint to catch front-end errors for deep diagnostics
app.post("/api/log-error", (req, res) => {
  const { message, source, lineno, colno, error, userAgent } = req.body;
  const logStr = `\n[CLIENT ERROR] ${new Date().toISOString()}\nMessage: ${message}\nSource: ${source}:${lineno}:${colno}\nError: ${JSON.stringify(error)}\nUA: ${userAgent}\n`;
  process.stderr.write(logStr);
  res.json({ ok: true });
});

// Helper to resolve pi settings (global and project-level)
async function getPiSettings(targetCwd) {
  const globalPath = path.join(home(), ".pi", "agent", "settings.json");
  let globalSettings = {};
  let globalExists = false;
  try {
    if (existsSync(globalPath)) {
      globalSettings = JSON.parse(await readFile(globalPath, "utf8"));
      globalExists = true;
    }
  } catch {}

  let projectSettings = {};
  let projectExists = false;
  if (targetCwd) {
    try {
      const pPath = path.join(targetCwd, ".pi", "settings.json");
      if (existsSync(pPath)) {
        projectSettings = JSON.parse(await readFile(pPath, "utf8"));
        projectExists = true;
      }
    } catch {}
  }

  const defaultProvider = projectSettings.defaultProvider || globalSettings.defaultProvider || null;
  const defaultModel = projectSettings.defaultModel || globalSettings.defaultModel || null;
  const defaultThinkingLevel = projectSettings.defaultThinkingLevel || globalSettings.defaultThinkingLevel || null;
  const source = (projectExists && projectSettings.defaultModel) ? "project" : ((globalExists && globalSettings.defaultModel) ? "global" : "default");

  return {
    defaultProvider,
    defaultModel,
    defaultThinkingLevel,
    source,
    globalSettings,
    projectSettings,
  };
}

// Endpoint to get server environment config (home dir, server process cwd, default model settings)
app.get("/api/config", async (req, res) => {
  const reqCwd = normalizeCwd(req.query.cwd || "");
  const settings = await getPiSettings(reqCwd);
  res.json({
    home: home(),
    serverCwd: process.cwd(),
    version: PKG_VERSION,
    defaultModel: {
      provider: settings.defaultProvider,
      id: settings.defaultModel,
      thinkingLevel: settings.defaultThinkingLevel,
      source: settings.source,
    },
  });
});

// Endpoint to set default model in global or project settings.json
app.post("/api/set-default-model", async (req, res) => {
  try {
    const { provider, modelId, thinkingLevel, scope, cwd: reqCwd } = req.body;
    if (!provider || !modelId) {
      return res.status(400).json({ ok: false, error: "缺少 provider 或 modelId 参数" });
    }

    const isProject = scope === "project" && reqCwd;
    let settingsPath;
    if (isProject) {
      const resolvedCwd = normalizeCwd(reqCwd);
      try {
        const s = await stat(resolvedCwd);
        if (!s.isDirectory()) {
          return res.status(400).json({ ok: false, error: "指定的工作目录不是一个有效目录" });
        }
      } catch {
        return res.status(400).json({ ok: false, error: "指定的工作目录不存在或无权访问" });
      }
      settingsPath = path.join(resolvedCwd, ".pi", "settings.json");
    } else {
      settingsPath = path.join(home(), ".pi", "agent", "settings.json");
    }

    await mkdir(path.dirname(settingsPath), { recursive: true });

    let current = {};
    try {
      if (existsSync(settingsPath)) {
        current = JSON.parse(await readFile(settingsPath, "utf8"));
      }
    } catch {}

    current.defaultProvider = provider;
    current.defaultModel = modelId;
    if (thinkingLevel !== undefined) {
      current.defaultThinkingLevel = thinkingLevel;
    }

    // If enabledModels is configured in settings.json, ensure the new default model
    // is in the enabledModels list, otherwise Pi core startup logic will fall back
    // to enabledModels[0] instead of using defaultModel.
    if (Array.isArray(current.enabledModels) && current.enabledModels.length > 0) {
      const fullId = `${provider}/${modelId}`;
      const inList = current.enabledModels.some(item =>
        item === fullId || item === modelId || item === `${provider}/*` || item === "*"
      );
      if (!inList) {
        current.enabledModels.unshift(fullId);
      }
    }

    await writeFile(settingsPath, JSON.stringify(current, null, 2), "utf8");

    res.json({
      ok: true,
      scope: isProject ? "project" : "global",
      defaultProvider: provider,
      defaultModel: modelId,
      defaultThinkingLevel: current.defaultThinkingLevel || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint to validate if a directory path exists on the server
app.get("/api/validate-dir", async (req, res) => {
  const target = normalizeCwd(req.query.path || "");
  try {
    const s = await stat(target);
    if (s.isDirectory()) {
      res.json({ ok: true, path: target });
    } else {
      res.json({ ok: false, error: "指定路径存在但不是一个目录" });
    }
  } catch (e) {
    res.json({ ok: false, error: "目录不存在或没有访问权限" });
  }
});

// Endpoint listing all live background pi agents (for dashboards / debug).
// Shows which sessions are still running headlessly after the browser closed.
app.get("/api/agents", (req, res) => {
  const agents = [];
  for (const a of allAgents) {
    if (!a.alive) continue;
    agents.push({ key: a.sessionKey || "unkeyed", ...a.status() });
  }
  res.json({ count: agents.length, idleTimeoutMs: IDLE_TIMEOUT_MS, maxLifetimeMs: MAX_AGENT_LIFETIME_MS, agents });
});

// Scan SESSIONS_DIR for .jsonl files in BOTH the root AND every subdirectory.
// Why both? Because pi stores sessions under a cwd-encoded subdir (e.g.
// `--home-zrlgs--`) when left to its own device, but our server passes
// `--session-dir` directly — in that mode pi drops new session files straight
// into the directory root (no cwd subdir). So to robustly list every session
// regardless of how it got there, we walk the whole tree: root + subdirs.
async function listAllSessionFiles() {
  if (!existsSync(SESSIONS_DIR)) return [];
  const files = [];

  // Root-level .jsonl files (created when we pass --session-dir to pi).
  const top = await readdir(SESSIONS_DIR, { withFileTypes: true }).catch(() => []);
  for (const e of top) {
    if ((e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".jsonl")) {
      files.push(path.join(SESSIONS_DIR, e.name));
    }
  }

  // Subdirectory .jsonl files (created by pi itself when cwd is encoded).
  const subdirs = top.filter(d => d.isDirectory() || (d.isSymbolicLink() && !d.name.endsWith(".jsonl")));
  for (const d of subdirs) {
    const dp = path.join(SESSIONS_DIR, d.name);
    const names = (await readdir(dp).catch(() => [])).filter(f => f.endsWith(".jsonl"));
    for (const n of names) files.push(path.join(dp, n));
  }
  return files;
}

// Memory metadata cache keyed by file path -> { mtimeMs, cwd, sessionInfo }
const sessionMetadataCache = new Map();

async function getSessionMetadata(file) {
  const fileStat = await stat(file);
  const cached = sessionMetadataCache.get(file);
  if (cached && cached.mtimeMs === fileStat.mtimeMs) {
    return cached;
  }

  const content = await readFile(file, "utf8");
  const lines = content.split("\n").filter(Boolean);
  let header = null, title = null, sessionName = null, msgCount = 0;
  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type === "session") header = o;
    if (o.type === "session_info" && o.name) {
      sessionName = o.name.trim();
    }
    if (o.type === "message" && o.message && o.message.role === "user" && !title) {
      title = extractText(o.message.content).slice(0, 80);
    }
    if (o.type === "message") msgCount++;
  }

  if (!header) return null;

  const result = {
    mtimeMs: fileStat.mtimeMs,
    cwd: normalizeCwd(header.cwd),
    sessionInfo: {
      file,
      name: path.basename(file),
      id: header.id,
      sessionName: sessionName || null,
      timestamp: header.timestamp,
      firstUser: title,
      messageCount: msgCount,
    },
  };
  sessionMetadataCache.set(file, result);
  return result;
}

app.get("/api/sessions", async (req, res) => {
  try {
    const cwd = normalizeCwd(req.query.cwd);
    const all = await listAllSessionFiles();
    const results = await Promise.all(
      all.map(async (full) => {
        try {
          const meta = await getSessionMetadata(full);
          if (meta && meta.cwd === cwd) {
            return meta.sessionInfo;
          }
        } catch {}
        return null;
      })
    );
    const sessions = results.filter(Boolean);
    sessions.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    res.json({ cwd, sessions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(c => c && (c.type === "text" || typeof c === "string"))
    .map(c => typeof c === "string" ? c : (c.text || ""))
    .join("");
}

// Return a session as a linear chat transcript (walking the parent chain to the leaf).
app.get("/api/session", async (req, res) => {
  try {
    const file = req.query.file;
    if (!file || !file.endsWith(".jsonl")) return res.status(400).json({ error: "bad file" });
    
    // Security check: ensure the file path is within SESSIONS_DIR. We resolve the
    // canonical (real) path rather than just the lexical one, otherwise a
    // symlink placed inside SESSIONS_DIR could point outside and let a caller
    // read arbitrary .jsonl files via the traversal check above.
    const resolvedSessionsDir = normalizePath(SESSIONS_DIR);
    const requestedPath = normalizePath(file);
    const relPath = path.relative(resolvedSessionsDir, requestedPath);
    if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
      return res.status(403).json({ error: "Access denied" });
    }
    // Canonicalize both target file and sessions directory to verify the real
    // target still lives under the real SESSIONS_DIR even when symlinks exist.
    let resolvedFile;
    try {
      resolvedFile = await fsRealpath(requestedPath);
    } catch {
      // Fall back to the lexical path if realpath fails (e.g. missing file);
      // the read below will surface the actual error.
      resolvedFile = requestedPath;
    }
    let canonicalSessionsDir = resolvedSessionsDir;
    try {
      canonicalSessionsDir = await fsRealpath(resolvedSessionsDir);
    } catch {}
    const realRel = path.relative(canonicalSessionsDir, resolvedFile);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const content = await readFile(resolvedFile, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const entries = [];
    let header = null;
    let sessionName = null;
    for (const line of lines) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.type === "session") header = o;
      if (o.type === "session_info" && o.name) {
        sessionName = o.name.trim();
      }
      entries.push(o);
    }
    // Build a map and reconstruct the active path from root -> leaf.
    const byId = new Map();
    for (const e of entries) if (e.id) byId.set(e.id, e);
    // find true leaf = last entry with no children
    const childCount = new Map();
    for (const e of entries) {
      if (e.parentId) childCount.set(e.parentId, (childCount.get(e.parentId) || 0) + 1);
    }
    let leafId = null;
    for (const e of entries) {
      if (e.id && !childCount.has(e.id)) leafId = e.id;
    }
    // Walk parent chain from leaf to root.
    const entryChain = [];
    let cur = leafId;
    const guard = new Set();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const e = byId.get(cur);
      if (!e) break;
      entryChain.unshift(e);
      cur = e.parentId;
    }

    // Extract the active model used in this session chain
    let sessionModel = null;
    for (let i = entryChain.length - 1; i >= 0; i--) {
      const e = entryChain[i];
      if (e.type === "model_change" && (e.modelId || e.model)) {
        sessionModel = {
          provider: e.provider || "",
          id: e.modelId || e.model,
          name: e.modelId || e.model
        };
        break;
      }
      if (e.type === "message" && e.message && e.message.role === "assistant" && e.message.model) {
        sessionModel = {
          provider: e.message.provider || e.provider || "",
          id: e.message.model,
          name: e.message.model
        };
        break;
      }
    }

    res.json({ header, entries: entryChain, model: sessionModel, sessionName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Delete a session file from disk and clean up in-memory caches / active agents
app.delete("/api/session", async (req, res) => {
  try {
    const file = req.query.file || req.body?.file;
    if (!file || !file.endsWith(".jsonl")) {
      return res.status(400).json({ error: "bad file" });
    }

    const resolvedSessionsDir = normalizePath(SESSIONS_DIR);
    const requestedPath = normalizePath(file);
    const relPath = path.relative(resolvedSessionsDir, requestedPath);
    if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    let resolvedFile;
    try {
      resolvedFile = await fsRealpath(requestedPath);
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      resolvedFile = requestedPath;
    }

    let canonicalSessionsDir = resolvedSessionsDir;
    try {
      canonicalSessionsDir = await fsRealpath(resolvedSessionsDir);
    } catch {}

    const realRel = path.relative(canonicalSessionsDir, resolvedFile);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Stop and unpool any active PiAgent managing this session
    for (const [key, agent] of activeAgents.entries()) {
      if (key.endsWith(`:${requestedPath}`) || key.endsWith(`:${resolvedFile}`)) {
        activeAgents.delete(key);
        try {
          agent.stop();
        } catch {}
      }
    }

    // Invalidate session cache
    sessionMetadataCache.delete(requestedPath);
    sessionMetadataCache.delete(resolvedFile);

    // Delete the session JSONL file
    await unlink(resolvedFile);

    res.json({ success: true, file: requestedPath });
  } catch (e) {
    console.error("Delete session error:", e);
    res.status(500).json({ error: String(e) });
  }
});

// ---- WebSocket: 1 browser conn = 1 pi RPC conn (with process persistence) ----
const httpServer = app.listen(PORT, () => {
  console.log(`pi-web-chat on http://localhost:${PORT}`);
});

// Origin check helper to defend against Cross-Site WebSocket Hijacking (CSWSH)
function isAllowedOrigin(origin, host) {
  if (!origin) return true; // Direct non-browser clients (curl, electron, etc.)
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    // Direct match with Host header (same-origin)
    if (originHost.toLowerCase() === (host || "").toLowerCase()) return true;

    // Allow localhost / 127.0.0.1 loopback variations
    const isLocalOrigin = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === "::1";
    const hostName = (host || "").split(":")[0].toLowerCase();
    const isLocalHost = hostName === "localhost" || hostName === "127.0.0.1" || hostName === "::1";
    if (isLocalOrigin && isLocalHost) return true;

    // Custom allowed origins from ALLOWED_ORIGINS env var (comma-separated)
    if (process.env.ALLOWED_ORIGINS) {
      const allowed = process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim().toLowerCase());
      if (allowed.includes(origin.toLowerCase()) || allowed.includes(originUrl.origin.toLowerCase())) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin;
    const host = info.req.headers.host;
    if (!isAllowedOrigin(origin, host)) {
      console.warn(`[pi-web-chat] Rejected WebSocket connection from unauthorized origin: ${origin} (host: ${host})`);
      return callback(false, 403, "Forbidden: Cross-origin WebSocket connection denied");
    }
    callback(true);
  }
});

// WebSocket server heartbeat (ping/pong at protocol level)
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("Terminating unresponsive WebSocket client");
      if (ws.piAgent) {
        ws.piAgent.detachWs(ws);
      }
      return ws.terminate();
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const url = new URL(req.url, "http://x");
  const cwd = normalizeCwd(url.searchParams.get("cwd"));
  const session = url.searchParams.get("session") || null;
  const key = session ? `${cwd}:${normalizePath(session)}` : null;

  let agent = null;
  if (key && activeAgents.has(key) && activeAgents.get(key).alive) {
    agent = activeAgents.get(key);
    console.log(`ws re-attaching to existing pi process for key=${key}`);
    agent.attachWs(ws);
  } else {
    // Enforce concurrent-agent cap before spawn. We count *all* live agents,
    // not just this key, because each represents one pi RPC subprocess in
    // memory. The cap protects small-memory hosts from runaway browser tabs.
    if (MAX_CONCURRENT_AGENTS > 0) {
      let live = 0;
      for (const a of allAgents) if (a.alive) live++;
      if (live >= MAX_CONCURRENT_AGENTS) {
        const msg = `Server is at capacity (${live}/${MAX_CONCURRENT_AGENTS} pi agents). ` +
                    `Close another tab or raise MAX_CONCURRENT_AGENTS.`;
        console.warn(`[pi-web-chat] refusing new ws: ${msg}`);
        try {
          ws.send(JSON.stringify({ type: "error", code: "capacity", message: msg }));
        } catch {}
        try { ws.close(1013, "capacity"); } catch {} // 1013 = "try again later"
        return;
      }
    }
    agent = new PiAgent(cwd);
    agent.start();
    agent.attachWs(ws);
    if (session) {
      agent.setSessionKey(cwd, session);
      agent.sendNoReply({ type: "switch_session", sessionPath: session });
    }
  }
  ws.piAgent = agent;
  console.log(`ws connected (cwd=${cwd}, session=${session || "new"})`);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "ping") {
      try { ws.send(JSON.stringify({ type: "pong" })); } catch {}
      return;
    }
    switch (msg.type) {
      case "prompt":
        // Sync prompt to other connected clients in the same session
        agent.wsSend({ type: "remote_user_prompt", message: msg.message, images: msg.images }, ws);
        agent.lastUserPrompt = { text: msg.message, isSteer: false, at: nowMs() };
        agent.send({ type: "prompt", message: msg.message, images: msg.images });
        break;
      case "abort":
        agent.sendNoReply({ type: "abort" });
        break;
      case "new_session":
        if (agent.sessionKey) {
          activeAgents.delete(agent.sessionKey);
          agent.sessionKey = null;
        }
        agent.lastUserPrompt = null;
        agent.eventBuffer = [];
        agent.bufferHead = 0;
        agent.send({ type: "new_session" });
        break;
      case "switch_session":
        if (!msg.sessionPath) break; // refuse malformed request; never forward an undefined path to pi
        agent.setSessionKey(cwd, msg.sessionPath);
        agent.send({ type: "switch_session", sessionPath: msg.sessionPath });
        break;
      case "steer":
        // Sync steer instruction to other connected clients in the same session
        agent.wsSend({ type: "remote_user_prompt", message: msg.message, isSteer: true }, ws);
        agent.lastUserPrompt = { text: msg.message, isSteer: true, at: nowMs() };
        agent.send({ type: "steer", message: msg.message });
        break;
      case "set_session_name":
        agent.send({ type: "set_session_name", name: msg.name });
        break;
      case "get_entries":
        agent.send({ type: "get_entries", since: msg.since });
        break;
      case "get_state":
        agent.send({ type: "get_state" });
        break;
      case "get_available_models":
        agent.send({ type: "get_available_models" });
        break;
      case "set_model":
        agent.send({ type: "set_model", provider: msg.provider, modelId: msg.modelId });
        break;
      case "set_thinking_level":
        agent.send({ type: "set_thinking_level", level: msg.level });
        break;
      case "cycle_thinking_level":
        agent.send({ type: "cycle_thinking_level" });
        break;
      case "extension_ui_response":
        agent.sendNoReply({ type: "extension_ui_response", ...msg });
        break;
      default:
        // Unknown — just forward, might be a raw RPC command.
        agent.send(msg);
    }
  });

  ws.on("close", () => {
    console.log("ws connection closed, detaching agent");
    if (ws.piAgent) {
      ws.piAgent.detachWs(ws);
    }
  });
  ws.on("error", () => {
    if (ws.piAgent) {
      ws.piAgent.detachWs(ws);
    }
  });
});

// ---- Graceful shutdown: stop all background pi agents on exit ----
function shutdownAllAgents(reason) {
  console.log(`\n[pi-web-chat] ${reason}: stopping ${allAgents.size} background pi agent(s)…`);
  for (const a of [...allAgents]) {
    try { a.stop(); } catch {}
  }
  clearInterval(heartbeatInterval);
  try { wss.close(); } catch {}
  try { httpServer.close(); } catch {}
}
process.on("SIGINT", () => { shutdownAllAgents("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { shutdownAllAgents("SIGTERM"); process.exit(0); });
process.on("exit", () => {
  // best-effort: kill any still-living children synchronously on hard exit
  for (const a of allAgents) {
    try { a.proc && a.proc.kill("SIGKILL"); } catch {}
  }
});
