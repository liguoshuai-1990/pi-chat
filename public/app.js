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
  thinkingLevel: "medium",
  sessionId: null,
  isBackfilling: false,
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

function setCwd(newCwd) {
  state.cwd = newCwd;
  localStorage.setItem("pi_cwd", newCwd);
  updateCwdDisplay();
  clearChat();
  showEmptyState(true);
  state.currentSessionFile = null;
  $("#topSessionName").textContent = "新对话";
  connectWs({});
  refreshSessions();
}

async function loadServerConfig() {
  try {
    const res = await fetch(`${API}/api/config`);
    const data = await res.json();
    if (data.home) state.homeDir = data.home;
    if (data.serverCwd) state.serverCwd = data.serverCwd;
  } catch {}
  if (!state.cwd) {
    state.cwd = localStorage.getItem("pi_cwd") || state.serverCwd || state.homeDir || "";
  }
  updateCwdDisplay();
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
    const res = await fetch(`${API}/api/validate-dir?path=${encodeURIComponent(rawPath)}`);
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    const fenceIdx = rest.search(/```/);
    if (fenceIdx === -1) {
      parts.push({ kind: "md", text: rest });
      rest = "";
    } else {
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
    outHtml += "<p>" + mdInlineBlock(block) + "</p>";
  }
  for (const seg of out) {
    if (seg.kind === "table") {
      flushPara();
      flushList();
      outHtml += mdTable(seg.lines);
    } else if (seg.kind === "line") {
      // headings
      const m = seg.text.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
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
      } else if (/^\s*[-*]\s+/.test(seg.text) || /^\s*\d+\.\s+/.test(seg.text)) {
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
        outHtml += `<li>${mdInlineBlock(seg.text.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>`;
      } else {
        flushList();
        para.push(seg.text);
      }
    }
  }
  flushList();
  flushPara();
  // restore inline code
  outHtml = outHtml.replace(/\u0000CODE(\d+)\u0000/g, (_, n) => `<code>${escapeHtml(codeChunks[+n].slice(1, -1))}</code>`);
  return outHtml;
}

// helper state bag attached to the function during line scan
function mdInlineBlock(text) {
  function esc(s) { return escapeHtml(s); }
  let s = escapeHtml(text);
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  // links [txt](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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
  const n = document.createElement(tag);
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

// ---- Sidebar / sessions ----
async function refreshSessions() {
  const cwd = state.cwd || "";
  const res = await fetch(`${API}/api/sessions?cwd=${encodeURIComponent(cwd)}`);
  const data = await res.json();
  renderSidebar(data.sessions || []);
}

function renderSidebar(sessions) {
  const list = $("#sessionList");
  list.innerHTML = "";
  if (sessions.length === 0) {
    list.appendChild(el("div", { class: "sidebar-empty", text: "没有会话记录" }));
    return;
  }
  sessions.forEach((s) => {
    const title = s.firstUser || "新对话";
    const when = s.timestamp ? new Date(s.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const item = el("div", {
      class: "session-item" + (s.file === state.currentSessionFile ? " active" : ""),
      dataset: { file: s.file },
      title: s.file,                       // hover tooltip = raw jsonl path
      onclick: () => loadSession(s.file),
    }, [
      el("div", { class: "title" }, [
        el("div", { text: title }),
        el("div", { class: "meta", text: `${when} · ${s.messageCount || 0} 条` }),
      ]),
    ]);
    list.appendChild(item);
  });
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

async function loadSession(file) {
  state.currentSessionFile = file;
  state.streaming = false;
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
  // pull transcript from REST then connect a fresh WS pointed at this session
  const res = await fetch(`${API}/api/session?file=${encodeURIComponent(file)}`);
  const data = await res.json();

  if (data.model) {
    state.currentModel = data.model;
    renderModelPill();
  }

  clearChat();
  document.querySelector("#emptyState").style.display = "none";
  const chat = $("#chat-inner");
  // Walk through path entries to render messages in order.
  // We reconstruct assistant/user/toolResult blocks.
  const msgs = reconstructFromEntries(data.entries || []);
  for (const m of msgs) {
    appendMessageNode(m.role, m);
  }
  // Reconnect websocket pointed at this session so new prompts continue history.
  connectWs({ session: file });
  // Update sidebar active highlight
  refreshSessions();
}

function reconstructFromEntries(entries) {
  // Map toolResults by toolCallId so we can attach them to their toolCall in the assistant message
  const toolResults = new Map();
  for (const e of entries) {
    if (e.type === "message" && e.message?.role === "toolResult") {
      const m = e.message;
      if (m.toolCallId) {
        toolResults.set(m.toolCallId, m);
      }
    }
  }

  const out = [];
  for (const e of entries) {
    if (e.type !== "message") continue;
    const m = e.message;
    if (!m || m.role === "bashExecution") continue;
    if (m.role === "user") {
      // skip "bash execution" pseudo-users (those have role user but content type special)
      out.push({ role: "user", text: extractContentText(m.content), ts: m.timestamp });
    } else if (m.role === "assistant") {
      const rawContent = Array.isArray(m.content) ? m.content : (m.content ? [{ type: "text", text: String(m.content) }] : []);
      const content = rawContent.map(part => {
        if (part && part.type === "toolCall") {
          const res = toolResults.get(part.id);
          return { ...part, result: res || null };
        }
        return part;
      });
      if (m.stopReason === "error" && content.length === 0) {
        let errMsg = m.errorMessage || "生成失败（模型返回错误）";
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        content.push({ type: "text", text: `⚠️ **生成失败**: ${errMsg}` });
      }
      out.push({ role: "assistant", content, ts: m.timestamp, usage: m.usage });
    }
    // toolResult entries are attached directly to assistant toolCall parts, so they don't produce standalone messages
  }
  return out;
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(c => c.type === "text" || typeof c === "string")
    .map(c => typeof c === "string" ? c : c.text)
    .join("");
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

function appendMessageNode(role, m) {
  if (role === "user") {
    const isSteer = m.isSteer || false;
    const steerBadge = isSteer ? el("span", { class: "steer-badge", text: "🧭 指导指令" }) : null;
    const bubble = el("div", { class: "bubble" + (isSteer ? " steer" : "") }, [
      steerBadge,
      document.createTextNode(m.text || "")
    ]);
    const node = el("div", { class: "msg user" }, [bubble]);
    $("#chat-inner").appendChild(node);
    scrollBottom();
    return node;
  }
  return renderAssistantBlock(m);
}

function renderAssistantBlock(m) {
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

  const node = el("div", { class: "msg assistant" }, [
    el("div", { class: "role-tag" }, [
      el("span", { text: "pi" }),
      copyMsgBtn
    ]),
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
      content.appendChild(makeThinkingBlock(c.thinking));
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

function makeThinkingBlock(thinkingText, isActivelyThinking = false) {
  const block = el("div", { class: "thinking-block" + (isActivelyThinking ? " active" : "") });
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

function makeToolBlockFromCall(call) {
  const block = el("div", { class: "tool-block" });
  const hasResult = Boolean(call.result);
  const isError = call.result ? Boolean(call.result.isError) : false;

  let resultText = "";
  if (hasResult) {
    resultText = extractContentText(call.result.content);
  }

  const stateText = hasResult ? (isError ? "错误" : "完成") : "…";
  const stateClass = "state" + (hasResult && isError ? " error" : "");

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
    el("span", { class: "args", text: summaryArgs(call.name, call.arguments) }),
    copyBtn,
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

  if (!hasResult && call.id) {
    state.activeToolCalls.set(call.id, { block, body, head });
  }

  return block;
}

function summaryArgs(name, args) {
  if (!args) return "";
  try {
    if (name === "bash" && args.command) return args.command;
    if (name === "read" && args.path) return args.path;
    if (name === "write" && args.path) return args.path;
    if (name === "edit" && args.path) return args.path;
    if (name === "ls" && args.path) return args.path;
    if (name === "grep") return args.pattern || "";
    if (name === "find") return args.pattern || args.path || "";
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
function ensureStreamingMsg() {
  if (state.streamingMsg) return state.streamingMsg;
  showEmptyState(false);
  const node = el("div", { class: "msg assistant" }, [
    el("div", { class: "role-tag" }, [
      el("span", { text: "pi" }),
      el("button", {
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
      ])
    ]),
    el("div", { class: "content" }),
  ]);
  state.streamingMsg = node;
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
      const isActivelyThinking = state.streaming && isLast;
      content.appendChild(makeThinkingBlock(item.text, isActivelyThinking));
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
  if (state.streamingMsg) {
    refreshStreamingContent();
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

  const url = `${proto}://${location.host}/ws?cwd=${cwd}${sess}`;
  const ws = new WebSocket(url);
  state.ws = ws;
  ws._gen = myGen;

  ws.onopen = () => {
    if (ws._gen !== wsGen) return;
    isConnecting = false;
    setConnStatus("connected");
    startPingInterval();

    if (wasDisconnected || reconnectAttempts > 0) {
      showToast("网络连接已恢复");
    }
    wasDisconnected = false;
    reconnectAttempts = 0;

    setTimeout(() => sendWs({ type: "get_state" }), 300);
    setTimeout(() => sendWs({ type: "get_available_models" }), 500);
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
    handlePiMessage(obj);
  };
}

function sendWs(obj) {
  if (!state.ws || state.ws.readyState !== 1) return;
  state.ws.send(JSON.stringify(obj));
}

function handlePiMessage(obj) {
  // Backfill markers emitted by the server when it replays buffered events
  // that happened in the background while no browser was attached.
  if (obj.type === "backfill_start") {
    state.isBackfilling = true;
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
    }
    // jump to the latest content once the replay is done
    requestAnimationFrame(scrollBottom);
    return;
  }
  // Responses to commands we issued (get_state etc.) come back with success+data.
  if (obj.type === "response") {
    if (obj.command === "get_state" && obj.success) updateState(obj.data);
    else if (obj.command === "get_available_models" && obj.success) updateModels(obj.data.models || []);
    else if (obj.command === "set_model") {
      if (obj.success) {
        if (obj.data) state.currentModel = obj.data;
        renderModelPill();
        renderModelMenu();
        showToast(`已切换模型: ${state.currentModel?.name || state.currentModel?.id || ""}`);
        sendWs({ type: "get_state" });
      } else {
        showToast(`切换模型失败: ${obj.error || "未知错误"}`);
        renderModelPill();
      }
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
        renderModelPill();
        renderModelMenu();
      }
      break;
    case "remote_user_prompt":
      appendMessageNode("user", { text: obj.message, isSteer: obj.isSteer });
      break;
    case "agent_start":
      state.streaming = true;
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
      setComposerAborting(false);
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
        state.streamingItems.push({ type: "text", text: `⚠️ **${escapeHtml(errMsg)}**` });
        refreshStreamingContent();
      }
      break;
    }
    case "message_update": {
      const ev = obj.assistantMessageEvent;
      if (!ev) break;
      if (ev.type === "text_delta") {
        const last = state.streamingItems[state.streamingItems.length - 1];
        if (last && last.type === "text") {
          last.text += ev.delta;
        } else {
          state.streamingItems.push({ type: "text", text: ev.delta });
        }
        refreshStreamingContentDebounced();
      } else if (ev.type === "text_end") {
        // Authoritative final text for this content slot.
        if (typeof ev.content === "string") {
          const last = state.streamingItems[state.streamingItems.length - 1];
          if (last && last.type === "text") {
            last.text = ev.content;
          } else if (ev.content) {
            state.streamingItems.push({ type: "text", text: ev.content });
          }
        }
        refreshStreamingContent();
      } else if (ev.type === "thinking_delta" || ev.type === "thinking_start" || ev.type === "thinking_end") {
        // For thinking we accumulate deltas; thinking_delta carries .delta
        if (ev.type === "thinking_delta" && ev.delta) {
          const last = state.streamingItems[state.streamingItems.length - 1];
          if (last && last.type === "thinking") {
            last.text += ev.delta;
          } else {
            state.streamingItems.push({ type: "thinking", text: ev.delta });
          }
          refreshStreamingContentDebounced();
        }
      } else if (ev.type === "toolcall_start") {
        ensureStreamingMsg();
        const call = ev.toolCall || { id: obj.toolCallId || ev.id, name: obj.toolName, arguments: obj.args };
        // args may be incomplete until toolcall_end; we fill what we have now
        // and patch the head display on toolcall_end.
        ensureToolBlock(call.id, call.name, call.arguments);
      } else if (ev.type === "toolcall_delta") {
        // Streaming function-call argument JSON. We don't render it live
        // (JSON fragments are not useful UX), but make sure the tool block
        // exists so toolcall_end has somewhere to write into.
        const id = obj.toolCallId || ev.id;
        ensureToolBlock(id, obj.toolName || ev.toolCall?.name, obj.args);
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
      ensureStreamingMsg();
      const tc = ensureToolBlock(obj.toolCallId, obj.toolName, obj.args);
      if (tc) updateToolBlockCopyBtn(tc, { name: obj.toolName, arguments: obj.args });
      break;
    }
    case "tool_execution_update": {
      const tc = state.activeToolCalls.get(obj.toolCallId);
      if (tc) {
        const pr = obj.partialResult;
        const text = pr && pr.content ? (Array.isArray(pr.content) ? pr.content.map(c => c.text || "").join("") : "") : "";
        tc.body.innerHTML = escapeHtml(text) || "(执行中…)";
      }
      break;
    }
    case "tool_execution_end": {
      const tc = state.activeToolCalls.get(obj.toolCallId);
      if (tc) {
        const res = obj.result;
        const text = res && res.content ? (Array.isArray(res.content) ? res.content.map(c => c.text || "").join("") : "") : "";
        tc.body.innerHTML = escapeHtml(text) || "(无输出)";
        tc.head.querySelector(".state").textContent = obj.isError ? "错误" : "完成";
        tc.head.querySelector(".state").classList.toggle("error", !!obj.isError);
      }
      break;
    }
    case "extension_ui_request":
      handleExtensionUiRequest(obj);
      break;
    case "pi_exit":
      finalizeStreamingMsg();
      state.streaming = false;
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

function ensureToolBlock(toolCallId, name, args) {
  if (state.activeToolCalls.has(toolCallId)) return state.activeToolCalls.get(toolCallId);
  const block = makeToolBlockFromCall({ id: toolCallId, name, arguments: args });
  const entry = state.activeToolCalls.get(toolCallId) || { block, body: block._body, head: block._head };
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
  if (d?.model) { state.currentModel = d.model; renderModelPill(); }
  if (d?.thinkingLevel) state.thinkingLevel = d.thinkingLevel;
  $("#topSessionName").textContent = d?.sessionName || (d?.sessionFile ? baseName(d.sessionFile) : "新对话");

  // Sync streaming state upon state updates (e.g. after reconnect)
  if (d && typeof d.isStreaming === "boolean") {
    if (d.isStreaming) {
      if (!state.streaming) {
        state.streaming = true;
        setComposerAborting(true);
        ensureStreamingMsg();
      }
    } else if (state.streaming) {
      finalizeStreamingMsg();
      state.streaming = false;
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

function renderModelPill() {
  const m = state.currentModel;
  const pill = $("#modelPill");
  if (!m) { pill.textContent = "选择模型"; return; }
  const provider = m.provider || "?";
  let name = m.name || m.id;
  if (state.models && state.models.length > 0) {
    const found = state.models.find(item => item.id === m.id && item.provider === m.provider) ||
                  state.models.find(item => item.id === m.id);
    if (found && found.name) {
      name = found.name;
    }
  }
  pill.textContent = `${provider} / ${name}`;
  pill.title = `当前模型: ${provider} / ${name} (${m.id})`;
}

function renderModelMenu() {
  const menu = $("#modelMenu");
  menu.innerHTML = "";
  // group by provider
  const groups = {};
  for (const m of state.models) {
    const p = m.provider || "other";
    (groups[p] = groups[p] || []).push(m);
  }
  for (const [provider, items] of Object.entries(groups).sort()) {
    menu.appendChild(el("div", { class: "group-label", text: provider }));
    for (const m of items) {
      const active = state.currentModel && m.id === state.currentModel.id && m.provider === state.currentModel.provider;
      menu.appendChild(el("div", {
        class: "opt" + (active ? " active" : ""),
        onclick: () => {
          $("#modelPill").textContent = "切换中…";
          sendWs({ type: "set_model", provider: m.provider, modelId: m.id });
          menu.classList.remove("open");
        },
      }, [
        el("span", { class: "check", html: active ? "✓ " : "" }),
        document.createTextNode(`${m.name || m.id}`),
      ]));
    }
  }
}

function baseName(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

// ---- Composer ----
function updateComposerUI() {
  const ta = $("#composer");
  const text = ta ? ta.value.trim() : "";
  const sendBtn = $("#sendBtn");
  const steerBtn = $("#steerBtn");

  if (state.streaming) {
    if (sendBtn) {
      sendBtn.classList.add("stop");
      sendBtn.disabled = !state.wsConnected;
      sendBtn.textContent = "■";
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
    if (ta) ta.placeholder = "AI 正在运行中… 可在此输入补充/指导指令，按 Enter 或点击【插入指令】实时调整";
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
    if (ta) ta.placeholder = "给 pi 发消息…  (Enter 发送，Shift+Enter 换行)";
  }
}

function setComposerAborting(yes) {
  updateComposerUI();
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

  appendMessageNode("user", { text, isSteer: true });
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
  const ta = $("#composer");
  const text = ta.value.trim();
  const hint = $(".composer-hint");
  if (!text) return;
  if (!state.wsConnected) {
    if (hint) hint.textContent = "发送失败：WebSocket 未连接。正在尝试重连…";
    scheduleReconnect(0);
    const box = $("#composerInner");
    if (box) { box.style.boxShadow = "0 0 0 2px var(--danger)"; setTimeout(() => { box.style.boxShadow = ""; }, 350); }
    return;
  }
  if (state.streaming) {
    if (text) {
      submitSteer();
      return;
    }
    if (hint) hint.textContent = "中止当前生成中…";
    sendWs({ type: "abort" });
    return;
  }
  
  if (hint) hint.textContent = "pi 会执行命令与读写你的文件 —— 请注意操作内容。"; // restore default
  // Render the user's message locally for instant feedback.
  appendMessageNode("user", { text });
  ta.value = "";
  autoResize();

  state.streaming = true;
  setComposerAborting(true);
  ensureStreamingMsg();
  refreshStreamingContent();

  // Set session name from the first prompt of a brand-new session.
  if (state.currentSessionFile == null) {
    sendWs({ type: "set_session_name", name: text.slice(0, 60).replace(/\s+/g, " ") });
  }
  sendWs({ type: "prompt", message: text });
}

function autoResize() {
  const ta = $("#composer");
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
}

// ---- Init ----
function init() {
  // Default cwd to home (server uses home default too).
  state.cwd = document.body.dataset.cwd || "";

  // event listeners
  // event listeners
  $("#btnNew").addEventListener("click", () => {
    if (state.streaming) {
      if (!confirm("正在生成中，新建会话会终止当前操作，确定吗？")) return;
      sendWs({ type: "abort" });
    }
    clearChat();
    showEmptyState(true);
    state.currentSessionFile = null;
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    connectWs({ explicitNewSession: true }); // no session -> pi creates a new one
    $("#topSessionName").textContent = "新对话";
    // Mobile: close sidebar on new session
    if (window.innerWidth <= 768) closeSidebar();
    refreshSessions();
  });

  $("#sendBtn").addEventListener("click", () => {
    if (state.streaming) {
      const ta = $("#composer");
      if (ta && ta.value.trim()) {
        submitSteer();
      } else {
        submitPrompt();
      }
    } else {
      submitPrompt();
    }
  });

  const steerBtnEl = $("#steerBtn");
  if (steerBtnEl) {
    steerBtnEl.addEventListener("click", submitSteer);
  }

  const ta = $("#composer");
  ta.addEventListener("input", () => {
    autoResize();
    updateComposerUI();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
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

  // model pill / menu
  $("#modelPill").addEventListener("click", (e) => {
    e.stopPropagation();
    sendWs({ type: "get_available_models" });
    $("#modelMenu").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#modelMenu") && !e.target.closest("#modelPill")) {
      $("#modelMenu").classList.remove("open");
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
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".session-item").forEach((it) => {
      it.style.display = it.textContent.toLowerCase().includes(q) ? "" : "none";
    });
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

  // Load server config & restore saved CWD
  loadServerConfig();

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
      if (!state.wsConnected) {
        reconnectAttempts = 0;
        scheduleReconnect(0);
      } else {
        try { state.ws.send(JSON.stringify({ type: "ping" })); } catch {}
      }
    }
  });

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
