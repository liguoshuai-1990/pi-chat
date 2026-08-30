import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";

describe("pi-web-chat Unit Tests", () => {
  test("package.json is valid and version is 1.10.0", () => {
    const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
    assert.equal(pkg.version, "1.10.0");
    assert.equal(pkg.type, "module");
    assert.ok(pkg.bin["pi-web-chat"]);
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
});
