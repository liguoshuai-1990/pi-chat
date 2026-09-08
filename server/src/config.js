import os from "os";
import path from "path";
import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
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
    // ~user syntax (e.g. ~foo) is not supported — reject to avoid path confusion
    throw new Error(`Unsupported path: '~user' expansion for '${p}' is not supported. Use '~/...' for home directory.`);
  }
  return path.resolve(resolved);
}

export function normalizeCwd(dir) {
  if (!dir) return process.cwd() || home();
  const resolved = normalizePath(dir);
  // If ALLOWED_CWD_DIRS is set, verify the resolved path is within an allowed root
  const allowed = (process.env.ALLOWED_CWD_DIRS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length > 0) {
    const isAllowed = allowed.some(root => {
      const r = path.resolve(root);
      return resolved === r || resolved.startsWith(r + path.sep);
    });
    if (!isAllowed) {
      throw new Error(`cwd '${resolved}' is outside allowed directories (ALLOWED_CWD_DIRS=${process.env.ALLOWED_CWD_DIRS})`);
    }
  } else if (config.authToken) {
    // Security: when authToken is set (production), restrict cwd to the server's
    // working directory and its subdirectories to prevent authenticated clients
    // from spawning pi in arbitrary directories (e.g. /root/.ssh, /etc).
    // In dev mode (no authToken), allow any cwd for backward compatibility.
    const serverCwd = process.cwd();
    if (resolved !== serverCwd && !resolved.startsWith(serverCwd + path.sep)) {
      throw new Error(`cwd '${resolved}' is outside server working directory '${serverCwd}'. Set ALLOWED_CWD_DIRS to allow more directories.`);
    }
  }
  return resolved;
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

let PI_VERSION = null;
export function getPiVersion() {
  if (PI_VERSION !== null) return PI_VERSION;
  try {
    const piBin = resolvePiBin();
    const out = execFileSync(piBin, ["--version"], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) {
      PI_VERSION = out;
      return PI_VERSION;
    }
  } catch {}
  PI_VERSION = "";
  return PI_VERSION;
}

/**
 * Parse a numeric environment variable with a fallback default.
 * Returns defaultValue when the env var is unset, empty, non-finite, or negative.
 * Pass { integer: true } to also reject non-integer values.
 */
function parseEnvNum(name, defaultValue, { integer = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return defaultValue;
  if (integer && !Number.isInteger(n)) return defaultValue;
  return n;
}

export const config = {
  port: (() => {
    const p = Number(process.env.PORT);
    // Only accept a valid TCP port range; fall back to 3000 for 0, negative,
    // NaN, or out-of-range values instead of passing them to listen().
    return Number.isInteger(p) && p > 0 && p <= 65535 ? p : 3000;
  })(),
  host: process.env.HOST || (process.env.AUTH_TOKEN || process.env.PI_AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1"),
  authToken: process.env.AUTH_TOKEN || process.env.PI_AUTH_TOKEN || "",
  sessionsDir: process.env.PI_SESSIONS_DIR || path.join(home(), ".pi", "agent", "sessions"),
  piBin: resolvePiBin(),
  version: PKG_VERSION,
  idleTimeoutMs: parseEnvNum("IDLE_TIMEOUT_MS", 30 * 60 * 1000),
  maxAgentLifetimeMs: parseEnvNum("MAX_AGENT_LIFETIME_MS", 3 * 60 * 60 * 1000),
  eventBufferSize: parseEnvNum("EVENT_BUFFER_SIZE", 5000, { integer: true }),
  maxConcurrentAgents: parseEnvNum("MAX_CONCURRENT_AGENTS", 0, { integer: true }),
  idleDropHeap: process.env.IDLE_DROP_HEAP === "1" || process.env.IDLE_DROP_HEAP === "true",
  allowedOrigins: process.env.ALLOWED_ORIGINS || "",
  // Comma-separated list of allowed cwd root dirs. If set, cwd requests outside
  // these roots are rejected. If empty (default), cwd is restricted to the
  // server's working directory and its subdirectories for security.
  allowedCwdDirs: process.env.ALLOWED_CWD_DIRS || "",
  // Timeout for long-running commands (prompt, steer, client_send) in ms.
  // 0 = disabled (wait forever). Default: 0 (disabled).
  // When enabled and the timeout fires, the pi subprocess is sent abort + SIGTERM
  // to prevent zombie processes, and the timeout error is buffered for reconnecting
  // clients. Enable only if you need zombie protection for hung agents.
  longRunningTimeoutMs: parseEnvNum("LONG_RUNNING_TIMEOUT_MS", 0),
};

// Security warning: if authToken is set but ALLOWED_CWD_DIRS is empty,
// log a warning (cwd is still restricted to process.cwd() subdirs by default)
if (config.authToken && !config.allowedCwdDirs) {
  console.warn("[SECURITY] AUTH_TOKEN is set but ALLOWED_CWD_DIRS is empty — cwd is restricted to the server working directory. Set ALLOWED_CWD_DIRS to allow additional directories.");
}
