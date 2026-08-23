#!/usr/bin/env node
// pi-web-chat CLI entry point
// Usage: pi-web-chat [--port=3000] [--cwd=/path] [--help]

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { spawn } from "child_process";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const SERVER = resolve(ROOT, "server.js");

function printHelp() {
  console.log(`
pi-web-chat — Web UI for pi coding agent (RPC mode)

Usage:
  pi-web-chat [options]

Options:
  -p, --port <number>    Port to listen on (default: 3000, env PORT)
  -c, --cwd <path>       Working directory for pi sessions (default: $HOME)
  -h, --help             Show this help

Environment:
  PORT              Same as --port
  PI_BIN            Path to pi binary (auto-detected if not set)
  PI_SESSIONS_DIR   Pi session storage directory (default: ~/.pi/agent/sessions)

Examples:
  pi-web-chat
  pi-web-chat --port 8080
  PORT=4000 pi-web-chat
`);
}

function parseArgs(argv) {
  const opts = { port: process.env.PORT || 3000, cwd: process.env.HOME || os.homedir() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    if (a === "-p" || a === "--port") {
      const val = argv[++i];
      if (!val || isNaN(Number(val))) {
        console.error(`Error: --port requires a valid number`);
        process.exit(1);
      }
      opts.port = Number(val);
    } else if (a.startsWith("--port=")) {
      const val = a.split("=")[1];
      if (!val || isNaN(Number(val))) {
        console.error(`Error: --port requires a valid number`);
        process.exit(1);
      }
      opts.port = Number(val);
    } else if (a === "-c" || a === "--cwd") {
      const val = argv[++i];
      if (!val) {
        console.error(`Error: --cwd requires a path`);
        process.exit(1);
      }
      opts.cwd = val;
    } else if (a.startsWith("--cwd=")) {
      const val = a.split("=")[1];
      if (!val) {
        console.error(`Error: --cwd requires a path`);
        process.exit(1);
      }
      opts.cwd = val;
    } else {
      console.error(`Unknown option: ${a}`);
      printHelp();
      process.exit(1);
    }
  }
  return opts;
}

function normalizeCwd(dir) {
  if (!dir) return os.homedir();
  if (dir.startsWith("~")) {
    return resolve(os.homedir(), dir.slice(1).replace(/^[/\\]/, ""));
  }
  return resolve(dir);
}

const opts = parseArgs(process.argv.slice(2));
opts.cwd = normalizeCwd(opts.cwd);

// Spawn server.js as a child so we can forward signals cleanly.
// Use --expose-gc so idle agents can call global.gc() to release heap (IDLE_DROP_HEAP=1).
const child = spawn("node", ["--expose-gc", SERVER], {
  cwd: opts.cwd,
  env: { ...process.env, PORT: String(opts.port) },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (e) => { console.error(e); process.exit(1); });

// Forward signals.
["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => {
  process.on(sig, () => child.kill(sig));
});