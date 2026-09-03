// app.js — front-end logic for pi-web-chat
// Connects to the WebSocket, renders streaming responses,
// manages the session sidebar, and the composer.

// Global error catcher to report front-end errors back to node console for debug
window.onerror = function (message, source, lineno, colno, error) {
  fetch("/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      source,
      lineno,
      colno,
      error: error ? { message: error.message, stack: error.stack } : null,
      userAgent: navigator.userAgent
    })
  }).catch(() => {});
  return false; // let it still output to browser console too
};

const API = ""; // same origin

function getAuthToken() {
  try {
    const urlToken = new URLSearchParams(window.location.search).get("token");
    if (urlToken) {
      localStorage.setItem("pi_auth_token", urlToken);
      // Strip token from URL to prevent leakage via Referer, screenshots, or shared links
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("token");
      window.history.replaceState({}, "", cleanUrl.toString());
      return urlToken;
    }
    return localStorage.getItem("pi_auth_token") || "";
  } catch {
    return "";
  }
}

function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers }).then(async (res) => {
    if (res.status === 401) {
      const entered = prompt("Pi Gateway 开启了访问鉴权，请输入访问 Token：");
      if (entered) {
        localStorage.setItem("pi_auth_token", entered.trim());
        window.location.reload();
      }
    }
    return res;
  });
}
const state = {
  ws: null,
  wsConnected: false,
  cwd: null,
  homeDir: "",
  serverCwd: "",
  currentSessionFile: null,
  // entriesByCallId: for live assistant messages we accumulate tool calls + text
  streamingMsg: null,   // DOM node for the in-progress assistant message
  streamingItems: [],   // Array of { type: "thinking"|"text"|"tool", text?, tc? } in chronological sequence
  thinkingOpen: true,
  thinkingUserToggled: false,
  activeToolCalls: new Map(), // toolCallId -> { node, body, state }
  queuedAssistantTextId: null,
  streaming: false,
  models: [],
  currentModel: null,
  defaultModel: null,
  recentModels: [],
  thinkingLevel: "medium",
  sessionId: null,
  isBackfilling: false,
  aborting: false,
  attachedImages: [], // Array of { data: string (base64), mimeType: string, url: string }
  turnStartedAt: null,
  streamingMsgDurationEl: null,
};

let toastTimer = null;
function showToast(msg) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function formatCwdDisplay(p) {
  if (!p) return "~";
  const home = state.homeDir;
  if (home && (p === home || p === home + "/")) return "~";
  if (home && p.startsWith(home + "/")) return "~/" + p.slice(home.length + 1);
  return p;
}

function updateCwdDisplay() {
  const pill = $("#cwdPill");
  const wrap = $("#cwdPillWrap");
  if (pill) pill.textContent = formatCwdDisplay(state.cwd);
  if (wrap) wrap.title = `工作目录: ${state.cwd || "~"}`;
}

async function setCwd(newCwd) {
  state.cwd = newCwd;
  localStorage.setItem("pi_cwd", newCwd);
  await loadServerConfig();
  updateCwdDisplay();
  clearChat();
  showEmptyState(true);
  state.currentSessionFile = null;
  $("#topSessionName").textContent = "新对话";
  connectWs({});
  refreshSessions();
}

function loadRecentModels() {
  try {
    const raw = localStorage.getItem("pi_recent_models");
    if (raw) {
      state.recentModels = JSON.parse(raw);
    }
  } catch {
    state.recentModels = [];
  }
}

function saveRecentModel(model) {
  if (!model || !model.id) return;
  loadRecentModels();
  const filtered = state.recentModels.filter(m => !(m.id === model.id && m.provider === model.provider));
  filtered.unshift({
    id: model.id,
    name: model.name || model.id,
    provider: model.provider,
    reasoning: model.reasoning,
    input: model.input,
  });
  state.recentModels = filtered.slice(0, 4);
  try {
    localStorage.setItem("pi_recent_models", JSON.stringify(state.recentModels));
  } catch {}
}

async function loadServerConfig() {
  if (!state.cwd) {
    state.cwd = localStorage.getItem("pi_cwd") || document.body.dataset.cwd || "";
  }
  try {
    const cwdParam = state.cwd ? `?cwd=${encodeURIComponent(state.cwd)}` : "";
    const res = await authFetch(`${API}/api/config${cwdParam}`);
    const data = await res.json();
    if (data.home) state.homeDir = data.home;
    if (data.serverCwd) state.serverCwd = data.serverCwd;
    if (!state.cwd) {
      state.cwd = state.serverCwd || state.homeDir || "";
    }
    if (data.version) {
      state.version = data.version;
      const verEl = $("#appVersion");
      if (verEl) verEl.textContent = `v${data.version}`;
    }
    if (data.defaultModel) {
      state.defaultModel = data.defaultModel;
      if (data.defaultModel.thinkingLevel && !state.thinkingLevel) {
        state.thinkingLevel = data.defaultModel.thinkingLevel;
      }
    }
  } catch {}
  if (!state.cwd) {
    state.cwd = state.serverCwd || state.homeDir || "";
  }
  loadRecentModels();
  updateCwdDisplay();
  renderModelPill();
  updateEmptyStateModelInfo();
}

async function openCwdModal() {
  await loadServerConfig();
  const modal = $("#cwdModal");
  const input = $("#cwdInput");
  const errorEl = $("#cwdError");
  const chipsEl = $("#quickDirChips");
  if (!modal || !input) return;

  input.value = state.cwd || state.homeDir || "";
  if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }

  if (chipsEl) {
    chipsEl.innerHTML = "";
    const quicks = [];
    if (state.homeDir) quicks.push({ label: "~ (用户主页)", path: state.homeDir });
    if (state.serverCwd && state.serverCwd !== state.homeDir) {
      quicks.push({ label: "服务启动目录", path: state.serverCwd });
    }
    let recents = [];
    try { recents = JSON.parse(localStorage.getItem("pi_recent_cwds") || "[]"); } catch {}
    recents.forEach(r => {
      if (r && r !== state.homeDir && r !== state.serverCwd && !quicks.some(q => q.path === r)) {
        quicks.push({ label: formatCwdDisplay(r), path: r });
      }
    });

    quicks.forEach(q => {
      chipsEl.appendChild(el("div", {
        class: "chip",
        text: q.label,
        onclick: () => { input.value = q.path; }
      }));
    });
  }

  modal.classList.add("open");
  setTimeout(() => input.select(), 50);
}

function closeCwdModal() {
  const modal = $("#cwdModal");
  if (modal) modal.classList.remove("open");
}

async function confirmCwdChange() {
  const input = $("#cwdInput");
  const errorEl = $("#cwdError");
  const rawPath = input.value.trim();
  if (!rawPath) return;

  try {
    const res = await authFetch(`${API}/api/validate-dir?path=${encodeURIComponent(rawPath)}`);
    const data = await res.json();
    if (data.ok && data.path) {
      let recents = [];
      try { recents = JSON.parse(localStorage.getItem("pi_recent_cwds") || "[]"); } catch {}
      recents = [data.path, ...recents.filter(r => r !== data.path)].slice(0, 8);
      localStorage.setItem("pi_recent_cwds", JSON.stringify(recents));

      closeCwdModal();
      setCwd(data.path);
      showToast(`已切换工作目录: ${formatCwdDisplay(data.path)}`);
    } else {
      if (errorEl) {
        errorEl.textContent = data.error || "指定路径无法访问";
        errorEl.style.display = "block";
      }
    }
  } catch (e) {
    if (errorEl) {
      errorEl.textContent = "网络请求失败，请重试";
      errorEl.style.display = "block";
    }
  }
}

// ---- Markdown render (small, safe renderer) ----
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
}

async function copyToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed:", e);
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error("Fallback copy error:", e);
    return false;
  }
}

function renderMarkdown(md) {
  if (!md) return "";
  if (typeof md !== "string") md = String(md);
  // Strip headings of # etc. and convert to proper elements with escaping.
  // We do a fenced-code-first approach so we don't process markdown inside code.
  const parts = [];
  let rest = md;
  while (rest.length) {
    // Only match ``` at the beginning of a line (or start of string) to avoid
    // misinterpreting inline triple-backticks as code fences.
    const fenceMatch = rest.match(/(?:^|\n)```/);
    if (!fenceMatch) {
      parts.push({ kind: "md", text: rest });
      rest = "";
    } else {
      const fenceIdx = fenceMatch.index + (fenceMatch[0].length - 3);
      if (fenceIdx > 0) parts.push({ kind: "md", text: rest.slice(0, fenceIdx) });
      rest = rest.slice(fenceIdx + 3);
      // optional language on this line
      const nl = rest.indexOf("\n");
      let lang = "";
      if (nl !== -1) {
        const firstLine = rest.slice(0, nl).trim();
        if (firstLine && !firstLine.includes("```")) lang = firstLine;
        rest = rest.slice(nl + 1);
      }
      const closeIdx = rest.indexOf("```");
      let code;
      if (closeIdx === -1) { code = rest; rest = ""; }
      else { code = rest.slice(0, closeIdx); rest = rest.slice(closeIdx + 3).replace(/^\n/, ""); }
      parts.push({ kind: "code", lang, code });
    }
  }
  let html = "";
  for (const p of parts) {
    if (p.kind === "code") {
      const lang = p.lang || "";
      const displayLang = lang || "code";
      html += `<div class="code-block-wrapper">` +
        `<div class="code-block-header">` +
          `<span class="code-block-lang">${escapeHtml(displayLang)}</span>` +
          `<button class="btn-copy-code" type="button" aria-label="复制代码" title="复制代码">` +
            `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
            `<span>复制</span>` +
          `</button>` +
        `</div>` +
        `<pre><code data-lang="${escapeHtml(lang)}">${escapeHtml(p.code)}</code></pre>` +
      `</div>`;
    } else {
      html += renderInlineMd(p.text);
    }
  }
  return html;
}

function renderInlineMd(text) {
  // tables, then markdown-ish transforms. Escape first.
  // Split out inline code first using placeholders to protect them.
  const codeChunks = [];
  let t = text.replace(/`([^`\n]+)`/g, (m) => {
    const i = codeChunks.length;
    codeChunks.push(m);
    return `\u0000CODE${i}\u0000`;
  });

  // Tables: a block of consecutive lines delimited by blank lines,
  // where the second line is like |---|---|.
  const lines = t.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[i + 1]) && lines[i+1].includes("-")) {
      // collect table block
      const header = lines[i];
      const tblLines = [header, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|")) { tblLines.push(lines[j]); j++; }
      out.push({ kind: "table", lines: tblLines });
      i = j;
      continue;
    }
    out.push({ kind: "line", text: lines[i] });
    i++;
  }
  let outHtml = "";
  let para = [];
  let linkListOpen = null;
  let linkListOrdered = null;

  function flushList() {
    if (linkListOpen) {
      outHtml += linkListOpen === "ol" ? "</ol>" : "</ul>";
      linkListOpen = null;
      linkListOrdered = null;
    }
  }

  function flushPara() {
    if (para.length === 0) return;
    const block = para.join("\n").trim();
    para = [];
    outHtml += "<p>" + mdInlineBlock(block).replace(/\n/g, "<br>") + "</p>";
  }
  for (const seg of out) {
    if (seg.kind === "table") {
      flushPara();
      flushList();
      outHtml += mdTable(seg.lines);
    } else if (seg.kind === "line") {
      // horizontal rule
      if (/^\s*([-*_])\s*\1\s*\1[\s\-_*]*$/.test(seg.text)) {
        flushPara();
        flushList();
        outHtml += "<hr>";
      } else if (/^(#{1,6})\s+(.*)$/.test(seg.text)) {
        // headings
        const m = seg.text.match(/^(#{1,6})\s+(.*)$/);
        flushPara();
        flushList();
        const level = m[1].length;
        outHtml += `<h${level}>${mdInlineBlock(m[2])}</h${level}>`;
      } else if (/^\s*$/.test(seg.text)) {
        flushPara();
        flushList();
      } else if (/^>\s?/.test(seg.text)) {
        // blockquote line — group simple consecutive ones
        flushPara();
        flushList();
        outHtml += `<blockquote>${mdInlineBlock(seg.text.replace(/^>\s?/, ""))}</blockquote>`;
      } else if (/^\s*[-*+]\s+/.test(seg.text) || /^\s*\d+\.\s+/.test(seg.text)) {
        // list item — group consecutive into ul/ol
        // simple inline handling: wrap each list item line.
        const isOrdered = /^\s*\d+\.\s+/.test(seg.text);
        if (!linkListOpen || linkListOrdered !== isOrdered) {
          flushPara();
          flushList();
          linkListOpen = isOrdered ? "ol" : "ul";
          linkListOrdered = isOrdered;
          outHtml += "<" + linkListOpen + ">";
        }
        let itemText = seg.text.replace(/^\s*([-*+]|\d+\.)\s+/, "");
        let taskPrefix = "";
        if (/^\[ \]\s+/.test(itemText)) {
          taskPrefix = '<input type="checkbox" disabled class="task-list-item-checkbox"> ';
          itemText = itemText.replace(/^\[ \]\s+/, "");
        } else if (/^\[[xX]\]\s+/.test(itemText)) {
          taskPrefix = '<input type="checkbox" checked disabled class="task-list-item-checkbox"> ';
          itemText = itemText.replace(/^\[[xX]\]\s+/, "");
        }
        outHtml += `<li>${taskPrefix}${mdInlineBlock(itemText)}</li>`;
      } else {
        flushList();
        para.push(seg.text);
      }
    }
  }
  flushList();
  flushPara();
  // restore inline code
  outHtml = outHtml.replace(/\u0000CODE(\d+)\u0000/g, (_, n) => {
    const chunk = codeChunks[+n];
    return chunk ? `<code>${escapeHtml(chunk.slice(1, -1))}</code>` : "";
  });
  return outHtml;
}

function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    return trimmed.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  return "#";
}

// helper state bag attached to the function during line scan
function mdInlineBlock(text) {
  let s = escapeHtml(text);
  // bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // strikethrough
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  // italic (asterisk)
  s = s.replace(/(^|[^*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?!\*)/g, "$1<em>$2</em>");
  // italic (underscore): only match boundary/space so identifier_names are preserved
  s = s.replace(/(^|[\s(\[<,;:])_([^_\s](?:[^_]*?[^_\s])?)_(?=[\s)\]>,;:!?.]|$)/g, "$1<em>$2</em>");
  // links [txt](url) - strictly sanitize URL
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (match, txt, url) => {
    const safeUrl = sanitizeUrl(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${txt}</a>`;
  });
  return s;
}

function mdTable(lines) {
  const parseRow = (l) => l.split("|").map(c => c.trim()).filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === ""));
  const header = parseRow(lines[0]);
  const body = lines.slice(2).filter(l => l.trim()).map(parseRow);
  let h = '<table><thead><tr>';
  header.forEach((c) => h += `<th>${mdInlineBlock(c)}</th>`);
  h += '</tr></thead><tbody>';
  body.forEach((r) => {
    h += '<tr>';
    r.forEach((c) => h += `<td>${mdInlineBlock(c)}</td>`);
    h += '</tr>';
  });
  h += '</tbody></table>';
  return h;
}

// ---- DOM helpers ----
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const SVG_TAGS = new Set(["svg","rect","path","circle","line","polyline","polygon","ellipse","g","defs","use","text","tspan","linearGradient","radialGradient","stop","clipPath","mask","pattern","filter","feGaussianBlur","feOffset","feMerge","feMergeNode","animate","animateTransform","animateMotion"]);
  const n = SVG_TAGS.has(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
};

// ---- Message Time Formatter ----
function formatMessageTime(ts) {
  if (!ts) return "";
  const d = (typeof ts === "number" || typeof ts === "string") ? new Date(ts) : ts;
  if (!d || isNaN(d.getTime())) return "";

  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() &&
                  d.getMonth() === now.getMonth() &&
                  d.getDate() === now.getDate();

  const timeStr = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (isToday) {
    return timeStr;
  }
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) {
    const month = d.getMonth() + 1;
    const date = d.getDate();
    return `${month}月${date}日 ${timeStr}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date} ${timeStr}`;
}

// ---- Duration Formatter ----
function formatDuration(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return "";
  if (ms < 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

let liveTimerInterval = null;
function startStreamingTimer() {
  if (liveTimerInterval) return;
  liveTimerInterval = setInterval(() => {
    const now = Date.now();
    if (state.turnStartedAt && state.streamingMsgDurationEl) {
      state.streamingMsgDurationEl.textContent = formatDuration(now - state.turnStartedAt);
    }
    const liveThinking = document.querySelectorAll(".thinking-duration.live");
    liveThinking.forEach((el) => {
      if (el._startedAt) {
        el.textContent = formatDuration(now - el._startedAt);
        el.style.display = "";
      }
    });
    const liveTools = document.querySelectorAll(".tool-duration.live");
    liveTools.forEach((el) => {
      if (el._startedAt) {
        el.textContent = formatDuration(now - el._startedAt);
        el.style.display = "";
      }
    });
  }, 100);
}

function stopStreamingTimer() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }
}

function sameSession(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.replace(/^[.~]\//, "") === b.replace(/^[.~]\//, "");
}

// ---- Sidebar / sessions ----
async function refreshSessions() {
  const cwd = state.cwd || "";
  try {
    const res = await authFetch(`${API}/api/sessions?cwd=${encodeURIComponent(cwd)}`);
    const data = await res.json();
    renderSidebar(data.sessions || []);
  } catch (err) {
    console.warn("refreshSessions error:", err);
    renderSidebar([]);
  }
}

function renderSidebar(sessions) {
  const list = $("#sessionList");
  if (!list) return;
  list.innerHTML = "";

  const hasCurrentInSessions = Boolean(state.currentSessionFile && sessions.some(s => sameSession(s.file, state.currentSessionFile)));

  // If current session is a new/draft session not yet in the session list from REST API:
  if (!hasCurrentInSessions && (!state.currentSessionFile || $("#emptyState")?.style.display !== "none" || state.streaming)) {
    const draftTitle = $("#topSessionName")?.textContent || "新对话";
    const isRunning = Boolean(state.streaming);
    const runningBadge = isRunning ? el("span", { class: "session-running-badge", title: "任务正在后台生成中…" }, [
      el("span", { class: "spinner-dot" }),
      el("span", { text: "运行中" }),
    ]) : null;

    const titleEl = el("div", { class: "session-item-name" }, [
      el("span", { text: draftTitle }),
      ...(runningBadge ? [runningBadge] : []),
    ]);

    const draftItem = el("div", {
      class: "session-item active draft-session",
      dataset: { file: state.currentSessionFile || "" },
      title: state.currentSessionFile || "新对话",
      onclick: () => {
        if (state.currentSessionFile) loadSession(state.currentSessionFile);
      },
    }, [
      el("div", { class: "title" }, [
        titleEl,
        el("div", { class: "meta", text: `刚刚 · ${state.streaming ? 1 : 0} 条` }),
      ]),
    ]);
    list.appendChild(draftItem);
  }

  if (sessions.length === 0 && list.children.length === 0) {
    list.appendChild(el("div", { class: "sidebar-empty", text: "没有会话记录" }));
    return;
  }

  sessions.forEach((s) => {
    if (sameSession(s.file, state.currentSessionFile) && !hasCurrentInSessions) return;
    const title = s.sessionName || s.firstUser || "新对话";
    const when = s.timestamp ? new Date(s.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    
    const btnDelete = el("button", {
      class: "btn-delete-session",
      title: "删除会话",
      html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
      onclick: (e) => {
        e.stopPropagation();
        deleteSession(s.file, title);
      },
    });

    const isRunning = Boolean(s.isStreaming || (sameSession(s.file, state.currentSessionFile) && state.streaming));
    const runningBadge = isRunning ? el("span", { class: "session-running-badge", title: "任务正在后台生成中…" }, [
      el("span", { class: "spinner-dot" }),
      el("span", { text: "运行中" }),
    ]) : null;

    const titleEl = el("div", { class: "session-item-name" }, [
      el("span", { text: title }),
      ...(runningBadge ? [runningBadge] : []),
    ]);

    const item = el("div", {
      class: "session-item" + (sameSession(s.file, state.currentSessionFile) ? " active" : ""),
      dataset: { file: s.file },
      title: s.file,                       // hover tooltip = raw jsonl path
      onclick: () => loadSession(s.file),
    }, [
      el("div", { class: "title" }, [
        titleEl,
        el("div", { class: "meta", text: `${when} · ${s.messageCount || 0} 条` }),
      ]),
      btnDelete,
    ]);
    list.appendChild(item);
  });
  filterSessions();
}

function filterSessions(query) {
  const q = (query !== undefined ? query : ($("#sidebarSearch")?.value || "")).toLowerCase().trim();
  const list = $("#sessionList");
  if (!list) return;
  const items = list.querySelectorAll(".session-item");
  let visibleCount = 0;
  items.forEach((it) => {
    const titleEl = it.querySelector(".session-item-name") || it.querySelector(".title");
    const text = titleEl ? titleEl.textContent.toLowerCase() : it.textContent.toLowerCase();
    const match = !q || text.includes(q);
    it.style.display = match ? "" : "none";
    if (match) visibleCount++;
  });
  let emptyTip = list.querySelector(".sidebar-search-empty");
  if (items.length > 0 && visibleCount === 0 && q) {
    if (!emptyTip) {
      emptyTip = el("div", { class: "sidebar-search-empty", text: "未找到匹配的会话" });
      list.appendChild(emptyTip);
    }
  } else if (emptyTip) {
    emptyTip.remove();
  }
}

function startNewSession() {
  const wasStreaming = state.streaming;
  clearChat();
  showEmptyState(true);
  state.currentSessionFile = null;
  state.streaming = false;
  state.aborting = false;
  state.streamingItems = [];
  state.streamingMsg = null;
  state.activeToolCalls.clear();
  setComposerAborting(false);
  try {
    window.history.replaceState({}, "", window.location.pathname);
  } catch {}
  $("#topSessionName").textContent = "新对话";
  if (wasStreaming) {
    showToast("前一个会话已转入后台继续运行");
  }
  // Mobile: close sidebar on new session
  if (window.innerWidth <= 768) closeSidebar();

  connectWs({ explicitNewSession: true }); // no session -> pi creates a new one
  // Instantly render optimistic new session at the top of left sidebar
  renderSidebar([]);
  refreshSessions();
}

async function deleteSession(file, title) {
  if (!confirm(`确定要删除此会话记录吗？\n「${title || "新对话"}」\n删除后不可恢复。`)) {
    return;
  }
  try {
    const res = await authFetch(`${API}/api/session?file=${encodeURIComponent(file)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`删除失败: ${data.error || "未知错误"}`);
      return;
    }
    showToast("会话已删除");
    if (state.currentSessionFile === file) {
      startNewSession(false);
    } else {
      await refreshSessions();
    }
  } catch (err) {
    showToast(`删除失败: ${err.message || "网络错误"}`);
  }
}

async function toggleSidebar() {
  const app = $(".app");
  const isOpen = app.classList.toggle("sidebar-open");
  if (window.innerWidth > 768) {
    localStorage.setItem("sidebarCollapsed", !isOpen);
  }
}

function closeSidebar() {
  $(".app").classList.remove("sidebar-open");
}

function initMobileToolbarFab() {
  const chat = $("#chat");
  const fab = $("#mobileToolbarFab");
  if (!chat || !fab) return;

  const onScroll = () => {
    if (chat.scrollTop > 250) {
      fab.classList.add("visible");
    } else {
      fab.classList.remove("visible");
    }
  };

  chat.addEventListener("scroll", onScroll);
  fab.addEventListener("click", () => {
    chat.scrollTo({ top: 0, behavior: "smooth" });
    fab.classList.remove("visible");
  });
}

async function syncSessionHistory(file, force = false) {
  if (!file) return;
  try {
    const res = await authFetch(`${API}/api/session?file=${encodeURIComponent(file)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || data.error) return;

    if (data.header?.cwd && data.header.cwd !== state.cwd) {
      state.cwd = data.header.cwd;
      localStorage.setItem("pi_cwd", state.cwd);
      updateCwdDisplay();
    }

    if (data.model) {
      state.currentModel = data.model;
      renderModelPill();
    }

    const topName = data.sessionName || (data.header?.id ? baseName(file) : "新对话");
    $("#topSessionName").textContent = topName;

    // Only overwrite chat if not actively backfilling
    if (!state.isBackfilling && (force || !state.streaming)) {
      clearChat();
      const msgs = reconstructFromEntries(data.entries || []);
      showEmptyState(msgs.length === 0);
      for (const m of msgs) {
        appendMessageNode(m.role, m);
      }
      scrollBottom();
      refreshSessions();
    }
  } catch (e) {
    console.warn("syncSessionHistory error:", e);
  }
}

async function loadSession(file) {
  if (sameSession(file, state.currentSessionFile)) return;
  const wasStreaming = state.streaming;
  state.currentSessionFile = file;
  state.streaming = false;
  state.aborting = false;
  state.streamingItems = [];
  state.streamingMsg = null;
  state.activeToolCalls.clear();
  setComposerAborting(false);
  try {
    const newUrl = window.location.pathname + "?session=" + encodeURIComponent(file);
    window.history.replaceState({ session: file }, "", newUrl);
  } catch {}
  // Mobile: close sidebar on selection
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
  await syncSessionHistory(file, true);
  // Reconnect websocket pointed at this session so new prompts continue history.
  connectWs({ session: file });
  if (wasStreaming) {
    showToast("前一个会话已转入后台继续运行");
  }
}

function parseEntryTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === "number") return ts;
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? null : parsed;
}

function reconstructFromEntries(entries) {
  // Map toolResults by toolCallId so we can attach them to their toolCall in the assistant message
  const toolResults = new Map();
  for (const e of entries) {
    if (e.type === "message" && e.message?.role === "toolResult") {
      const m = e.message;
      if (m.toolCallId) {
        toolResults.set(m.toolCallId, {
          ...m,
          entryTs: parseEntryTimestamp(m.timestamp || e.timestamp)
        });
      }
    }
  }

  const out = [];
  let lastUserTs = null;
  for (const e of entries) {
    if (e.type !== "message") continue;
    const m = e.message;
    if (!m || m.role === "bashExecution") continue;
    const msgTs = parseEntryTimestamp(m.timestamp || e.timestamp);
    if (m.role === "user") {
      lastUserTs = msgTs;
      // Extract optional images from user message content array
      let images = [];
      if (Array.isArray(m.content)) {
        images = m.content
          .filter(c => c && (c.type === "image" || c.mimeType))
          .map(c => ({
            data: c.data,
            mimeType: c.mimeType || "image/png",
            url: c.data ? `data:${c.mimeType || "image/png"};base64,${c.data}` : (c.url || "")
          }));
      }
      out.push({ role: "user", text: extractContentText(m.content), images, ts: msgTs });
    } else if (m.role === "assistant") {
      let turnDurationMs = null;
      if (lastUserTs && msgTs && msgTs >= lastUserTs) {
        const diff = msgTs - lastUserTs;
        if (diff > 0 && diff < 15 * 60 * 1000) {
          turnDurationMs = diff;
        }
      }
      const rawContent = Array.isArray(m.content) ? m.content : (m.content ? [{ type: "text", text: String(m.content) }] : []);
      const content = rawContent.map(part => {
        if (part && part.type === "toolCall") {
          const res = toolResults.get(part.id);
          let durationMs = null;
          if (res) {
            const startTs = parseEntryTimestamp(part.timestamp || m.timestamp || e.timestamp);
            const endTs = res.entryTs || parseEntryTimestamp(res.timestamp);
            if (startTs && endTs && endTs >= startTs) {
              durationMs = endTs - startTs;
            }
          }
          return { ...part, result: res || null, durationMs };
        }
        return part;
      });
      if (m.stopReason === "error") {
        let errMsg = m.errorMessage || "生成失败（模型返回错误）";
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        content.push({ type: "text", text: `⚠️ **生成失败**: ${errMsg}` });
      }
      out.push({ role: "assistant", content, ts: msgTs, turnDurationMs, usage: m.usage });
    }
    // toolResult entries are attached directly to assistant toolCall parts, so they don't produce standalone messages
  }
  return out;
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(c => c && (c.type === "text" || typeof c === "string"))
    .map(c => typeof c === "string" ? c : (c.text || ""))
    .filter(Boolean)
    .join("\n\n");
}

function appendSystemNotice(text) {
  if (!text) return;
  const chatInner = $("#chat-inner");
  if (!chatInner) return;
  const node = el("div", { class: "system-notice-divider" }, [
    el("span", { class: "system-notice-text", text })
  ]);
  chatInner.appendChild(node);
  scrollBottom();
}

// ---- Chat rendering ----
function clearChat() {
  const chatInner = $("#chat-inner");
  chatInner.innerHTML = "";
  state.streamingMsg = null;
  state.streamingItems = [];
  state.thinkingOpen = true;
  state.thinkingUserToggled = false;
  state.activeToolCalls.clear();
}

function showEmptyState(show) {
  document.querySelector("#emptyState").style.display = show ? "flex" : "none";
}

function openLightbox(src) {
  const box = $("#imageLightbox");
  const img = $("#lightboxImg");
  if (!box || !img) return;
  img.src = src;
  box.style.display = "flex";
}

function closeLightbox() {
  const box = $("#imageLightbox");
  if (box) box.style.display = "none";
}

function removeAttachedImage(index) {
  if (index >= 0 && index < state.attachedImages.length) {
    state.attachedImages.splice(index, 1);
    renderImagePreviews();
  }
}

function renderImagePreviews() {
  const bar = $("#imagePreviewBar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!state.attachedImages || state.attachedImages.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  state.attachedImages.forEach((img, idx) => {
    const item = el("div", {
      class: "image-preview-item",
      title: "点击查看大图",
      onclick: () => openLightbox(img.url)
    }, [
      el("img", { src: img.url, alt: "预览" }),
      el("button", {
        class: "image-preview-remove",
        type: "button",
        title: "移除此图片",
        onclick: (e) => {
          e.stopPropagation();
          removeAttachedImage(idx);
        }
      }, ["×"])
    ]);
    bar.appendChild(item);
  });
}

function detectImageMimeType(file) {
  if (file.type && file.type.startsWith("image/")) return file.type;
  const ext = file.name ? file.name.split(".").pop().toLowerCase() : "";
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif"
  };
  return map[ext] || "image/png";
}

async function processImageFile(file) {
  const mimeType = detectImageMimeType(file);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (typeof dataUrl !== "string") return null;

  // For SVG or GIF (which might be animated), or small images, keep original
  if (mimeType.includes("svg") || mimeType.includes("gif") || (file.size && file.size < 800 * 1024)) {
    const commaIdx = dataUrl.indexOf(",");
    const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return { data: base64, mimeType, url: dataUrl };
  }

  // Optimize large phone camera photos / oversized images via canvas downscale
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    const maxDim = 2048;
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.drawImage(img, 0, 0, width, height);

    const targetMime = (mimeType === "image/png" && file.size < 2 * 1024 * 1024) ? "image/png" : "image/jpeg";
    const quality = 0.88;
    const optimizedUrl = canvas.toDataURL(targetMime, quality);
    const commaIdx = optimizedUrl.indexOf(",");
    const base64 = commaIdx !== -1 ? optimizedUrl.slice(commaIdx + 1) : optimizedUrl;

    return {
      data: base64,
      mimeType: targetMime,
      url: optimizedUrl
    };
  } catch {
    // Fallback to original base64 if canvas processing is unsupported
    const commaIdx = dataUrl.indexOf(",");
    const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return { data: base64, mimeType, url: dataUrl };
  }
}

function getLanguageFromFilename(filename) {
  if (!filename) return "";
  const ext = filename.split(".").pop().toLowerCase();
  const langMap = {
    js: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "tsx", jsx: "jsx",
    py: "python", pyw: "python",
    rb: "ruby", rs: "rust", go: "go", java: "java",
    c: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", h: "c", hpp: "cpp",
    sh: "bash", bash: "bash", zsh: "bash",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", markdown: "markdown",
    html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    sql: "sql", xml: "xml", svg: "xml",
    log: "log", env: "ini", ini: "ini", conf: "ini",
    diff: "diff", patch: "diff", dockerfile: "dockerfile", makefile: "makefile"
  };
  return langMap[ext] || "";
}

function isTextFile(file) {
  if (file.type && (file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml") || file.type.includes("javascript") || file.type.includes("yaml"))) {
    return true;
  }
  const name = file.name ? file.name.toLowerCase() : "";
  return /\.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|py|pyw|rb|php|java|c|cpp|cc|cxx|h|hpp|rs|go|sh|bash|zsh|sql|html|htm|css|scss|sass|less|vue|svelte|yaml|yml|toml|ini|env|xml|log|csv|tsv|diff|patch|dockerfile|makefile)$/i.test(name);
}

async function handleIncomingFiles(files) {
  if (!files || files.length === 0) return;
  const list = Array.from(files);

  let imageCount = 0;
  let textCount = 0;

  for (const file of list) {
    const isImg = (file.type && file.type.startsWith("image/")) ||
      (file.name && /\.(png|jpe?g|webp|gif|bmp|svg|ico|avif|heic|heif)$/i.test(file.name));

    if (isImg) {
      try {
        const imgObj = await processImageFile(file);
        if (imgObj) {
          state.attachedImages.push(imgObj);
          renderImagePreviews();
          imageCount++;
        }
      } catch (err) {
        console.error("Failed to process image file:", err);
      }
    } else if (isTextFile(file)) {
      if (file.size > 1024 * 1024) {
        showToast(`文件 ${file.name} 较大，建议放入工作目录供 pi 访问`);
        continue;
      }
      try {
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        if (typeof content === "string") {
          const lang = getLanguageFromFilename(file.name);
          const composer = $("#composer");
          if (composer) {
            const block = `[附件: ${file.name}]\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
            if (composer.value.trim()) {
              composer.value = composer.value.trimEnd() + "\n\n" + block;
            } else {
              composer.value = block;
            }
            autoResize();
            composer.focus();
            textCount++;
          }
        }
      } catch (err) {
        console.error("Failed to read text file:", err);
      }
    } else {
      showToast(`暂不支持直接解析该附件格式 (${file.name || "未知类型"})`);
    }
  }

  if (imageCount > 0) {
    showToast(`已添加 ${imageCount} 张图片附件`);
  }
  if (textCount > 0) {
    showToast(`已导入 ${textCount} 个文本文件`);
  }
}

const handleImageFiles = handleIncomingFiles;

function exportCurrentSession() {
  const chatInner = $("#chat-inner");
  if (!chatInner || chatInner.children.length === 0) {
    showToast("当前会话没有内容可导出");
    return;
  }
  const sessionTitle = $("#topSessionName")?.textContent || "pi-chat-export";
  let md = `# ${sessionTitle}\n\n`;
  md += `> 导出时间: ${new Date().toLocaleString()}\n`;
  if (state.currentModel?.id) {
    md += `> 模型: ${state.currentModel.provider ? state.currentModel.provider + " / " : ""}${state.currentModel.name || state.currentModel.id}\n`;
  }
  if (state.cwd) {
    md += `> 工作目录: \`${state.cwd}\`\n`;
  }
  md += `\n---\n\n`;

  const msgs = chatInner.querySelectorAll(".msg");
  msgs.forEach(msg => {
    const time = msg.querySelector(".msg-time")?.innerText || "";
    const timeInfo = time ? ` (${time})` : "";
    if (msg.classList.contains("user")) {
      const isSteer = !!msg.querySelector(".steer-badge");
      const bubble = msg.querySelector(".bubble");
      const text = bubble ? bubble.innerText.replace("🧭 指导指令", "").trim() : "";
      md += `### 👤 user${timeInfo}${isSteer ? " (🧭 指导指令)" : ""}\n\n${text}\n\n`;
    } else if (msg.classList.contains("assistant")) {
      md += `### 🤖 pi${timeInfo}\n\n`;
      const thinking = msg.querySelector(".thinking-body");
      if (thinking && thinking.innerText.trim()) {
        md += `<details><summary>💭 思考过程</summary>\n\n${thinking.innerText.trim()}\n\n</details>\n\n`;
      }
      const tools = msg.querySelectorAll(".tool-block");
      tools.forEach(tool => {
        const name = tool.querySelector(".name")?.innerText || "tool";
        const args = tool.querySelector(".args")?.innerText || "";
        const body = tool.querySelector(".tool-body")?.innerText || "";
        md += `\`\`\`bash\n# Tool: ${name} ${args}\n${body.trim()}\n\`\`\`\n\n`;
      });
      const paragraphs = msg.querySelectorAll(".content > div:not(.thinking-block):not(.tool-block)");
      paragraphs.forEach(p => {
        md += `${p.innerText.trim()}\n\n`;
      });
    }
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = sessionTitle.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 40);
  a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("对话已导出为 Markdown 文件");
}

function appendMessageNode(role, m) {
  if (role === "user") {
    const isSteer = m.isSteer || false;
    const ts = m.ts || m.timestamp || Date.now();
    const timeStr = formatMessageTime(ts);
    const fullTimeStr = (ts && !isNaN(new Date(ts).getTime())) ? new Date(ts).toLocaleString("zh-CN") : "";

    const steerBadge = isSteer ? el("span", { class: "steer-badge", text: "🧭 指导指令" }) : null;
    const bubbleChildren = [steerBadge];
    if (m.text) {
      bubbleChildren.push(document.createTextNode(m.text));
    }
    if (m.images && m.images.length > 0) {
      const imgsContainer = el("div", { class: "msg-images" });
      m.images.forEach(img => {
        const src = img.url || (img.data ? `data:${img.mimeType || "image/png"};base64,${img.data}` : "");
        if (!src) return;
        const imgEl = el("img", {
          class: "msg-image-thumb",
          src,
          alt: "用户上传图片",
          title: "点击查看大图",
          onclick: () => openLightbox(src)
        });
        imgsContainer.appendChild(imgEl);
      });
      bubbleChildren.push(imgsContainer);
    }
    const bubble = el("div", { class: "bubble" + (isSteer ? " steer" : "") }, bubbleChildren);

    const roleChildren = [
      el("span", { class: "role-name", text: "user" }),
    ];
    if (timeStr) {
      roleChildren.push(el("span", { class: "msg-time", text: timeStr, title: fullTimeStr }));
    }
    const roleTag = el("div", { class: "role-tag user-role-tag" }, roleChildren);

    const node = el("div", { class: "msg user" }, [roleTag, bubble]);
    $("#chat-inner").appendChild(node);
    scrollBottom();
    return node;
  }
  return renderAssistantBlock(m);
}

function renderAssistantBlock(m) {
  const ts = m.ts || m.timestamp || null;
  const timeStr = formatMessageTime(ts);
  const fullTimeStr = (ts && !isNaN(new Date(ts).getTime())) ? new Date(ts).toLocaleString("zh-CN") : "";

  // m.content is array of {type:text|thinking|toolCall}
  const fullText = extractContentText(m.content);
  const copyMsgBtn = el("button", {
    class: "btn-copy-msg",
    type: "button",
    title: "复制回答全文",
    onclick: async (e) => {
      e.stopPropagation();
      if (await copyToClipboard(fullText)) {
        showToast("已复制回答全文");
      }
    }
  }, [
    el("svg", { html: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' }),
    el("span", { text: "复制全文" })
  ]);

  const roleChildren = [
    el("span", { class: "role-name", text: "pi" }),
  ];
  if (timeStr) {
    roleChildren.push(el("span", { class: "msg-time", text: timeStr, title: fullTimeStr }));
  }
  if (m.turnDurationMs != null && m.turnDurationMs > 0) {
    roleChildren.push(el("span", { class: "msg-duration", text: `耗时 ${formatDuration(m.turnDurationMs)}`, title: "生成总耗时" }));
  }
  roleChildren.push(copyMsgBtn);

  const node = el("div", { class: "msg assistant" }, [
    el("div", { class: "role-tag" }, roleChildren),
    el("div", { class: "content" }),
  ]);
  const content = node.querySelector(".content");
  const parts = Array.isArray(m.content) ? m.content : (m.content ? [{ type: "text", text: String(m.content) }] : []);
  for (let i = 0; i < parts.length; i++) {
    const c = parts[i];
    if (c.type === "text") {
      const div = el("div", { html: renderMarkdown(c.text) });
      content.appendChild(div);
    } else if (c.type === "thinking") {
      content.appendChild(makeThinkingBlock(c.thinking, false, m.ts, c.durationMs));
    } else if (c.type === "toolCall") {
      content.appendChild(makeToolBlockFromCall(c));
    }
  }
  // If this message is followed (in same assistant message) by a toolResult,
  // we don't have it here — toolResults come as separate messages in pi.
  $("#chat-inner").appendChild(node);
  scrollBottom();
  return node;
}

function makeThinkingBlock(thinkingText, isActivelyThinking = false, ts = null, durationMs = null, startedAt = null) {
  const block = el("div", { class: "thinking-block" + (isActivelyThinking ? " active" : "") });

  const curDuration = durationMs != null
    ? durationMs
    : (isActivelyThinking && startedAt ? Math.max(0, Date.now() - startedAt) : null);

  const durationText = curDuration != null ? (isActivelyThinking ? formatDuration(curDuration) : `用时 ${formatDuration(curDuration)}`) : "";

  const durationEl = el("span", {
    class: "thinking-duration" + (isActivelyThinking ? " live" : ""),
    text: durationText,
    style: durationText ? "" : "display: none;"
  });
  if (isActivelyThinking && startedAt) {
    durationEl._startedAt = startedAt;
  }

  const head = el("div", {
    class: "thinking-head",
    onclick: () => {
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "block" : "none";
      state.thinkingOpen = isHidden;
      state.thinkingUserToggled = true;
    }
  }, [
    el("span", { class: "thinking-title", text: isActivelyThinking ? "💭 正在思考中…" : "💭 思考过程" }),
    durationEl,
    ts ? el("span", { class: "thinking-time", text: formatMessageTime(ts) }) : null,
    isActivelyThinking ? el("span", { class: "thinking-pulse" }) : null,
    el("span", { class: "thinking-toggle-hint", text: "(点击展开/收起)" }),
  ]);

  const body = el("div", { class: "thinking-body", html: escapeHtml(thinkingText) });

  if (state.thinkingUserToggled) {
    body.style.display = state.thinkingOpen ? "block" : "none";
  } else {
    body.style.display = isActivelyThinking ? "block" : "none";
  }

  block.appendChild(head);
  block.appendChild(body);
  block._durationEl = durationEl;
  return block;
}

function getToolCommandToCopy(call) {
  if (!call) return "";
  const args = call.arguments;
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    if (args.command) return String(args.command);
    if (args.cmd) return String(args.cmd);
    if (args.path) return String(args.path);
    if (args.code) return String(args.code);
  }
  return summaryArgs(call.name, call.arguments);
}

function updateToolBlockCopyBtn(tc, call) {
  if (!tc || !tc.head) return;
  const cmd = getToolCommandToCopy(call);
  if (!cmd) return;
  let btn = tc.head.querySelector(".btn-copy-tool");
  if (!btn) {
    btn = el("button", {
      class: "btn-copy-tool",
      type: "button",
      title: "复制指令/参数",
      onclick: async (e) => {
        e.stopPropagation();
        const curCmd = tc.head._cmdToCopy || cmd;
        if (await copyToClipboard(curCmd)) {
          btn.classList.add("copied");
          const span = btn.querySelector("span");
          if (span) span.textContent = "已复制";
          setTimeout(() => {
            btn.classList.remove("copied");
            if (span) span.textContent = "复制";
          }, 1500);
        }
      }
    }, [
      el("svg", { html: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' }),
      el("span", { text: "复制" })
    ]);
    const stateEl = tc.head.querySelector(".state");
    tc.head.insertBefore(btn, stateEl);
  }
  tc.head._cmdToCopy = cmd;
}

function makeToolBlockFromCall(call, ts = null) {
  const block = el("div", { class: "tool-block" });
  const hasResult = Boolean(call.result);
  const isError = call.result ? Boolean(call.result.isError) : false;

  let resultText = "";
  if (hasResult) {
    resultText = extractContentText(call.result.content);
  }

  const stateText = hasResult ? (isError ? "错误" : "完成") : "执行中…";
  const stateClass = "state" + (hasResult && isError ? " error" : "") + (!hasResult ? " running" : "");

  const durationMs = call.durationMs != null
    ? call.durationMs
    : (call.startedAt && call.endedAt ? Math.max(0, call.endedAt - call.startedAt) : null);
  const durationText = durationMs != null
    ? `耗时 ${formatDuration(durationMs)}`
    : (!hasResult && call.startedAt ? formatDuration(Date.now() - call.startedAt) : "");

  const durationEl = el("span", {
    class: "tool-duration" + (!hasResult ? " live" : ""),
    text: durationText,
    style: durationText ? "" : "display: none;"
  });
  if (!hasResult && call.startedAt) {
    durationEl._startedAt = call.startedAt;
  }

  const cmdToCopy = getToolCommandToCopy(call);
  const copyBtn = cmdToCopy ? el("button", {
    class: "btn-copy-tool",
    type: "button",
    title: "复制指令/参数",
    onclick: async (e) => {
      e.stopPropagation();
      const curCmd = head._cmdToCopy || cmdToCopy;
      if (await copyToClipboard(curCmd)) {
        copyBtn.classList.add("copied");
        const span = copyBtn.querySelector("span");
        if (span) span.textContent = "已复制";
        setTimeout(() => {
          copyBtn.classList.remove("copied");
          if (span) span.textContent = "复制";
        }, 1500);
      }
    }
  }, [
    el("svg", { html: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' }),
    el("span", { text: "复制" })
  ]) : null;

  const head = el("div", { class: "tool-head" }, [
    el("span", { class: "ic", text: "⚙" }),
    el("span", { class: "name", text: call.name }),
    ts ? el("span", { class: "tool-time", text: formatMessageTime(ts) }) : null,
    el("span", { class: "args", text: summaryArgs(call.name, call.arguments) }),
    copyBtn,
    durationEl,
    el("span", { class: stateClass, text: stateText }),
  ]);
  head._cmdToCopy = cmdToCopy;

  const bodyText = hasResult ? (resultText || "(无输出)") : "执行中…";
  const body = el("div", { class: "tool-body", html: escapeHtml(bodyText) });
  body.style.display = "none";

  head.addEventListener("click", () => {
    body.style.display = body.style.display === "none" ? "block" : "none";
  });

  block.appendChild(head);
  block.appendChild(body);
  block._head = head;
  block._body = body;
  block._callId = call.id;
  block._durationEl = durationEl;

  if (!hasResult && call.id) {
    state.activeToolCalls.set(call.id, { block, body, head, durationEl, startedAt: call.startedAt || Date.now() });
  }

  return block;
}

function summaryArgs(name, args) {
  if (!args) return "";
  let obj = args;
  if (typeof args === "string") {
    try { obj = JSON.parse(args); } catch { return args; }
  }
  try {
    if (name === "bash" && obj.command) return obj.command;
    if (name === "read" && obj.path) return obj.path;
    if (name === "write" && obj.path) return obj.path;
    if (name === "edit" && obj.path) return obj.path;
    if (name === "ls" && obj.path) return obj.path;
    if (name === "grep") return obj.pattern || "";
    if (name === "find") return obj.pattern || obj.path || "";
    if (typeof obj === "object" && obj !== null) {
      const keys = Object.keys(obj);
      if (keys.length === 1 && typeof obj[keys[0]] === "string") return obj[keys[0]];
    }
    return "";
  } catch { return ""; }
}

function scrollBottom() {
  // Don't fight the user during a background-event replay (backfill).
  if (state.isBackfilling) return;
  const chat = $("#chat");
  chat.scrollTop = chat.scrollHeight;
}

function getStreamingFullText() {
  return state.streamingItems
    .filter(it => it.type === "text" && it.text)
    .map(it => it.text)
    .join("\n\n");
}

// ---- Streaming: handle live assistant message ----
function ensureStreamingMsg(ts = Date.now()) {
  if (state.streamingMsg) return state.streamingMsg;
  showEmptyState(false);
  state.turnStartedAt = ts || Date.now();
  startStreamingTimer();
  const timeStr = formatMessageTime(ts);
  const fullTimeStr = (ts && !isNaN(new Date(ts).getTime())) ? new Date(ts).toLocaleString("zh-CN") : "";

  const copyBtn = el("button", {
    class: "btn-copy-msg",
    type: "button",
    title: "复制回答全文",
    onclick: async (e) => {
      e.stopPropagation();
      const text = getStreamingFullText();
      if (await copyToClipboard(text)) {
        showToast("已复制回答全文");
      }
    }
  }, [
    el("svg", { html: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' }),
    el("span", { text: "复制全文" })
  ]);

  const durationEl = el("span", { class: "msg-duration live", text: "0.0s", title: "生成耗时" });

  const roleChildren = [
    el("span", { class: "role-name", text: "pi" }),
  ];
  if (timeStr) {
    roleChildren.push(el("span", { class: "msg-time", text: timeStr, title: fullTimeStr }));
  }
  roleChildren.push(durationEl);
  roleChildren.push(copyBtn);

  const node = el("div", { class: "msg assistant" }, [
    el("div", { class: "role-tag" }, roleChildren),
    el("div", { class: "content" }),
  ]);
  state.streamingMsg = node;
  state.streamingMsgDurationEl = durationEl;
  state.streamingItems = [];
  state.thinkingOpen = true;
  state.thinkingUserToggled = false;
  state.activeToolCalls.clear();
  $("#chat-inner").appendChild(node);
  scrollBottom();
  return node;
}

let isRefreshScheduled = false;
function refreshStreamingContentDebounced() {
  if (isRefreshScheduled) return;
  isRefreshScheduled = true;
  requestAnimationFrame(() => {
    isRefreshScheduled = false;
    refreshStreamingContent();
  });
}

function refreshStreamingContent() {
  const node = state.streamingMsg;
  if (!node) return;
  const content = node.querySelector(".content");
  content.innerHTML = "";

  if (state.streamingItems.length === 0) {
    if (state.streaming) {
      content.appendChild(el("div", { class: "thinking-placeholder" }, [
        el("span", { class: "thinking-spinner" }),
        el("span", { class: "thinking-label", text: "正在思考中…" })
      ]));
    }
    scrollBottom();
    return;
  }

  const lastIdx = state.streamingItems.length - 1;
  for (let i = 0; i < state.streamingItems.length; i++) {
    const item = state.streamingItems[i];
    const isLast = (i === lastIdx);
    if (item.type === "thinking") {
      const isActivelyThinking = state.streaming && isLast && item.isStreaming !== false;
      content.appendChild(makeThinkingBlock(item.text, isActivelyThinking, item.ts, item.durationMs, item.startedAt));
    } else if (item.type === "tool") {
      if (item.tc?.block) content.appendChild(item.tc.block);
    } else if (item.type === "text") {
      const showCursor = state.streaming && isLast;
      content.appendChild(el("div", { html: renderMarkdown(item.text) + (showCursor ? '<span class="typing-cursor"></span>' : "") }));
    }
  }
  scrollBottom();
}

function finalizeStreamingMsg() {
  state.streaming = false;
  stopStreamingTimer();
  if (state.streamingMsg) {
    for (const item of state.streamingItems) {
      if (item.type === "thinking" && item.isStreaming) {
        item.isStreaming = false;
        item.endedAt = Date.now();
        item.durationMs = Math.max(0, item.endedAt - (item.startedAt || item.ts || Date.now()));
      }
    }
    refreshStreamingContent();

    if (state.turnStartedAt) {
      const turnDuration = Math.max(0, Date.now() - state.turnStartedAt);
      if (state.streamingMsgDurationEl) {
        state.streamingMsgDurationEl.className = "msg-duration";
        state.streamingMsgDurationEl.textContent = `耗时 ${formatDuration(turnDuration)}`;
      }
    }

    const finalFullText = getStreamingFullText();
    const btn = state.streamingMsg.querySelector(".btn-copy-msg");
    if (btn) {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (await copyToClipboard(finalFullText)) {
          showToast("已复制回答全文");
        }
      };
    }
  }
  state.turnStartedAt = null;
  state.streamingMsgDurationEl = null;
  state.streamingMsg = null;
  state.streamingItems = [];
  state.thinkingOpen = true;
  state.thinkingUserToggled = false;
  state.activeToolCalls.clear();
}

// Each generation of WebSocket gets its own id; late stragglers from
// a previous-generation ws are silently dropped to keep state consistent.
let wsGen = 0;
let pingTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastPongTime = Date.now();
let isConnecting = false;
let wasDisconnected = false;

function setConnStatus(status, text) {
  // status: 'connected', 'reconnecting', 'disconnected'
  state.wsConnected = (status === "connected");
  const dot = $("#connDot");
  const label = $("#connLabel");
  const connStatus = $("#connStatus");

  if (dot) {
    if (status === "connected") {
      dot.style.color = "var(--accent)";
    } else if (status === "reconnecting") {
      dot.style.color = "var(--warning)";
    } else {
      dot.style.color = "var(--danger)";
    }
  }

  if (label) {
    if (text) {
      label.textContent = text;
    } else if (status === "connected") {
      label.textContent = "已连接";
    } else if (status === "reconnecting") {
      label.textContent = "正在重连…";
    } else {
      label.textContent = "已断开";
    }
  }

  if (connStatus) {
    connStatus.title = status === "connected" ? "WebSocket 已连接" : "连接已断开，点击尝试重连";
    connStatus.style.cursor = status === "connected" ? "default" : "pointer";
  }

  const btn = $("#sendBtn");
  if (btn && !state.streaming) {
    btn.disabled = (status !== "connected");
  }
}

function startPingInterval() {
  stopPingInterval();
  lastPongTime = Date.now();
  pingTimer = setInterval(() => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      if (Date.now() - lastPongTime > 45000) {
        console.warn("WebSocket 心跳超时，尝试断开并重连…");
        try { state.ws.close(); } catch {}
        return;
      }
      try {
        state.ws.send(JSON.stringify({ type: "ping" }));
      } catch {}
    }
  }, 15000);
}

function stopPingInterval() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect(delayMs) {
  if (reconnectTimer) {
    if (delayMs === 0) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    } else {
      return;
    }
  }

  if (delayMs === undefined) {
    reconnectAttempts++;
    const base = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 15000);
    const jitter = Math.random() * 500;
    delayMs = Math.round(base + jitter);
  }

  setConnStatus("reconnecting", reconnectAttempts > 0 ? `重连中 (${reconnectAttempts})` : "正在重连…");

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    performReconnect();
  }, delayMs);
}

function performReconnect() {
  if (isConnecting) return;
  connectWs({ isReconnect: true });
}

function connectWs(opts = {}) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (state.ws) {
    try {
      // Suppress onclose so the connection indicator doesn't flicker to red
      // while a new socket is opening.
      state.ws._suppressOnclose = true;
      state.ws.close();
    } catch {}
  }

  isConnecting = true;
  const myGen = ++wsGen;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const cwd = encodeURIComponent(state.cwd || "");

  // Preserve active session if not explicitly cleared or provided
  let targetSession = opts.session;
  if (opts.explicitNewSession) {
    targetSession = null;
  } else if (targetSession === undefined) {
    targetSession = state.currentSessionFile;
  }

  const sess = targetSession ? `&session=${encodeURIComponent(targetSession)}` : "";

  // When user clicks "new session", pre-flush any "stuck streaming" state
  // from the previous connection so the new connection starts clean.
  if (opts.explicitNewSession) {
    state.streaming = false;
    state.streamingItems = [];
    state.streamingMsg = null;
    state.activeToolCalls.clear();
  }

  const token = getAuthToken();
  const tokParam = token ? `&token=${encodeURIComponent(token)}` : "";
  const url = `${proto}://${location.host}/ws?cwd=${cwd}${sess}${tokParam}`;
  const ws = new WebSocket(url);
  state.ws = ws;
  ws._gen = myGen;

  ws.onopen = async () => {
    if (ws._gen !== wsGen) return;
    isConnecting = false;
    setConnStatus("connected");
    startPingInterval();

    const isReconnecting = wasDisconnected || reconnectAttempts > 0 || opts.isReconnect;
    if (isReconnecting) {
      showToast("网络连接已恢复");
      if (targetSession) {
        await syncSessionHistory(targetSession, true);
      }
    }
    wasDisconnected = false;
    reconnectAttempts = 0;

    sendWs({ type: "get_state" });
    sendWs({ type: "get_available_models" });
  };

  ws.onclose = () => {
    stopPingInterval();
    if (ws._gen !== wsGen) return;
    isConnecting = false;
    if (ws._suppressOnclose) return;

    wasDisconnected = true;
    setConnStatus("disconnected");
    scheduleReconnect();
  };

  ws.onerror = () => {
    stopPingInterval();
    if (ws._gen !== wsGen) return;
    isConnecting = false;
    wasDisconnected = true;
    setConnStatus("disconnected");
  };

  ws.onmessage = (ev) => {
    if (ws._gen !== wsGen) return;
    lastPongTime = Date.now();
    let obj;
    try { obj = JSON.parse(ev.data); } catch { return; }
    if (obj.type === "pong") return;

    if (obj.type === "error" && (obj.code === "unauthorized" || (obj.message && obj.message.toLowerCase().includes("unauthorized")))) {
      const entered = prompt("Pi Gateway 开启了访问鉴权，请输入访问 Token：");
      if (entered) {
        localStorage.setItem("pi_auth_token", entered.trim());
        connectWs({ explicitNewSession: false, isReconnect: true });
      }
      return;
    }
    handlePiMessage(obj);
  };
}

function sendWs(obj) {
  if (!state.ws || state.ws.readyState !== 1) return false;
  state.ws.send(JSON.stringify(obj));
  return true;
}

function handlePiMessage(obj) {
  // Automatically bind to the session file as soon as pi allocates it on disk
  const sessionFile = obj.data?.sessionFile || obj.sessionFile || obj.data?.sessionPath || obj.sessionPath;
  if (sessionFile && !sameSession(sessionFile, state.currentSessionFile)) {
    state.currentSessionFile = sessionFile;
    try {
      const newUrl = window.location.pathname + "?session=" + encodeURIComponent(sessionFile);
      window.history.replaceState({ session: sessionFile }, "", newUrl);
    } catch {}
    if ($("#topSessionName").textContent === "新对话") {
      $("#topSessionName").textContent = baseName(sessionFile);
    }
    refreshSessions();
  }

  // Backfill markers emitted by the server when it replays buffered events
  // that happened in the background while no browser was attached.
  if (obj.type === "backfill_start") {
    state.isBackfilling = true;
    state.streamingItems = [];
    state.streamingMsg = null;
    state.activeToolCalls.clear();
    return;
  }
  if (obj.type === "backfill_end") {
    state.isBackfilling = false;
    // After replay, sync the composer / streaming state to what the server thinks.
    if (obj.streaming) {
      state.streaming = true;
      setComposerAborting(true);
      ensureStreamingMsg();
      refreshStreamingContent();
      // If ring buffer overflowed while client was away, sync full session history in background
      if (obj.overflowed && state.currentSessionFile) {
        syncSessionHistory(state.currentSessionFile, false);
      }
    } else {
      finalizeStreamingMsg();
      state.streaming = false;
      state.aborting = false;
      setComposerAborting(false);
      if (state.currentSessionFile) {
        syncSessionHistory(state.currentSessionFile, true);
      }
    }
    // jump to the latest content once the replay is done
    requestAnimationFrame(scrollBottom);
    refreshSessions();
    return;
  }
  // Responses to commands we issued (get_state etc.) come back with success+data.
  if (obj.type === "response") {
    if (obj.command === "get_state" && obj.success) updateState(obj.data);
    else if (obj.command === "get_available_models" && obj.success) updateModels(obj.data.models || []);
    else if (obj.command === "set_model") {
      if (obj.success) {
        const prev = state.currentModel;
        if (obj.data) state.currentModel = obj.data;
        saveRecentModel(state.currentModel);
        renderModelPill();
        renderModelMenu();
        const modelLabel = state.currentModel?.name || state.currentModel?.id || "";
        showToast(`已切换模型: ${modelLabel}`);
        if (prev && (prev.id !== state.currentModel?.id || prev.provider !== state.currentModel?.provider)) {
          appendSystemNotice(`已切换模型至 ${state.currentModel?.provider ? state.currentModel.provider + " / " : ""}${modelLabel}`);
        }
        sendWs({ type: "get_state" });
      } else {
        showToast(`切换模型失败: ${obj.error || "未知错误"}`);
        renderModelPill();
      }
    }
    else if (obj.command === "set_thinking_level") {
      if (obj.success) {
        showToast(`已更新思考深度: ${formatThinkingLevel(state.thinkingLevel)}`);
      } else {
        showToast(`设置思考深度失败: ${obj.error || "未知错误"}`);
      }
    }
    else if (obj.command === "cycle_thinking_level" && obj.success) {
      const newLevel = obj.data?.level || obj.data?.thinkingLevel;
      if (newLevel) {
        state.thinkingLevel = newLevel;
        renderThinkingPill();
        updateEmptyStateModelInfo();
      }
    } else if (obj.command === "abort") {
      state.aborting = false;
      setComposerAborting(false);
    }
    else if (obj.command === "switch_session" && obj.success) {
      // ask pi for current state so we can get session id, name
      sendWs({ type: "get_state" });
      // List entries to render history. For "open" we already rendered from REST.
      // But for in-session edits later, entries may have arrived — call again.
      sendWs({ type: "get_entries" });
    } else if (obj.command === "get_entries" && obj.success) {
      handleEntries(obj.data.entries || [], obj.data.leafId);
    } else if (obj.command === "new_session" && obj.success) {
      state.currentSessionFile = null;
      clearChat();
      showEmptyState(true);
      sendWs({ type: "get_state" });
      refreshSessions();
    }
    return;
  }
  // Events from pi.
  switch (obj.type) {
    case "model_select":
      if (obj.model) {
        state.currentModel = obj.model;
        saveRecentModel(obj.model);
        renderModelPill();
        renderModelMenu();
        updateEmptyStateModelInfo();
      }
      break;
    case "remote_user_prompt":
      appendMessageNode("user", { text: obj.message, images: obj.images, isSteer: obj.isSteer, ts: obj.timestamp || Date.now() });
      break;
    case "agent_start":
      state.streaming = true;
      state.aborting = false;
      setComposerAborting(true);
      ensureStreamingMsg();
      refreshStreamingContent();
      refreshSessions();
      break;
    case "agent_end":
      finalizeStreamingMsg();
      break;
    case "agent_settled":
      finalizeStreamingMsg();
      state.streaming = false;
      state.aborting = false;
      setComposerAborting(false);
      sendWs({ type: "get_state" });
      refreshSessions(); // titles may have changed
      break;
    case "message_start": {
      // Only open an assistant streaming block when the message is actually
      // an assistant message. pi also emits message_start for the echoed
      // user message, and before this distinction we'd create an empty "pi"
      // bubble for every user turn — which showed up as a blank assistant
      // message. User bubbles are rendered locally in submitPrompt(), so
      // ignore user echoes here entirely.
      const m = obj.message;
      if (m && m.role !== "assistant") break;
      ensureStreamingMsg();
      break;
    }
    case "message_end": {
      // pi's message_end carries the final message object, which includes
      // stopReason. If the model errored (bad model, rate limit, network),
      // pi emits assistant messages with stopReason === "error" AND empty
      // content — which otherwise renders as a blank pi bubble. Surface
      // those failures explicitly so the user isn't left staring at
      // an empty reply.
      const m = obj.message;
      if (m && m.role === "assistant" && m.stopReason === "error") {
        let errMsg = m.errorMessage || "生成失败（模型返回错误）。可能是当前模型不可用，请从右上角切换一个模型后重试。";
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        state.streamingItems.push({ type: "text", text: `⚠️ **${errMsg}**` });
        refreshStreamingContent();
      }
      break;
    }
    case "message_update": {
      const ev = obj.assistantMessageEvent;
      if (!ev) break;
      if (ev.type === "text_delta") {
        // Finalize active thinking duration if transitioning to text
        const activeThinking = state.streamingItems.find(it => it.type === "thinking" && it.isStreaming);
        if (activeThinking) {
          activeThinking.isStreaming = false;
          activeThinking.endedAt = Date.now();
          activeThinking.durationMs = Math.max(0, activeThinking.endedAt - (activeThinking.startedAt || activeThinking.ts || Date.now()));
        }
        const last = state.streamingItems[state.streamingItems.length - 1];
        if (last && last.type === "text") {
          last.text += ev.delta;
        } else {
          state.streamingItems.push({ type: "text", text: ev.delta });
        }
        refreshStreamingContentDebounced();
      } else if (ev.type === "text_end") {
        // Authoritative final text for this content slot.
        const activeThinking = state.streamingItems.find(it => it.type === "thinking" && it.isStreaming);
        if (activeThinking) {
          activeThinking.isStreaming = false;
          activeThinking.endedAt = Date.now();
          activeThinking.durationMs = Math.max(0, activeThinking.endedAt - (activeThinking.startedAt || activeThinking.ts || Date.now()));
        }
        if (typeof ev.content === "string") {
          const last = state.streamingItems[state.streamingItems.length - 1];
          if (last && last.type === "text") {
            last.text = ev.content;
          } else if (ev.content) {
            state.streamingItems.push({ type: "text", text: ev.content });
          }
        }
        refreshStreamingContentDebounced();
      } else if (ev.type === "thinking_delta" || ev.type === "thinking_start" || ev.type === "thinking_end") {
        // For thinking we accumulate deltas; thinking_delta carries .delta
        if (ev.type === "thinking_delta" && ev.delta) {
          let last = state.streamingItems[state.streamingItems.length - 1];
          if (last && last.type === "thinking" && last.isStreaming !== false) {
            last.text += ev.delta;
            if (!last.startedAt) last.startedAt = Date.now();
          } else {
            last = { type: "thinking", text: ev.delta, ts: Date.now(), startedAt: Date.now(), isStreaming: true };
            state.streamingItems.push(last);
          }
          refreshStreamingContentDebounced();
        } else if (ev.type === "thinking_start") {
          state.streamingItems.push({ type: "thinking", text: "", ts: Date.now(), startedAt: Date.now(), isStreaming: true });
          refreshStreamingContentDebounced();
        } else if (ev.type === "thinking_end") {
          const last = state.streamingItems[state.streamingItems.length - 1];
          if (last && last.type === "thinking") {
            last.isStreaming = false;
            last.endedAt = Date.now();
            last.durationMs = Math.max(0, last.endedAt - (last.startedAt || last.ts || Date.now()));
          }
          refreshStreamingContentDebounced();
        }
      } else if (ev.type === "toolcall_start") {
        const activeThinking = state.streamingItems.find(it => it.type === "thinking" && it.isStreaming);
        if (activeThinking) {
          activeThinking.isStreaming = false;
          activeThinking.endedAt = Date.now();
          activeThinking.durationMs = Math.max(0, activeThinking.endedAt - (activeThinking.startedAt || activeThinking.ts || Date.now()));
        }
        ensureStreamingMsg();
        const call = ev.toolCall || { id: obj.toolCallId || ev.id, name: obj.toolName, arguments: obj.args };
        // args may be incomplete until toolcall_end; we fill what we have now
        // and patch the head display on toolcall_end.
        ensureToolBlock(call.id, call.name, call.arguments, Date.now());
      } else if (ev.type === "toolcall_delta") {
        // Streaming function-call argument JSON. We don't render it live
        // (JSON fragments are not useful UX), but make sure the tool block
        // exists so toolcall_end has somewhere to write into.
        const id = obj.toolCallId || ev.id;
        ensureToolBlock(id, obj.toolName || ev.toolCall?.name, obj.args, Date.now());
      } else if (ev.type === "toolcall_end") {
        // Authoritative final toolCall object (with full arguments). Patch
        // the block head so the displayed args are the final ones, not the
        // partial ones we got at toolcall_start.
        const call = ev.toolCall || { id: obj.toolCallId, name: obj.toolName, arguments: obj.args };
        const id = call.id || obj.toolCallId;
        const tc = state.activeToolCalls.get(id);
        if (tc) {
          const argsEl = tc.head.querySelector(".args");
          if (argsEl) argsEl.textContent = summaryArgs(call.name, call.arguments);
          updateToolBlockCopyBtn(tc, call);
        }
      }
      break;
    }
    case "tool_execution_start": {
      const activeThinking = state.streamingItems.find(it => it.type === "thinking" && it.isStreaming);
      if (activeThinking) {
        activeThinking.isStreaming = false;
        activeThinking.endedAt = Date.now();
        activeThinking.durationMs = Math.max(0, activeThinking.endedAt - (activeThinking.startedAt || activeThinking.ts || Date.now()));
      }
      ensureStreamingMsg();
      const tc = ensureToolBlock(obj.toolCallId, obj.toolName, obj.args, Date.now());
      if (tc) {
        tc.startedAt = Date.now();
        if (tc.durationEl) {
          tc.durationEl.className = "tool-duration live";
          tc.durationEl._startedAt = tc.startedAt;
          tc.durationEl.textContent = "0.0s";
          tc.durationEl.style.display = "";
        }
        const stateEl = tc.head.querySelector(".state");
        if (stateEl) {
          stateEl.className = "state running";
          stateEl.textContent = "执行中…";
        }
        updateToolBlockCopyBtn(tc, { name: obj.toolName, arguments: obj.args });
      }
      break;
    }
    case "tool_execution_update": {
      const tc = state.activeToolCalls.get(obj.toolCallId);
      if (tc) {
        const text = extractContentText(obj.partialResult?.content);
        tc.body.innerHTML = escapeHtml(text) || "(执行中…)";
      }
      break;
    }
    case "tool_execution_end": {
      const tc = state.activeToolCalls.get(obj.toolCallId);
      if (tc) {
        const text = extractContentText(obj.result?.content);
        tc.body.innerHTML = escapeHtml(text) || "(无输出)";
        tc.endedAt = Date.now();
        const dur = Math.max(0, tc.endedAt - (tc.startedAt || tc.endedAt));
        tc.durationMs = dur;
        if (tc.durationEl) {
          tc.durationEl.className = "tool-duration";
          tc.durationEl._startedAt = null;
          tc.durationEl.textContent = `耗时 ${formatDuration(dur)}`;
          tc.durationEl.style.display = "";
        }
        const stateEl = tc.head.querySelector(".state");
        if (stateEl) {
          stateEl.textContent = obj.isError ? "错误" : "完成";
          stateEl.className = "state" + (obj.isError ? " error" : "");
        }
      }
      break;
    }
    case "extension_ui_request":
      handleExtensionUiRequest(obj);
      break;
    case "error":
      finalizeStreamingMsg();
      state.streaming = false;
      state.aborting = false;
      setComposerAborting(false);
      showToast(`⚠️ ${obj.message || obj.code || "发生错误"}`);
      break;
    case "pi_exit":
      finalizeStreamingMsg();
      state.streaming = false;
      state.aborting = false;
      setComposerAborting(false);
      $("#connDot").style.color = "var(--danger)";
      break;
    default:
      // ignore unknown events
      break;
  }
}

function handleExtensionUiRequest(req) {
  const { id, method, title, message, options, placeholder, prefill, notifyType } = req;
  if (method === "notify") {
    showToast((notifyType === "warning" ? "⚠️ " : notifyType === "error" ? "❌ " : "ℹ️ ") + (message || ""));
    return;
  }
  if (method === "confirm") {
    const text = (title ? title + "\n" : "") + (message || "");
    const confirmed = window.confirm(text || "是否确认？");
    sendWs({ type: "extension_ui_response", id, confirmed });
    return;
  }
  if (method === "select") {
    const promptText = (title ? title + "\n" : "") + (options || []).map((o, idx) => `${idx + 1}. ${o}`).join("\n");
    const res = window.prompt(promptText, "1");
    if (res === null) {
      sendWs({ type: "extension_ui_response", id, cancelled: true });
    } else {
      const idx = parseInt(res.trim(), 10) - 1;
      const val = (options && options[idx]) ? options[idx] : res.trim();
      sendWs({ type: "extension_ui_response", id, value: val });
    }
    return;
  }
  if (method === "input") {
    const res = window.prompt(title || "请输入：", placeholder || "");
    if (res === null) {
      sendWs({ type: "extension_ui_response", id, cancelled: true });
    } else {
      sendWs({ type: "extension_ui_response", id, value: res });
    }
    return;
  }
  if (method === "editor") {
    const res = window.prompt((title || "编辑内容") + " (多行内容可用 \\n 分隔)：", prefill || "");
    if (res === null) {
      sendWs({ type: "extension_ui_response", id, cancelled: true });
    } else {
      sendWs({ type: "extension_ui_response", id, value: res });
    }
    return;
  }
}

function ensureToolBlock(toolCallId, name, args, ts = Date.now()) {
  if (state.activeToolCalls.has(toolCallId)) return state.activeToolCalls.get(toolCallId);
  const block = makeToolBlockFromCall({ id: toolCallId, name, arguments: args, startedAt: ts }, ts);
  const entry = state.activeToolCalls.get(toolCallId) || { block, body: block._body, head: block._head, durationEl: block._durationEl, startedAt: ts };
  state.activeToolCalls.set(toolCallId, entry);
  state.streamingItems.push({ type: "tool", id: toolCallId, tc: entry });
  refreshStreamingContentDebounced();
  return entry;
}

// We render incoming session entries (for live new messages we use streaming
// events instead). get_entries is used after switch_session to render the
// canonical view. But to keep this simple we render history via REST /api/session
// and treat live events as the source of truth during a session.
function handleEntries(entries, leafId) { /* no-op: history rendered via REST */ }

function updateState(d) {
  if (d?.sessionFile) state.currentSessionFile = d.sessionFile;
  if (d?.sessionId) state.sessionId = d.sessionId;
  if (d?.model) {
    state.currentModel = d.model;
    saveRecentModel(d.model);
    renderModelPill();
  }
  if (d?.thinkingLevel) {
    state.thinkingLevel = d.thinkingLevel;
    renderThinkingPill();
  }
  updateEmptyStateModelInfo();
  $("#topSessionName").textContent = d?.sessionName || (d?.sessionFile ? baseName(d.sessionFile) : "新对话");

  // Sync streaming state upon state updates (e.g. after reconnect)
  if (d && typeof d.isStreaming === "boolean") {
    if (d.isStreaming) {
      if (!state.streaming) {
        state.streaming = true;
        setComposerAborting(true);
        ensureStreamingMsg();
      }
    } else if (state.streaming && !state.isBackfilling) {
      finalizeStreamingMsg();
      state.streaming = false;
      state.aborting = false;
      setComposerAborting(false);
      refreshSessions();
    }
  }
}

function updateModels(models) {
  state.models = models;
  renderModelMenu();
  renderModelPill();
}

function formatThinkingLevel(lvl) {
  if (!lvl) return "Medium";
  return lvl.charAt(0).toUpperCase() + lvl.slice(1);
}

function isCurrentModelDefault() {
  if (!state.defaultModel || !state.currentModel) return false;
  const defId = state.defaultModel.id;
  const curId = state.currentModel.id;
  if (!defId || !curId) return false;
  if (defId !== curId) return false;
  if (state.defaultModel.provider && state.currentModel.provider) {
    return state.defaultModel.provider === state.currentModel.provider;
  }
  return true;
}

function renderModelPill() {
  const m = state.currentModel;
  const pill = $("#modelPill");
  const nameEl = $("#modelPillName");
  const badgeEl = $("#modelPillBadge");
  if (!pill) return;

  pill.disabled = state.streaming;

  if (!m) {
    if (nameEl) nameEl.textContent = "选择模型";
    if (badgeEl) badgeEl.style.display = "none";
    pill.title = "点击选择模型 (快捷键: Ctrl+M)";
    renderThinkingPill();
    updateEmptyStateModelInfo();
    return;
  }

  const provider = m.provider || "?";
  let name = m.name || m.id;
  if (state.models && state.models.length > 0) {
    const found = state.models.find(item => item.id === m.id && item.provider === m.provider) ||
                  state.models.find(item => item.id === m.id);
    if (found && found.name) {
      name = found.name;
    }
  }

  if (nameEl) nameEl.textContent = `${provider} / ${name}`;

  const isDefault = isCurrentModelDefault();
  if (badgeEl) {
    if (isDefault) {
      badgeEl.textContent = state.defaultModel?.source === "project" ? "★ 项目默认" : "★ 默认";
      badgeEl.style.display = "inline-block";
    } else {
      badgeEl.style.display = "none";
    }
  }

  if (state.streaming) {
    pill.title = "生成中暂不可切换模型";
  } else if (isDefault) {
    pill.title = `当前模型: ${provider} / ${name} (默认模型 · ${state.defaultModel?.source === 'project' ? '来自项目配置' : '来自全局配置'})`;
  } else {
    const defDesc = state.defaultModel?.id ? ` · 默认: ${state.defaultModel.provider || ''}/${state.defaultModel.id}` : "";
    pill.title = `当前模型: ${provider} / ${name} (${m.id}${defDesc})`;
  }

  renderThinkingPill();
  updateEmptyStateModelInfo();
}

function renderThinkingPill() {
  const pill = $("#thinkingPill");
  const labelEl = $("#thinkingPillLabel");
  if (!pill) return;

  const m = state.currentModel;
  let supportsThinking = false;
  if (m) {
    if (m.reasoning === true) supportsThinking = true;
    else if (state.models && state.models.length > 0) {
      const found = state.models.find(item => item.id === m.id && item.provider === m.provider) ||
                    state.models.find(item => item.id === m.id);
      if (found && found.reasoning === true) supportsThinking = true;
    }
  }

  if (!supportsThinking) {
    pill.style.display = "none";
    const menu = $("#thinkingMenu");
    if (menu) menu.classList.remove("open");
    return;
  }

  pill.style.display = "inline-flex";
  pill.disabled = state.streaming;
  if (labelEl) {
    labelEl.textContent = formatThinkingLevel(state.thinkingLevel);
  }
  pill.title = `深度思考: ${formatThinkingLevel(state.thinkingLevel)} (点击调整)`;
}

const THINKING_LEVELS = [
  { level: "off", label: "Off", desc: "关闭思考" },
  { level: "minimal", label: "Minimal", desc: "最小思考" },
  { level: "low", label: "Low", desc: "轻度思考" },
  { level: "medium", label: "Medium", desc: "中等思考 (推荐)" },
  { level: "high", label: "High", desc: "深度思考" },
  { level: "xhigh", label: "Extra High", desc: "超高思考" },
  { level: "max", label: "Max", desc: "最大思考深度" },
];

function renderThinkingMenu() {
  const menu = $("#thinkingMenu");
  if (!menu) return;
  menu.innerHTML = "";

  const titleRow = el("div", { class: "thinking-menu-title" }, [
    el("span", { text: "🧠 深度思考设置" }),
    el("span", { text: "Reasoning", style: "font-size: 10px; font-weight: normal;" })
  ]);
  menu.appendChild(titleRow);

  const curLevel = (state.thinkingLevel || "medium").toLowerCase();
  for (const item of THINKING_LEVELS) {
    const active = item.level === curLevel;
    const opt = el("div", {
      class: "thinking-opt" + (active ? " active" : ""),
      onclick: () => {
        state.thinkingLevel = item.level;
        sendWs({ type: "set_thinking_level", level: item.level });
        renderThinkingPill();
        updateEmptyStateModelInfo();
        showToast(`已设置思考级别: ${item.label}`);
        menu.classList.remove("open");
      }
    }, [
      el("span", { text: (active ? "✓ " : "") + item.label }),
      el("span", { class: "level-desc", text: item.desc })
    ]);
    menu.appendChild(opt);
  }
}

function updateEmptyStateModelInfo() {
  const nameEl = $("#emptyModelName");
  const badgeEl = $("#emptyModelBadge");
  const featsEl = $("#emptyModelFeatures");
  if (!nameEl) return;

  const m = state.currentModel;
  if (!m) {
    nameEl.textContent = "未选择模型";
    if (badgeEl) badgeEl.style.display = "none";
    if (featsEl) featsEl.innerHTML = "";
    return;
  }

  const provider = m.provider || "?";
  let name = m.name || m.id;
  let supportsThinking = m.reasoning === true;
  let supportsVision = Array.isArray(m.input) && m.input.includes("image");

  if (state.models && state.models.length > 0) {
    const found = state.models.find(item => item.id === m.id && item.provider === m.provider) ||
                  state.models.find(item => item.id === m.id);
    if (found) {
      if (found.name) name = found.name;
      if (found.reasoning === true) supportsThinking = true;
      if (Array.isArray(found.input) && found.input.includes("image")) supportsVision = true;
    }
  }

  nameEl.textContent = `${provider} / ${name}`;

  const isDefault = isCurrentModelDefault();
  if (badgeEl) {
    if (isDefault) {
      badgeEl.textContent = state.defaultModel?.source === "project" ? "★ 项目默认" : "★ 默认模型";
      badgeEl.style.display = "inline-block";
    } else {
      badgeEl.style.display = "none";
    }
  }

  if (featsEl) {
    featsEl.innerHTML = "";
    if (supportsThinking) {
      featsEl.appendChild(el("span", {
        class: "badge-feature",
        text: `🧠 思考: ${formatThinkingLevel(state.thinkingLevel)}`
      }));
    }
    if (supportsVision) {
      featsEl.appendChild(el("span", {
        class: "badge-feature",
        text: "👁️ 支持多模态识图"
      }));
    }
    if (m.id && m.name && m.id !== m.name) {
      featsEl.appendChild(el("span", {
        style: "font-family: monospace; font-size: 11px;",
        text: m.id
      }));
    }
  }
}

async function setDefaultModel(m) {
  try {
    const res = await authFetch(`${API}/api/set-default-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: m.provider,
        modelId: m.id,
        cwd: state.cwd,
        scope: "global",
      }),
    });
    const data = await res.json();
    if (data.ok) {
      state.defaultModel = {
        provider: m.provider,
        id: m.id,
        thinkingLevel: data.defaultThinkingLevel || state.thinkingLevel,
        source: data.scope || "global",
      };
      renderModelPill();
      renderModelMenu();
      updateEmptyStateModelInfo();
      showToast(`已将 ${m.name || m.id} 设为全局默认模型`);
    } else {
      showToast(`设为默认模型失败: ${data.error || "未知错误"}`);
    }
  } catch (e) {
    showToast(`设置失败: ${e.message}`);
  }
}

let modelSearchQuery = "";
let focusedModelIndex = -1;

function renderModelMenu() {
  const menu = $("#modelMenu");
  if (!menu) return;

  let searchInput = $("#modelSearchInput", menu);
  let listContainer = $(".model-menu-list", menu);

  if (!searchInput || !listContainer) {
    menu.innerHTML = "";
    const searchWrap = el("div", { class: "model-search-wrap" });
    searchInput = el("input", {
      type: "text",
      id: "modelSearchInput",
      class: "model-search-input",
      placeholder: "搜索模型 (如 claude, deepseek, 4o)…",
      autocomplete: "off",
      spellcheck: "false",
      value: modelSearchQuery,
    });

    searchInput.addEventListener("click", (e) => e.stopPropagation());
    searchInput.addEventListener("input", (e) => {
      modelSearchQuery = e.target.value;
      focusedModelIndex = -1;
      renderModelList(listContainer);
      const clearBtn = $(".btn-clear-model-search", searchWrap);
      if (clearBtn) clearBtn.style.display = modelSearchQuery ? "block" : "none";
    });
    searchInput.addEventListener("keydown", (e) => {
      const items = listContainer._items || [];
      if (e.key === "Escape") {
        menu.classList.remove("open");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items.length === 0) return;
        focusedModelIndex = (focusedModelIndex + 1) % items.length;
        items.forEach((it, idx) => it.element.classList.toggle("focused", idx === focusedModelIndex));
        if (items[focusedModelIndex]) {
          items[focusedModelIndex].element.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length === 0) return;
        focusedModelIndex = (focusedModelIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.element.classList.toggle("focused", idx === focusedModelIndex));
        if (items[focusedModelIndex]) {
          items[focusedModelIndex].element.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "Enter") {
        if (focusedModelIndex >= 0 && items[focusedModelIndex]) {
          items[focusedModelIndex].element.click();
        } else if (items.length > 0) {
          items[0].element.click();
        }
      }
    });

    const clearBtn = el("button", {
      class: "btn-clear-model-search",
      text: "×",
      type: "button",
      title: "清空搜索",
      style: `display: ${modelSearchQuery ? "block" : "none"}`,
      onclick: (e) => {
        e.stopPropagation();
        modelSearchQuery = "";
        searchInput.value = "";
        clearBtn.style.display = "none";
        focusedModelIndex = -1;
        searchInput.focus();
        renderModelList(listContainer);
      }
    });

    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(clearBtn);
    menu.appendChild(searchWrap);

    listContainer = el("div", { class: "model-menu-list" });
    menu.appendChild(listContainer);
  }

  renderModelList(listContainer);
}

function renderModelList(listContainer) {
  if (!listContainer) return;
  listContainer.innerHTML = "";
  const q = modelSearchQuery.trim().toLowerCase();

  const filteredModels = state.models.filter(m => {
    if (!q) return true;
    const idMatch = (m.id || "").toLowerCase().includes(q);
    const nameMatch = (m.name || "").toLowerCase().includes(q);
    const providerMatch = (m.provider || "").toLowerCase().includes(q);
    return idMatch || nameMatch || providerMatch;
  });

  if (filteredModels.length === 0) {
    listContainer.appendChild(el("div", { class: "model-empty", text: "未找到匹配的模型" }));
    listContainer._items = [];
    return;
  }

  const allRenderedItems = [];

  function renderModelOption(m, isDefaultBadge = false) {
    const active = state.currentModel && m.id === state.currentModel.id && m.provider === state.currentModel.provider;
    const isDef = state.defaultModel && m.id === state.defaultModel.id && (!state.defaultModel.provider || m.provider === state.defaultModel.provider);

    const featureBadges = [];
    if (m.reasoning) featureBadges.push(el("span", { class: "badge-feature", text: "🧠 Thinking" }));
    if (Array.isArray(m.input) && m.input.includes("image")) featureBadges.push(el("span", { class: "badge-feature", text: "👁️ Vision" }));
    if (isDef || isDefaultBadge) featureBadges.push(el("span", { class: "badge-default-tag", text: "★ 默认" }));

    const setDefaultBtn = isDef ? null : el("button", {
      class: "btn-set-default",
      type: "button",
      title: "将此模型设为全局默认模型",
      text: "★ 设为默认",
      onclick: (e) => {
        e.stopPropagation();
        setDefaultModel(m);
      }
    });

    const opt = el("div", {
      class: "opt" + (active ? " active" : ""),
      onclick: () => {
        $("#modelPillName").textContent = "切换中…";
        sendWs({ type: "set_model", provider: m.provider, modelId: m.id });
        saveRecentModel(m);
        $("#modelMenu").classList.remove("open");
        // 成功后的“已切换模型至 …”提示统一由 set_model 的 response 处理逻辑弹出，
        // 避免在这里乐观提示一次、响应到达后 pi 再提示一次（重复提示）。
      },
    }, [
      el("span", { class: "check", html: active ? "✓" : "" }),
      el("div", { class: "model-main" }, [
        el("div", { class: "model-name-row" }, [
          el("span", { class: "model-name", text: `${m.name || m.id}` }),
          ...featureBadges,
        ]),
        (m.name && m.id && m.name !== m.id) ? el("span", { class: "model-id-sub", text: `${m.provider ? m.provider + " · " : ""}${m.id}` }) : null,
      ]),
      setDefaultBtn,
    ]);

    allRenderedItems.push({ element: opt, model: m });
    return opt;
  }

  // If no search query, show "Default & Recent" section first
  if (!q) {
    loadRecentModels();
    const pinGroup = [];

    // Find default model if exists
    if (state.defaultModel?.id) {
      const defM = state.models.find(m => m.id === state.defaultModel.id && (!state.defaultModel.provider || m.provider === state.defaultModel.provider));
      if (defM) pinGroup.push({ model: defM, isDefault: true });
    }

    // Add recent models (excluding default)
    for (const rm of state.recentModels) {
      const full = state.models.find(m => m.id === rm.id && m.provider === rm.provider) || rm;
      if (!pinGroup.some(item => item.model.id === full.id && item.model.provider === full.provider)) {
        pinGroup.push({ model: full, isDefault: false });
      }
    }

    if (pinGroup.length > 0) {
      listContainer.appendChild(el("div", { class: "group-label", text: "🌟 默认与常用" }));
      for (const item of pinGroup) {
        listContainer.appendChild(renderModelOption(item.model, item.isDefault));
      }
    }
  }

  // Group rest by provider
  const groups = {};
  for (const m of filteredModels) {
    const p = m.provider || "other";
    (groups[p] = groups[p] || []).push(m);
  }

  for (const [provider, items] of Object.entries(groups).sort()) {
    listContainer.appendChild(el("div", { class: "group-label", text: provider }));
    for (const m of items) {
      listContainer.appendChild(renderModelOption(m));
    }
  }

  listContainer._items = allRenderedItems;
}

function toggleModelMenu() {
  if (state.streaming) {
    showToast("生成中暂不可切换模型");
    return;
  }
  sendWs({ type: "get_available_models" });
  const menu = $("#modelMenu");
  const thinkingMenu = $("#thinkingMenu");
  if (thinkingMenu) thinkingMenu.classList.remove("open");

  const willOpen = !menu.classList.contains("open");
  menu.classList.toggle("open");
  if (willOpen) {
    focusedModelIndex = -1;
    setTimeout(() => {
      const input = $("#modelSearchInput");
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }
}

function toggleThinkingMenu() {
  if (state.streaming) {
    showToast("生成中暂不可调整思考等级");
    return;
  }
  const modelMenu = $("#modelMenu");
  if (modelMenu) modelMenu.classList.remove("open");

  const menu = $("#thinkingMenu");
  renderThinkingMenu();
  menu.classList.toggle("open");
}

function baseName(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

// ---- Composer ----
function getComposerPlaceholder() {
  const isMobile = window.innerWidth <= 768;
  if (state.aborting) {
    return isMobile ? "正在中止…" : "正在中止当前任务…";
  }
  if (state.streaming) {
    return isMobile
      ? "AI 运行中… 可输入补充指令"
      : "AI 正在运行中… 可在此输入补充/指导指令，按 Enter 或点击【插入指令】实时调整";
  }
  return isMobile
    ? "给 pi 发消息…"
    : "给 pi 发消息…  (Enter 发送，Shift+Enter 换行)";
}

function updateComposerUI() {
  const ta = $("#composer");
  const text = ta ? ta.value.trim() : "";
  const sendBtn = $("#sendBtn");
  const steerBtn = $("#steerBtn");
  const inner = $("#composerInner");

  if (inner) {
    inner.classList.toggle("aborting", !!state.aborting);
  }

  if (state.aborting) {
    if (sendBtn) {
      sendBtn.classList.add("stop");
      sendBtn.disabled = true;
      sendBtn.textContent = "⏳";
      sendBtn.title = "中止中…";
    }
    if (steerBtn) {
      steerBtn.style.display = "none";
    }
    if (ta) ta.placeholder = getComposerPlaceholder();
  } else if (state.streaming) {
    if (sendBtn) {
      sendBtn.classList.add("stop");
      sendBtn.disabled = !state.wsConnected;
      sendBtn.textContent = "";
      sendBtn.title = "中止当前生成";
    }
    if (steerBtn) {
      if (text.length > 0) {
        steerBtn.style.display = "inline-flex";
        steerBtn.disabled = !state.wsConnected;
      } else {
        steerBtn.style.display = "none";
      }
    }
    if (ta) ta.placeholder = getComposerPlaceholder();
  } else {
    if (sendBtn) {
      sendBtn.classList.remove("stop");
      sendBtn.disabled = !state.wsConnected;
      sendBtn.textContent = "↑";
      sendBtn.title = "发送消息";
    }
    if (steerBtn) {
      steerBtn.style.display = "none";
    }
    if (ta) ta.placeholder = getComposerPlaceholder();
  }
}

function setComposerAborting(yes) {
  if (yes) {
    state.aborting = true;
  } else {
    state.aborting = false;
    const inner = $("#composerInner");
    if (inner) inner.classList.remove("aborting");
    const hint = $(".composer-hint");
    if (hint && hint.textContent.includes("中止")) {
      hint.textContent = "pi 会执行命令与读写你的文件 —— 请注意操作内容。";
    }
  }
  updateComposerUI();
  renderModelPill();
}

function abortGeneration() {
  if (!state.streaming && !state.aborting) return;
  if (!state.wsConnected) {
    const hint = $(".composer-hint");
    if (hint) hint.textContent = "操作失败：WebSocket 未连接。正在尝试重连…";
    scheduleReconnect(0);
    return;
  }
  state.aborting = true;
  updateComposerUI();
  const hint = $(".composer-hint");
  if (hint) hint.textContent = "中止当前任务中…";
  sendWs({ type: "abort" });
}

function submitSteer() {
  const ta = $("#composer");
  const text = ta.value.trim();
  const hint = $(".composer-hint");
  if (!text) return;

  if (!state.wsConnected) {
    if (hint) hint.textContent = "发送失败：WebSocket 未连接。正在尝试重连…";
    scheduleReconnect(0);
    return;
  }

  appendMessageNode("user", { text, isSteer: true, ts: Date.now() });
  ta.value = "";
  autoResize();
  updateComposerUI();

  if (hint) hint.textContent = "已插入指导指令！pi 将在当前轮次中实时接收并调整方向。";
  setTimeout(() => {
    if (hint) hint.textContent = "pi 会执行命令与读写你的文件 —— 请注意操作内容。";
  }, 4000);

  sendWs({ type: "steer", message: text });
}

function submitPrompt() {
  if (state.streaming) {
    const ta = $("#composer");
    const text = ta ? ta.value.trim() : "";
    if (text) {
      submitSteer();
    } else {
      abortGeneration();
    }
    return;
  }

  const ta = $("#composer");
  const text = ta ? ta.value.trim() : "";
  const imagesToSend = (state.attachedImages && state.attachedImages.length > 0)
    ? state.attachedImages.map(img => ({
        type: "image",
        data: img.data,
        mimeType: img.mimeType
      }))
    : undefined;

  const hint = $(".composer-hint");
  if (!text && (!imagesToSend || imagesToSend.length === 0)) return;
  if (!state.wsConnected) {
    if (hint) hint.textContent = "发送失败：WebSocket 未连接。正在尝试重连…";
    scheduleReconnect(0);
    const box = $("#composerInner");
    if (box) { box.style.boxShadow = "0 0 0 2px var(--danger)"; setTimeout(() => { box.style.boxShadow = ""; }, 350); }
    return;
  }

  if (hint) hint.textContent = "pi 会执行命令与读写你的文件 —— 请注意操作内容。"; // restore default
  const now = Date.now();
  // Render the user's message locally for instant feedback.
  appendMessageNode("user", { text, images: state.attachedImages ? [...state.attachedImages] : [], ts: now });
  
  ta.value = "";
  state.attachedImages = [];
  renderImagePreviews();
  autoResize();

  state.streaming = true;
  state.aborting = false;
  setComposerAborting(true);
  ensureStreamingMsg(now);
  refreshStreamingContent();

  // Set session name from the first prompt of a brand-new session.
  if (state.currentSessionFile == null && text) {
    const promptTitle = text.slice(0, 60).replace(/\s+/g, " ");
    $("#topSessionName").textContent = promptTitle;
    sendWs({ type: "set_session_name", name: promptTitle });

    // Update draft session item in sidebar immediately
    const list = $("#sessionList");
    if (list) {
      const draftItem = list.querySelector(".session-item.draft-session") || list.querySelector(".session-item.active");
      if (draftItem) {
        const nameSpan = draftItem.querySelector(".session-item-name span");
        if (nameSpan) nameSpan.textContent = promptTitle;
        let badge = draftItem.querySelector(".session-running-badge");
        if (!badge) {
          badge = el("span", { class: "session-running-badge", title: "任务正在后台生成中…" }, [
            el("span", { class: "spinner-dot" }),
            el("span", { text: "运行中" }),
          ]);
          draftItem.querySelector(".session-item-name")?.appendChild(badge);
        }
        const meta = draftItem.querySelector(".meta");
        if (meta) meta.textContent = "刚刚 · 1 条";
      }
    }
  }
  if (!sendWs({ type: "prompt", message: text, images: imagesToSend })) {
    state.streaming = false;
    state.aborting = false;
    setComposerAborting(false);
    if (state.streamingMsg) { state.streamingMsg.remove(); state.streamingMsg = null; }
    state.streamingItems = [];
    const hint = $(".composer-hint");
    if (hint) hint.textContent = "发送失败：WebSocket 连接已断开。正在尝试重连…";
    scheduleReconnect(0);
  }
}

function autoResize() {
  const ta = $("#composer");
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
}

function initSidebarResize() {
  const resizer = $("#sidebarResizer");
  if (!resizer) return;

  // Restore saved width from localStorage
  const savedWidth = parseInt(localStorage.getItem("sidebarWidth"), 10);
  if (savedWidth && savedWidth >= 180 && savedWidth <= 800) {
    document.documentElement.style.setProperty("--sidebar-width", `${savedWidth}px`);
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 260;

  resizer.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // Only primary button
    if (window.innerWidth <= 768) return; // Ignore on mobile

    isDragging = true;
    startX = e.clientX;
    const currentWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"), 10) || $(".sidebar")?.offsetWidth || 260;
    startWidth = currentWidth;

    resizer.setPointerCapture(e.pointerId);
    document.body.classList.add("is-resizing");
    e.preventDefault();
  });

  resizer.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    let newWidth = startWidth + deltaX;

    const minWidth = 180;
    const maxWidth = Math.min(650, Math.max(300, window.innerWidth - 250));
    newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

    document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try {
      resizer.releasePointerCapture(e.pointerId);
    } catch {}
    document.body.classList.remove("is-resizing");

    const finalWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"), 10);
    if (finalWidth) {
      localStorage.setItem("sidebarWidth", finalWidth);
    }
  };

  resizer.addEventListener("pointerup", endDrag);
  resizer.addEventListener("pointercancel", endDrag);

  // Double-click to reset width to default 260px
  resizer.addEventListener("dblclick", () => {
    document.documentElement.style.setProperty("--sidebar-width", "260px");
    localStorage.removeItem("sidebarWidth");
  });
}

// ---- Init ----
async function init() {
  // Default cwd to home (server uses home default too).
  state.cwd = document.body.dataset.cwd || "";

  // Load server config & restore saved CWD before connecting WebSocket
  await loadServerConfig();

  // event listeners
  $("#btnNew").addEventListener("click", () => startNewSession(true));

  $("#sendBtn").addEventListener("click", () => {
    if (state.streaming) {
      abortGeneration();
    } else {
      submitPrompt();
    }
  });

  const steerBtnEl = $("#steerBtn");
  if (steerBtnEl) {
    steerBtnEl.addEventListener("click", submitSteer);
  }

  const ta = $("#composer");
  let isComposing = false;
  ta.addEventListener("compositionstart", () => { isComposing = true; });
  ta.addEventListener("compositionend", () => { isComposing = false; });
  ta.addEventListener("input", () => {
    autoResize();
    updateComposerUI();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (state.streaming) {
        if (ta.value.trim()) {
          submitSteer();
        }
      } else {
        submitPrompt();
      }
    }
  });

  // model pill / thinking pill / menu interactions
  const modelPillEl = $("#modelPill");
  if (modelPillEl) {
    modelPillEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleModelMenu();
    });
  }

  const thinkingPillEl = $("#thinkingPill");
  if (thinkingPillEl) {
    thinkingPillEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleThinkingMenu();
    });
  }

  const emptyChangeModelBtn = $("#emptyChangeModelBtn");
  if (emptyChangeModelBtn) {
    emptyChangeModelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleModelMenu();
    });
  }

  // Keyboard shortcuts:
  // Ctrl+M / Cmd+M: toggle model selector
  // Ctrl+Shift+N / Cmd+Shift+N: new session
  // Ctrl+K / Cmd+K or Ctrl+/: search sidebar
  // Ctrl+B / Cmd+B: toggle sidebar
  // Escape: abort if streaming, close modals / lightbox / search
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (isCmdOrCtrl && e.shiftKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "o")) {
      e.preventDefault();
      startNewSession(true);
      return;
    }
    if ((isCmdOrCtrl && e.key.toLowerCase() === "k") || (e.ctrlKey && e.key === "/")) {
      e.preventDefault();
      const search = $("#sidebarSearch");
      if (search) {
        if (window.innerWidth <= 768) {
          $(".app").classList.add("sidebar-open");
        }
        search.focus();
        search.select();
      }
      return;
    }
    if (isCmdOrCtrl && e.key.toLowerCase() === "b") {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (isCmdOrCtrl && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleModelMenu();
      return;
    }
    if (e.key === "Escape") {
      const lightbox = $("#imageLightbox");
      if (lightbox && lightbox.style.display !== "none") {
        closeLightbox();
        return;
      }
      const isMenuOpen = $("#modelMenu")?.classList.contains("open") || $("#thinkingMenu")?.classList.contains("open");
      const isModalOpen = $("#cwdModal")?.classList.contains("open");
      if (isMenuOpen || isModalOpen) {
        if ($("#modelMenu")) $("#modelMenu").classList.remove("open");
        if ($("#thinkingMenu")) $("#thinkingMenu").classList.remove("open");
        if (isModalOpen) closeCwdModal();
        return;
      }
      if (state.streaming) {
        abortGeneration();
        return;
      }
      if (document.activeElement === $("#sidebarSearch")) {
        $("#sidebarSearch").blur();
      }
    }
  });

  // Export chat button
  const exportBtn = $("#btnExportChat");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportCurrentSession);
  }

  // Image and file attach / picker / paste / drag-and-drop
  const btnAttach = $("#btnAttachImage");
  const fileInput = $("#imageFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      handleIncomingFiles(e.target.files);
      fileInput.value = "";
    });
  }

  if (btnAttach) {
    // If not a label (e.g. fallback button), click input
    if (btnAttach.tagName !== "LABEL") {
      btnAttach.addEventListener("click", () => fileInput?.click());
    }
    // Keyboard accessibility for Enter / Space
    btnAttach.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput?.click();
      }
    });
  }

  // Image and file paste support
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      handleIncomingFiles(files);
      const ta = $("#composer");
      if (ta) ta.focus();
    }
  });

  // Global preventDefault to avoid browser opening dragged images in new tab
  window.addEventListener("dragover", (e) => e.preventDefault(), false);
  window.addEventListener("drop", (e) => e.preventDefault(), false);

  // Drag and drop images and files to composer
  const composerBox = $("#composerInner") || $(".composer");
  if (composerBox) {
    composerBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      composerBox.classList.add("drag-over");
    });
    composerBox.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      composerBox.classList.remove("drag-over");
    });
    composerBox.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      composerBox.classList.remove("drag-over");
      if (e.dataTransfer?.files) {
        handleIncomingFiles(e.dataTransfer.files);
      }
    });
  }

  // Lightbox close listeners
  const lightboxEl = $("#imageLightbox");
  if (lightboxEl) {
    lightboxEl.addEventListener("click", (e) => {
      if (e.target === lightboxEl || e.target.id === "lightboxClose") {
        closeLightbox();
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#modelMenu") && !e.target.closest("#modelPill") && !e.target.closest("#emptyChangeModelBtn")) {
      const m = $("#modelMenu");
      if (m) m.classList.remove("open");
    }
    if (!e.target.closest("#thinkingMenu") && !e.target.closest("#thinkingPill")) {
      const tm = $("#thinkingMenu");
      if (tm) tm.classList.remove("open");
    }
  });

  // suggestions
  document.querySelectorAll(".suggestions .chip").forEach((c) => {
    c.addEventListener("click", () => {
      $("#composer").value = c.dataset.prompt || c.textContent;
      autoResize();
      submitPrompt();
    });
  });

  $("#btnToggleSidebar").addEventListener("click", toggleSidebar);
  $("#sidebarOverlay").addEventListener("click", closeSidebar);

  // sidebar search (client side filter)
  $("#sidebarSearch").addEventListener("input", (e) => {
    filterSessions(e.target.value);
  });

  // Restore sidebar state for desktop, collapse by default on mobile
  if (window.innerWidth > 768) {
    if (localStorage.getItem("sidebarCollapsed") === "true") {
      $(".app").classList.remove("sidebar-open");
    }
  } else {
    $(".app").classList.remove("sidebar-open");
  }

  // Warn user if navigating/refreshing while a response is streaming
  window.addEventListener("beforeunload", (e) => {
    if (state.streaming) {
      e.preventDefault();
      e.returnValue = "任务正在运行中，刷新或离开页面将中断当前任务。";
      return e.returnValue;
    }
  });

  // Keep sidebar state consistent across viewport resizes.
  // Desktop uses an inline sidebar; mobile uses a drawer with an overlay.
  // If the user resizes across the 768px breakpoint, a stale `sidebar-open`
  // class would either show a stray inline sidebar on a collapsed desktop
  // layout, or worse, leave the full-screen overlay covering the main area
  // on mobile — making the whole UI unclickable. Sync on every resize.
  let lastIsMobile = window.innerWidth <= 768;
  window.addEventListener("resize", () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile !== lastIsMobile) {
      lastIsMobile = isMobile;
      // Crossing the breakpoint: always close the drawer to reach a known state.
      $(".app").classList.remove("sidebar-open");
      updateComposerUI();
    }
  });

  // CWD modal listeners
  const cwdBtn = $("#cwdPillWrap");
  if (cwdBtn) cwdBtn.addEventListener("click", openCwdModal);
  const cwdCloseBtn = $("#cwdModalClose");
  if (cwdCloseBtn) cwdCloseBtn.addEventListener("click", closeCwdModal);
  const cwdConfirmBtn = $("#cwdConfirmBtn");
  if (cwdConfirmBtn) cwdConfirmBtn.addEventListener("click", confirmCwdChange);
  const cwdModalEl = $("#cwdModal");
  if (cwdModalEl) {
    cwdModalEl.addEventListener("click", (e) => {
      if (e.target === cwdModalEl) closeCwdModal();
    });
  }
  const cwdInputEl = $("#cwdInput");
  if (cwdInputEl) {
    cwdInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmCwdChange(); }
      else if (e.key === "Escape") { e.preventDefault(); closeCwdModal(); }
    });
  }

  // Status badge click to reconnect
  const connStatusEl = $("#connStatus");
  if (connStatusEl) {
    connStatusEl.addEventListener("click", () => {
      if (!state.wsConnected) {
        showToast("正在尝试重新连接…");
        reconnectAttempts = 0;
        scheduleReconnect(0);
      }
    });
  }

  // Auto reconnect on network status / visibility change
  window.addEventListener("online", () => {
    if (!state.wsConnected) {
      reconnectAttempts = 0;
      scheduleReconnect(0);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshSessions();
      if (!state.wsConnected) {
        reconnectAttempts = 0;
        scheduleReconnect(0);
      } else {
        try { state.ws.send(JSON.stringify({ type: "ping" })); } catch {}
        if (state.currentSessionFile && !state.streaming) {
          syncSessionHistory(state.currentSessionFile, true);
        }
      }
    }
  });

  window.addEventListener("pageshow", () => {
    refreshSessions();
    if (!state.wsConnected) {
      reconnectAttempts = 0;
      scheduleReconnect(0);
    } else if (state.currentSessionFile && !state.streaming) {
      syncSessionHistory(state.currentSessionFile, true);
    }
  });

  // Background session status polling
  setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshSessions();
    }
  }, 10000);

  // Global event delegation for code block copy buttons
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-copy-code");
    if (!btn) return;
    e.stopPropagation();

    const wrapper = btn.closest(".code-block-wrapper");
    if (!wrapper) return;

    const codeEl = wrapper.querySelector("pre code");
    if (!codeEl) return;

    const codeText = codeEl.textContent;
    if (await copyToClipboard(codeText)) {
      btn.classList.add("copied");
      const span = btn.querySelector("span");
      if (span) span.textContent = "已复制!";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (span) span.textContent = "复制";
      }, 1500);
    } else {
      showToast("复制失败");
    }
  });

  // Mobile: floating button to jump back to the toolbar after long scrolls
  initMobileToolbarFab();

  // Sidebar resizer
  initSidebarResize();

  refreshSessions();
  // start in the disconnected state; connectWs will flip to green on open.
  const initDot = $("#connDot");
  const initLabel = $("#connLabel");
  if (initDot) initDot.style.color = "var(--danger)";
  if (initLabel) initLabel.textContent = "连接中…";
  $("#sendBtn").disabled = true;

  const urlParams = new URLSearchParams(window.location.search);
  const initialSession = urlParams.get("session") || urlParams.get("file");
  if (initialSession) {
    loadSession(initialSession);
  } else {
    connectWs({});
    showEmptyState(true);
  }
}

document.addEventListener("DOMContentLoaded", init);
