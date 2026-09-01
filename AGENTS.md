# 🤖 Pi-Chat AI Coding Agent 工作指南与行为规范

> **适用对象**：所有在本项目（`pi-chat`）进行需求分析、架构设计、代码开发、缺陷修复、测试重构的 AI 编程智能体（包括 Pi Coding Agent、Claude Code、Cursor、GitHub Copilot 等）及人类开发者。

---

## 📌 核心铁律（三大强制原则）

在进行任何工程操作时，**必须无条件严格遵守以下三大铁律**：

### 铁律一：工作前必拉取最新主干代码 (Always Pull Latest Trunk Before Any Work)
- **触发时机**：在接收到用户指令、开始任何需求分析、代码审查、Bug 定位或编写代码**之前**。
- **强制操作**：
  1. 首先运行 `git fetch origin` 与 `git pull origin main`（若在特性分支则拉取对应追踪分支），确保工作区基于远端最新的代码基线。
  2. 运行 `git status` 确认当前工作区干净，无未追踪或冲突状态。
- **原因与目的**：杜绝基于过期代码导致的分析偏差、无效工作、代码冲突以及覆盖他人最新成果。

---

### 铁律二：任何修改必须累加版本号，并遵循语义化版本规范 (Semantic Versioning & Multi-Client Display)
- **版本规范**：严格遵循业界通用的 **[Semantic Versioning 2.0.0 (SemVer)](https://semver.org/spec/v2.0.0.html)** 格式 `MAJOR.MINOR.PATCH`（如 `2.5.1`）：
  - **PATCH（补丁版本，如 `2.5.0` -> `2.5.1`）**：日常 Bug 修复 (fix)、微小重构 (refactor)、文档与规范更新 (docs)、代码清理 (chore) 等不破坏向后兼容性的微小修改。
  - **MINOR（次版本号，如 `2.5.1` -> `2.6.0`）**：向下兼容的新增功能 (feat)、新增协议消息类型或字段、新增客户端界面功能模块等。
  - **MAJOR（主版本号，如 `2.5.1` -> `3.0.0`）**：不向下兼容的重大架构重写、破坏性协议改造 (breaking change)、底层通信契约不兼容变更等。

- **全仓版本同步清单 (Monorepo Version Lockstep)**：
  本项目采用 Monorepo 统一版本管理模式。任何功能修改或补丁，必须**同步更新**以下所有子包与移动端清单中的版本号：
  1. 根目录：`package.json` (`version`)
  2. 跨端协议包：`packages/protocol/package.json` (`version`)
  3. VPS 网关服务：`server/package.json` (`version`)
  4. Web 前端客户端：`clients/web/package.json` (`version`)
  5. 鸿蒙客户端包：`clients/harmony/package.json` (`version`)
  6. 鸿蒙应用元数据：`clients/harmony/AppScope/app.json5` (`versionName` 与 `versionCode`)
  7. Android 构建脚本：`clients/android/app/build.gradle.kts` (`versionName` 与 `versionCode`)
  8. 更新日志：`clients/web/docs/CHANGELOG.md`（按 Keep a Changelog 格式记录更新说明）

- **版本号跨端正确展示规范 (Multi-Client UI Display)**：
  - **Web 端**：网关在 `/api/config` 动态输出 `config.version`，前端 `clients/web/public/app.js` 将版本号绑定渲染至侧边栏底部 `#appVersion` 元素（例如 `v2.5.1`）。
  - **Android 端**：在 `clients/android/app/build.gradle.kts` 启用 `buildConfig = true`，侧边栏抽屉底部及“后端配置”对话框中通过 `BuildConfig.VERSION_NAME` 正确渲染版本号（例如 `pi-chat · Android v2.5.1`）。
  - **HarmonyOS 端**：在侧边栏抽屉底部正确渲染当前鸿蒙端版本号（例如 `pi-chat · HarmonyOS v2.5.1`）。

---

### 铁律三：任务完成必须提交并推送到远端 (Always Test, Commit & Push to Remote)
- **触发时机**：在完成代码修改、版本号递增并通过全部本地测试验证后。
- **强制操作**：
  1. **本地测试验证**：运行 `pnpm test` 与 `pnpm build`，确保所有单元测试 100% 通过且无编译报错。涉及 Android 端时需运行 `cd clients/android && ./gradlew assembleDebug`。
  2. **规范提交信息**：遵循 Conventional Commits 规范编写清晰的 commit message（如 `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`）。
  3. **推送到远端**：执行 `git push origin main`（或当前分支），确保远端仓库与本地完全同步。
  4. 最终运行 `git status` 验证分支与 `origin/main` 一致，无残留未提交文件。

---

## 🛠️ Agent 标准工作流 (Standard Operating Procedure - SOP)

```
[接收用户指令 / 任务启动]
         │
         ▼
[Step 1: 远端代码同步]
 ├─ git fetch origin
 └─ git pull origin main (确认无冲突，代码最新)
         │
         ▼
[Step 2: 需求分析与方案制定]
 ├─ 分析问题与技术方案
 └─ 确认影响范围 (Web / Server / Protocol / Android / HarmonyOS)
         │
         ▼
[Step 3: 代码修改与版本递增]
 ├─ 编写 / 修改核心业务逻辑
 ├─ 递增全仓版本号 (SemVer: MAJOR.MINOR.PATCH)
 ├─ 确认 Web 与移动端 UI 上的版本号展示正确
 └─ 在 clients/web/docs/CHANGELOG.md 中记录更新项
         │
         ▼
[Step 4: 构建与全量测试]
 ├─ pnpm test (测试 protocol, server, web)
 ├─ pnpm build (构建编译检查)
 └─ (若修改 Android) cd clients/android && ./gradlew assembleDebug
         │
         ▼
[Step 5: 提交并推送到远端]
 ├─ git add <files>
 ├─ git commit -m "<type>: <description>"
 ├─ git push origin main
 └─ git status (确认完全干净)
```

---

## 📂 工程模块速查

| 目录路径 | 模块名称 | 技术栈 | 职责与定位 |
|---|---|---|---|
| `packages/protocol/` | `@liguoshuai/pi-chat-protocol` | Node.js (ESM) | 跨端统一通信协议 schema、TS 类型声明、消息构造与校验 |
| `server/` | `@liguoshuai/pi-chat-server` | Express + WS + SSE | VPS 网关服务，管理 `pi --mode rpc` 子进程池与鉴权 |
| `clients/web/` | `@liguoshuai/pi-web-chat` | HTML5 + CSS3 + 原生 JS | Web 聊天端，ChatGPT/Gemini 风格界面 |
| `clients/android/` | Android App | Kotlin + Jetpack Compose + OkHttp | Android 原生移动端应用 |
| `clients/harmony/` | HarmonyOS App | ArkTS + ArkUI (Stage 模型 API 12+) | 华为鸿蒙原生移动端应用 |

---

## ⌨️ 常用开发与测试命令

```bash
# 工作区全量依赖安装
pnpm install

# 运行全仓库单元测试
pnpm test

# 分模块独立测试
pnpm test:protocol
pnpm test:server
pnpm test:web

# 启动 Web 本地开发服务 (http://localhost:3000)
pnpm dev:web

# 启动网关服务 (http://localhost:3000)
pnpm dev:server

# 构建 Android Debug APK
pnpm build:android
```
