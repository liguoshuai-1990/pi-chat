import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("pi-web-chat Unit Tests", () => {
  test("package.json is valid and package name is @liguoshuai/pi-web-chat", () => {
    const pkgPath = path.resolve(__dirname, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    assert.equal(pkg.name, "@liguoshuai/pi-web-chat");
    assert.match(pkg.version, /^\d+\.\d+\.\d+/);
    assert.equal(pkg.type, "module");
    assert.ok(pkg.bin && pkg.bin["pi-web-chat"]);
  });

  test("Origin validation rules against CSWSH", () => {
    function isAllowedOrigin(origin, host, customAllowed = "") {
      if (!origin) return true;
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.host;
        if (originHost.toLowerCase() === (host || "").toLowerCase()) return true;

        const isLocalOrigin = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === "::1";
        const hostName = (host || "").split(":")[0].toLowerCase();
        const isLocalHost = hostName === "localhost" || hostName === "127.0.0.1" || hostName === "::1";
        if (isLocalOrigin && isLocalHost) return true;

        if (customAllowed) {
          const allowed = customAllowed.split(",").map(s => s.trim().toLowerCase());
          if (allowed.includes(origin.toLowerCase()) || allowed.includes(originUrl.origin.toLowerCase())) {
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    }

    // Same-origin should be allowed
    assert.equal(isAllowedOrigin("http://localhost:3000", "localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:8080", "localhost:3000"), true);

    // Malicious external origins should be denied
    assert.equal(isAllowedOrigin("http://evil-attacker.com", "localhost:3000"), false);
    assert.equal(isAllowedOrigin("https://malicious.xyz:3000", "localhost:3000"), false);

    // Whitelisted origins
    assert.equal(isAllowedOrigin("https://my-proxy.company.internal", "localhost:3000", "https://my-proxy.company.internal"), true);
  });

  test("Markdown URL sanitizer blocks javascript: protocol", () => {
    function sanitizeUrl(url) {
      if (!url) return "#";
      const trimmed = url.trim();
      if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
        return trimmed.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }
      return "#";
    }

    assert.equal(sanitizeUrl("https://example.com"), "https://example.com");
    assert.equal(sanitizeUrl("http://foo.bar/baz?a=1&b=2"), "http://foo.bar/baz?a=1&b=2");
    assert.equal(sanitizeUrl("javascript:alert(1)"), "#");
    assert.equal(sanitizeUrl("JAVASCRIPT:alert(document.cookie)"), "#");
    assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "#");
    assert.equal(sanitizeUrl("vbscript:msgbox(1)"), "#");
  });

  test("Path traversal security check", () => {
    const sessionsDir = "/home/user/.pi/agent/sessions";
    function checkSafeRelPath(baseDir, targetFile) {
      const rel = path.relative(path.resolve(baseDir), path.resolve(targetFile));
      return !rel.startsWith("..") && !path.isAbsolute(rel);
    }

    assert.equal(checkSafeRelPath(sessionsDir, "/home/user/.pi/agent/sessions/test.jsonl"), true);
    assert.equal(checkSafeRelPath(sessionsDir, "/home/user/.pi/agent/sessions/subdir/test.jsonl"), true);
    assert.equal(checkSafeRelPath(sessionsDir, "/etc/passwd"), false);
    assert.equal(checkSafeRelPath(sessionsDir, "/home/user/.pi/agent/sessions/../../etc/shadow"), false);
  });

  test("Attachment MIME detection and text file inference", () => {
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

    function isTextFile(file) {
      if (file.type && (file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml") || file.type.includes("javascript") || file.type.includes("yaml"))) {
        return true;
      }
      const name = file.name ? file.name.toLowerCase() : "";
      return /\.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|py|pyw|rb|php|java|c|cpp|cc|cxx|h|hpp|rs|go|sh|bash|zsh|sql|html|htm|css|scss|sass|less|vue|svelte|yaml|yml|toml|ini|env|xml|log|csv|tsv|diff|patch|dockerfile|makefile)$/i.test(name);
    }

    // Image MIME detection
    assert.equal(detectImageMimeType({ type: "image/png", name: "test.png" }), "image/png");
    assert.equal(detectImageMimeType({ type: "", name: "photo.HEIC" }), "image/heic");
    assert.equal(detectImageMimeType({ type: "", name: "photo.jpg" }), "image/jpeg");
    assert.equal(detectImageMimeType({ type: "", name: "vector.svg" }), "image/svg+xml");
    assert.equal(detectImageMimeType({ type: "", name: "unknown" }), "image/png");

    // Text file inference
    assert.equal(isTextFile({ type: "text/plain", name: "notes.txt" }), true);
    assert.equal(isTextFile({ type: "", name: "app.py" }), true);
    assert.equal(isTextFile({ type: "", name: "package.json" }), true);
    assert.equal(isTextFile({ type: "", name: "server.log" }), true);
    assert.equal(isTextFile({ type: "application/zip", name: "archive.zip" }), false);
    assert.equal(isTextFile({ type: "application/octet-stream", name: "binary.exe" }), false);
  });

  test("Monorepo version lockstep and SemVer compliance across packages", () => {
    const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"));
    const webPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    const serverPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../../../server/package.json"), "utf8"));
    const protocolPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../../../packages/protocol/package.json"), "utf8"));
    const harmonyPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../../../clients/harmony/package.json"), "utf8"));

    const semverRegex = /^\d+\.\d+\.\d+$/;
    assert.match(rootPkg.version, semverRegex, "Root version must follow SemVer");
    assert.equal(webPkg.version, rootPkg.version, "Web package version must match root");
    assert.equal(serverPkg.version, rootPkg.version, "Server package version must match root");
    assert.equal(protocolPkg.version, rootPkg.version, "Protocol package version must match root");
    assert.equal(harmonyPkg.version, rootPkg.version, "Harmony package version must match root");
  });
});
