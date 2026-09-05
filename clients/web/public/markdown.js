// markdown.js — Lightweight, safe Markdown renderer for pi-web-chat
// Handles code fence blocks, tables, lists, task checkboxes, headers, blockquotes, inline formatting, and safe URLs.

(function (global) {
  function escapeHtml(s) {
    if (!s) return "";
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

  function sanitizeUrl(url) {
    if (!url) return "#";
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      return trimmed.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    return "#";
  }

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

  function renderInlineMd(text) {
    // tables, then markdown-ish transforms. Escape first.
    // Split out inline code first using placeholders to protect them.
    const codeChunks = [];
    let t = text.replace(/`([^`\n]+)`/g, (m) => {
      const i = codeChunks.length;
      codeChunks.push(m);
      return `\u0000CODE${i}\u0000`;
    });

    const lines = t.split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[i + 1]) && lines[i+1].includes("-")) {
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
          // blockquote line
          flushPara();
          flushList();
          outHtml += `<blockquote>${mdInlineBlock(seg.text.replace(/^>\s?/, ""))}</blockquote>`;
        } else if (/^\s*[-*+]\s+/.test(seg.text) || /^\s*\d+\.\s+/.test(seg.text)) {
          // list item
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

  function renderMarkdown(md) {
    if (!md) return "";
    if (typeof md !== "string") md = String(md);
    const parts = [];
    let rest = md;
    while (rest.length) {
      const fenceMatch = rest.match(/(?:^|\n)```/);
      if (!fenceMatch) {
        parts.push({ kind: "md", text: rest });
        rest = "";
      } else {
        const fenceIdx = fenceMatch.index + (fenceMatch[0].length - 3);
        if (fenceIdx > 0) parts.push({ kind: "md", text: rest.slice(0, fenceIdx) });
        rest = rest.slice(fenceIdx + 3);
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

  // Export to global scope & Node/module exports
  const PiMarkdown = {
    escapeHtml,
    copyToClipboard,
    sanitizeUrl,
    mdInlineBlock,
    mdTable,
    renderInlineMd,
    renderMarkdown
  };

  if (typeof exports === "object" && typeof module !== "undefined") {
    module.exports = PiMarkdown;
  }
  const root = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : global);
  root.PiMarkdown = PiMarkdown;
  root.escapeHtml = escapeHtml;
  root.copyToClipboard = copyToClipboard;
  root.sanitizeUrl = sanitizeUrl;
  root.renderMarkdown = renderMarkdown;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
