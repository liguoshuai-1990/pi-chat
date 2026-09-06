#!/usr/bin/env node
// Stub for the `pi` CLI binary, used only by gateway unit tests (server/test).
// The CI runner does not have the real `pi` installed, so spawning it fails
// with ENOENT and leaves the test process hanging. This stub simply stays
// alive so `PiAgent.start()` sees a live subprocess; it emits no RPC output.
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
const timer = setInterval(() => {}, 60_000);
timer.unref();
