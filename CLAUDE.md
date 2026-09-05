# Claude / AI Assistant Guidelines for pi-chat

> **⚠️ 唯一权威来源**：本项目的 AI Agent 操作规范以 [`AGENTS.md`](./AGENTS.md) 为准。本文件仅作精简速查，供 Claude Code 等轻量阅读场景快速索引。两者冲突时，以 `AGENTS.md` 为准。

所有 AI 编程助手（Claude Code、Pi Coding Agent、Cursor、GitHub Copilot 等）必须无条件下遵守以下四大铁律：

## 1. Always Pull Latest Trunk Before Any Work
- **Command**: `git fetch origin && git pull origin main`
- **Rule**: 开始任何分析、审查、修复或开发前，先同步至远端最新基线，确认工作区干净。

## 2. Increment Semantic Version on Every Change & Verify Multi-Client Display
- **Rule**: 遵循 [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html)（`MAJOR.MINOR.PATCH`）。
  - `PATCH`: Bug 修复、文档、chore、非破坏性微调。
  - `MINOR`: 向后兼容的新功能。
  - `MAJOR`: 破坏性变更 / 架构重写。
- **Monorepo Lockstep 同步清单**：
  - `package.json`、`packages/protocol/package.json`、`server/package.json`、`clients/web/package.json`、`clients/harmony/package.json`（`version`）
  - `clients/harmony/AppScope/app.json5`（`versionName`、`versionCode`）
  - `clients/android/app/build.gradle.kts`（`versionName`、`versionCode`）
  - `docs/CHANGELOG.md`
- **跨端版本展示**：Web 侧边栏 `#appVersion`、Android `BuildConfig.VERSION_NAME`、HarmonyOS 侧边栏底部。

## 3. Always Test, Commit & Push to Remote
- **Commands**:
  - 测试：`pnpm test` 与 `pnpm build`（涉及 Android 时加 `pnpm build:android`）。
  - 提交：`git add . && git commit -m "<type>: <description>"`（Conventional Commits）。
  - 推送：`git push origin main`，并以 `git status` 确认与 `origin/main` 完全同步。

## 4. Always Ensure & Verify CI Green After Push
- **Command**: 推送后用 `gh run list` / `gh run watch` 跟踪最新 CI 流水线。
- **Rule**: 若出现失败 Job（红叉），立即定位根因（`gh run view --log-failed`）、修复、递增版本号并再次提交推送，直至远端 CI `completed: success`。