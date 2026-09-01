import os from "os";
import path from "path";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load .env file if present in working directory or package roots
function loadDotEnv() {
  const envCandidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../../.env"),
  ];
  for (const envPath of envCandidates) {
    try {
      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        break;
      }
    } catch {}
  }
}
loadDotEnv();

export function home() {
  return os.homedir();
}

export function normalizePath(p) {
  if (!p) return "";
  let resolved = p;
  if (p === "~") {
    resolved = home();
  } else if (p.startsWith("~/") || p.startsWith("~\\")) {
    resolved = path.join(home(), p.slice(2));
  } else if (p.startsWith("~")) {
    resolved = path.join(home(), p.slice(1));
  }
  return path.resolve(resolved);
}

export function normalizeCwd(dir) {
  if (!dir) return process.cwd() || home();
  return normalizePath(dir);
}

export function resolvePiBin() {
  if (process.env.PI_BIN && existsSync(process.env.PI_BIN)) return process.env.PI_BIN;
  const isWin = process.platform === "win32";
  const h = home();
  const candidates = [
    path.join(h, ".npm-global/bin/pi"),
    path.join(h, ".local/bin/pi"),
    path.join(h, ".cargo/bin/pi"),
    path.join(h, ".pnpm-global/bin/pi"),
    "/usr/local/bin/pi",
    "/usr/bin/pi",
    "/opt/homebrew/bin/pi",
  ];
  if (isWin) {
    const appData = process.env.APPDATA || path.join(h, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(h, "AppData", "Local");
    candidates.unshift(
      path.join(appData, "npm", "pi.cmd"),
      path.join(appData, "npm", "pi.exe"),
      path.join(localAppData, "pnpm", "pi.cmd"),
      path.join(localAppData, "pnpm", "pi.exe")
    );
  }
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi";
}

let PKG_VERSION = "1.0.0";
try {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  if (pkg.version) PKG_VERSION = pkg.version;
} catch {}

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  authToken: process.env.AUTH_TOKEN || process.env.PI_AUTH_TOKEN || "",
  sessionsDir: process.env.PI_SESSIONS_DIR || path.join(home(), ".pi", "agent", "sessions"),
  piBin: resolvePiBin(),
  version: PKG_VERSION,
  idleTimeoutMs: (() => {
    const raw = process.env.IDLE_TIMEOUT_MS;
    if (raw === undefined || raw === "") return 5 * 60 * 1000;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0 ? 5 * 60 * 1000 : n;
  })(),
  maxAgentLifetimeMs: (() => {
    const raw = process.env.MAX_AGENT_LIFETIME_MS;
    if (raw === undefined || raw === "") return 0;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0 ? 0 : n;
  })(),
  eventBufferSize: (() => {
    const raw = process.env.EVENT_BUFFER_SIZE;
    if (raw === undefined || raw === "") return 5000;
    const n = Number(raw);
    return !Number.isInteger(n) || n < 0 ? 5000 : n;
  })(),
  maxConcurrentAgents: (() => {
    const raw = process.env.MAX_CONCURRENT_AGENTS;
    if (raw === undefined || raw === "") return 0;
    const n = Number(raw);
    return !Number.isInteger(n) || n < 0 ? 0 : n;
  })(),
  idleDropHeap: process.env.IDLE_DROP_HEAP === "1" || process.env.IDLE_DROP_HEAP === "true",
  allowedOrigins: process.env.ALLOWED_ORIGINS || "",
};
