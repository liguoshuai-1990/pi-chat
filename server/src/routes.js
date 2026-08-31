import { Router } from "express";
import { readFile, readdir, stat, writeFile, mkdir, realpath as fsRealpath, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { config, home, normalizeCwd, normalizePath } from "./config.js";
import { authMiddleware } from "./auth.js";
import { allAgents, activeAgents, getOrCreateAgent } from "./agent.js";
import { handleSseStream } from "./sse.js";

export const router = Router();

// Endpoint to catch front-end errors
router.post("/api/log-error", (req, res) => {
  const { message, source, lineno, colno, error, userAgent } = req.body || {};
  const logStr = `\n[CLIENT ERROR] ${new Date().toISOString()}\nMessage: ${message}\nSource: ${source}:${lineno}:${colno}\nError: ${JSON.stringify(error)}\nUA: ${userAgent}\n`;
  process.stderr.write(logStr);
  res.json({ ok: true });
});

// SSE Streaming endpoint
router.get("/api/stream", authMiddleware, handleSseStream);

// Helper to resolve pi settings (global and project-level)
async function getPiSettings(targetCwd) {
  const globalCandidates = [
    path.join(home(), ".pi", "agent", "settings.json"),
    path.join(home(), ".pi", "settings.json"),
  ];
  let globalSettings = {};
  let globalExists = false;
  for (const globalPath of globalCandidates) {
    try {
      if (existsSync(globalPath)) {
        globalSettings = JSON.parse(await readFile(globalPath, "utf8"));
        globalExists = true;
        break;
      }
    } catch {}
  }

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

// Endpoint to get server environment config
router.get("/api/config", authMiddleware, async (req, res) => {
  const reqCwd = normalizeCwd(req.query.cwd || "");
  const settings = await getPiSettings(reqCwd);
  res.json({
    home: home(),
    serverCwd: process.cwd(),
    version: config.version,
    authRequired: Boolean(config.authToken),
    defaultModel: {
      provider: settings.defaultProvider,
      id: settings.defaultModel,
      thinkingLevel: settings.defaultThinkingLevel,
      source: settings.source,
    },
  });
});

// Endpoint to set default model in global or project settings.json
router.post("/api/set-default-model", authMiddleware, async (req, res) => {
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
router.get("/api/validate-dir", authMiddleware, async (req, res) => {
  const target = normalizeCwd(req.query.path || "");
  try {
    const s = await stat(target);
    if (s.isDirectory()) {
      res.json({ ok: true, path: target });
    } else {
      res.json({ ok: false, error: "指定路径存在但不是一个目录" });
    }
  } catch {
    res.json({ ok: false, error: "目录不存在或没有访问权限" });
  }
});

// Endpoint listing all live background pi agents
router.get("/api/agents", authMiddleware, (req, res) => {
  const agents = [];
  for (const a of allAgents) {
    if (!a.alive) continue;
    agents.push({ key: a.sessionKey || "unkeyed", ...a.status() });
  }
  res.json({
    count: agents.length,
    idleTimeoutMs: config.idleTimeoutMs,
    maxLifetimeMs: config.maxAgentLifetimeMs,
    agents
  });
});

async function listAllSessionFiles() {
  if (!existsSync(config.sessionsDir)) return [];
  const files = [];

  async function walk(dir, depth = 0) {
    if (depth > 5) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() || e.isSymbolicLink()) {
        if (e.name.endsWith(".jsonl")) {
          files.push(full);
        }
      } else if (e.isDirectory()) {
        await walk(full, depth + 1);
      }
    }
  }

  await walk(config.sessionsDir);
  return files;
}

const MAX_SESSION_CACHE_SIZE = 5000;
const sessionMetadataCache = new Map();

function setSessionMetadataCache(key, value) {
  if (sessionMetadataCache.size >= MAX_SESSION_CACHE_SIZE) {
    const firstKey = sessionMetadataCache.keys().next().value;
    if (firstKey) sessionMetadataCache.delete(firstKey);
  }
  sessionMetadataCache.set(key, value);
}

function resolveSessionPath(file) {
  if (!file || typeof file !== "string") return null;
  const resolvedSessionsDir = normalizePath(config.sessionsDir);
  const target = file.startsWith("~")
    ? normalizePath(file)
    : (path.isAbsolute(file) ? path.normalize(file) : path.resolve(resolvedSessionsDir, file));
  return { resolvedSessionsDir, requestedPath: target };
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    if (content && typeof content === "object") {
      return content.text || content.content || "";
    }
    return "";
  }
  return content
    .filter(c => c && (c.type === "text" || typeof c === "string" || c.text))
    .map(c => typeof c === "string" ? c : (c.text || c.content || ""))
    .join("");
}

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
    if (o.type === "session") {
      header = o;
      if (o.name) sessionName = o.name.trim();
    }
    if (o.type === "session_info" && o.name) {
      sessionName = o.name.trim();
    }
    const msgContent = o.message?.content || (o.type === "message" ? o.content : null);
    if (o.type === "message" && o.message && o.message.role === "user" && !title && msgContent) {
      title = extractText(msgContent).slice(0, 80);
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
      firstUser: title || sessionName || (header.name ? header.name.trim() : null),
      messageCount: msgCount,
    },
  };
  setSessionMetadataCache(file, result);
  return result;
}

// List all sessions for a given cwd
router.get("/api/sessions", authMiddleware, async (req, res) => {
  try {
    const cwd = normalizeCwd(req.query.cwd);
    const all = await listAllSessionFiles();
    const results = await Promise.all(
      all.map(async (full) => {
        try {
          const meta = await getSessionMetadata(full);
          if (meta && meta.cwd === cwd) {
            const key = `${cwd}:${normalizePath(full)}`;
            const agent = activeAgents.get(key);
            const isStreaming = agent ? Boolean(agent.isBusy) : false;
            return {
              ...meta.sessionInfo,
              isStreaming,
            };
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

// Return a session linear chat transcript
router.get("/api/session", authMiddleware, async (req, res) => {
  try {
    const file = req.query.file;
    if (!file || typeof file !== "string" || !file.endsWith(".jsonl")) return res.status(400).json({ error: "bad file" });

    const resolvedInfo = resolveSessionPath(file);
    if (!resolvedInfo) return res.status(400).json({ error: "bad file" });

    const { resolvedSessionsDir, requestedPath } = resolvedInfo;
    const relPath = path.relative(resolvedSessionsDir, requestedPath);
    if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    let resolvedFile;
    try {
      resolvedFile = await fsRealpath(requestedPath);
    } catch {
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

    const byId = new Map();
    for (const e of entries) if (e.id) byId.set(e.id, e);

    const childCount = new Map();
    for (const e of entries) {
      if (e.parentId) childCount.set(e.parentId, (childCount.get(e.parentId) || 0) + 1);
    }
    let leafId = null;
    for (const e of entries) {
      if (e.id && !childCount.has(e.id)) leafId = e.id;
    }

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

    const activeEntries = entryChain.length > 0 ? entryChain : entries;

    let sessionModel = null;
    for (let i = activeEntries.length - 1; i >= 0; i--) {
      const e = activeEntries[i];
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

    if (!sessionModel && header?.model) {
      sessionModel = {
        provider: header.provider || "",
        id: header.model,
        name: header.model
      };
    }

    res.json({ header, entries: activeEntries, model: sessionModel, sessionName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Delete a session file
router.delete("/api/session", authMiddleware, async (req, res) => {
  try {
    const file = req.query.file || req.body?.file;
    if (!file || typeof file !== "string" || !file.endsWith(".jsonl")) {
      return res.status(400).json({ error: "bad file" });
    }

    const resolvedInfo = resolveSessionPath(file);
    if (!resolvedInfo) return res.status(400).json({ error: "bad file" });

    const { resolvedSessionsDir, requestedPath } = resolvedInfo;
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

    for (const [key, agent] of activeAgents.entries()) {
      if (key.endsWith(`:${requestedPath}`) || key.endsWith(`:${resolvedFile}`)) {
        activeAgents.delete(key);
        try {
          agent.stop();
        } catch {}
      }
    }

    sessionMetadataCache.delete(requestedPath);
    sessionMetadataCache.delete(resolvedFile);

    await unlink(resolvedFile);

    res.json({ success: true, file: requestedPath });
  } catch (e) {
    console.error("Delete session error:", e);
    res.status(500).json({ error: String(e) });
  }
});

// HTTP REST Chat endpoint
router.post("/api/chat", authMiddleware, async (req, res) => {
  const { message, images, cwd, session } = req.body || {};
  if (!message && (!images || images.length === 0)) {
    return res.status(400).json({ ok: false, error: "Message or images are required" });
  }

  try {
    const agent = getOrCreateAgent(cwd, session);
    agent.broadcast({ type: "remote_user_prompt", message: message || "", images: images || [] });
    agent.lastUserPrompt = { text: message || "", isSteer: false, at: Date.now() };

    const response = await agent.send({ type: "prompt", message: message || "", images: images || [] });
    if (!res.headersSent && !res.writableEnded) {
      res.json(response);
    }
  } catch (err) {
    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

// HTTP REST Abort endpoint
router.post("/api/abort", authMiddleware, (req, res) => {
  const { cwd, session } = req.body || {};
  try {
    const agent = getOrCreateAgent(cwd, session);
    agent.sendNoReply({ type: "abort" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
