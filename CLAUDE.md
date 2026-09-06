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
- **Monorepo Lockstep 同步清单（5 处版本源）**：
  - `package.json`、`packages/protocol/package.json`、`server/package.json`、`clients/web/package.json`、`clients/harmony/package.json`（`version`）
  - `clients/harmony/AppScope/app.json5`（`versionName`、`versionCode`）
  - `docs/CHANGELOG.md`
  - **已动态化（无需手动改）**：Android `build.gradle.kts`（构建时从 root `package.json` 读取）、HarmonyOS `Index.ets`（运行时从 `bundleManager` 读取）。
- **跨端版本展示**：Web 侧边栏 `#appVersion`、Android `BuildConfig.VERSION_NAME`、HarmonyOS 侧边栏底部。

## 3. Always Commit & Push to Remote (Skip Local Build/Test)
- **Rule**: **严禁在本地运行 `pnpm test` / `pnpm build`**，所有构建与测试全部委托给 GitHub Actions CI。
- **Commands**:
  - 提交：`git add . && git commit -m "<type>: <description>"`（Conventional Commits）。
  - 推送：`git push origin main`，并以 `git status` 确认与 `origin/main` 完全同步。

## 4. Delegate CI to GitHub Actions & Monitor (Async, No Blocking)
- **Rule**: 推送后任务即视为就绪，**严禁使用 `gh run watch` 同步阻塞等待**。通过 GitHub API 轮询 CI 状态，失败时拉取 job 日志定位根因，修复后再次推送闭环。
- **Commands**:
  - 查状态：`curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/liguoshuai-1990/pi-chat/actions/runs?per_page=1"`
  - 查 jobs：`curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/liguoshuai-1990/pi-chat/actions/runs/<run_id>/jobs"`
  - 拉日志：`curl -s -L -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/liguoshuai-1990/pi-chat/actions/jobs/<job_id>/logs"`
