#!/usr/bin/env node
/**
 * bump-version.mjs — 单命令递增全仓版本号（单一真源 → 6 处同步）
 *
 * Usage:
 *   node scripts/bump-version.mjs 2.17.9          # 指定完整版本号
 *   node scripts/bump-version.mjs patch            # 2.17.8 → 2.17.9
 *   node scripts/bump-version.mjs minor            # 2.17.8 → 2.18.0
 *   node scripts/bump-version.mjs major            # 2.17.8 → 3.0.0
 *
 * 更新的 6 处版本源（Android 与 HarmonyOS Index.ets 已动态化，无需手动维护）：
 *   1.  package.json (root)                        ← 唯一真源
 *   2.  packages/protocol/package.json
 *   3.  server/package.json
 *   4.  clients/web/package.json
 *   5.  clients/harmony/package.json
 *   6.  clients/harmony/AppScope/app.json5       (versionName + versionCode)
 *
 * 已动态化（无需手动改）：
 *   -  clients/android/app/build.gradle.kts      → 构建时从 root package.json 读取
 *   -  clients/harmony/.../Index.ets             → 运行时从 bundleManager 读取
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = (p) => resolve(ROOT, p);

// --- helpers ---

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function writeText(path, text) {
  writeFileSync(path, text, "utf8");
}

// --- version math ---

function parseVersion(v) {
  const parts = v.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${v}`);
  }
  return parts; // [major, minor, patch]
}

function bump(current, type) {
  const [major, minor, patch] = parseVersion(current);
  switch (type) {
    case "patch": return `${major}.${minor}.${patch + 1}`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "major": return `${major + 1}.0.0`;
    default: return type; // assume it's a full version string
  }
}

// --- updaters ---

function updatePackageJSON(path, version) {
  const pkg = readJSON(path);
  pkg.version = version;
  writeJSON(path, pkg);
}

function updateHarmonyAppJson5(path, version) {
  const [major, minor, patch] = parseVersion(version);
  const code = major * 1000000 + minor * 10000 + patch * 100;
  let text = readText(path);
  text = text.replace(/"versionName"\s*:\s*"[^"]+"/, `"versionName": "${version}"`);
  text = text.replace(/"versionCode"\s*:\s*\d+/, `"versionCode": ${code}`);
  writeText(path, text);
}

function updateChangelog(path, version) {
  const today = new Date().toISOString().slice(0, 10);
  let text = readText(path);
  // Don't add duplicate entry
  if (text.includes(`## [${version}]`)) return;
  const header = `## [${version}] - ${today}\n\n### Changed\n- (待补充)\n\n`;
  // Insert before the first version heading
  text = text.replace(
    /^(## \[)/m,
    `${header}$1`
  );
  writeText(path, text);
}

// --- main ---

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/bump-version.mjs <version|patch|minor|major>");
  process.exit(1);
}

const rootPkg = readJSON(r("package.json"));
const newVersion = bump(rootPkg.version, arg);
const [major, minor, patch] = parseVersion(newVersion);

console.log(`Bumping version: ${rootPkg.version} → ${newVersion}\n`);

// 1-5. All package.json files
const pkgFiles = [
  "package.json",
  "packages/protocol/package.json",
  "server/package.json",
  "clients/web/package.json",
  "clients/harmony/package.json",
];
for (const f of pkgFiles) {
  updatePackageJSON(r(f), newVersion);
  console.log(`  ✓ ${f}`);
}

// 6. HarmonyOS app.json5
updateHarmonyAppJson5(r("clients/harmony/AppScope/app.json5"), newVersion);
console.log(`  ✓ clients/harmony/AppScope/app.json5 (versionName=${newVersion}, versionCode=${major * 1000000 + minor * 10000 + patch * 100})`);

// CHANGELOG
updateChangelog(r("docs/CHANGELOG.md"), newVersion);
console.log(`  ✓ docs/CHANGELOG.md (placeholder entry added)`);

console.log(`\nDone. All 6 version sources synced to ${newVersion}.\n(Android & Index.ets are dynamic — no manual update needed.)`);
console.log(`Remember to fill in the CHANGELOG entry before committing.`);
