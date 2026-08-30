import { spawn } from "child_process";
import os from "os";
import path from "path";
import { existsSync } from "fs";

function resolvePiBin() {
  if (process.env.PI_BIN && existsSync(process.env.PI_BIN)) return process.env.PI_BIN;
  const home = os.homedir();
  const candidates = [
    path.join(home, ".npm-global/bin/pi"),
    "/usr/local/bin/pi",
    "/usr/bin/pi",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi";
}

const PI_BIN = resolvePiBin();
const SESSIONS_DIR = process.env.PI_SESSIONS_DIR || path.join(os.homedir(), ".pi/agent/sessions");

console.log("Spawning pi...");
const proc = spawn(PI_BIN, ["--mode", "rpc", "--session-dir", SESSIONS_DIR], {
  cwd: os.homedir(),
  env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" }
});

proc.stdout.on("data", (d) => {
  console.log("STDOUT:", d.toString().trim());
});
proc.stderr.on("data", (d) => {
  console.error("STDERR:", d.toString().trim());
});
proc.on("exit", (code, sig) => console.log("EXIT:", code, "sig:", sig));

// Send set_session_name FIRST, then prompt
setTimeout(() => {
  console.log("Sending set_session_name...");
  proc.stdin.write(JSON.stringify({ id: "1", type: "set_session_name", name: "My New Web Session Name" }) + "\n");
}, 500);

setTimeout(() => {
  console.log("Sending prompt...");
  proc.stdin.write(JSON.stringify({ id: "2", type: "prompt", message: "Say exactly: OK" }) + "\n");
}, 1000);

setTimeout(() => {
  console.log("Killing...");
  proc.kill("SIGTERM");
}, 12000);
