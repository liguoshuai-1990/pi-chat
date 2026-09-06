# 🤖 Pi-Chat AI Coding Agent 工作指南与行为规范

> **适用对象**：所有在本项目（`pi-chat`）进行需求分析、架构设计、代码开发、缺陷修复、测试重构的 AI 编程智能体（包括 Pi Coding Agent、Claude Code、Cursor、GitHub Copilot 等）及人类开发者。

---

## 📌 核心铁律（四大强制原则）

在进行任何工程操作时，**必须无条件严格遵守以下四大铁律**：

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
  8. 更新日志：`docs/CHANGELOG.md`（按 Keep a Changelog 格式记录更新说明）

- **版本号跨端正确展示规范 (Multi-Client UI Display)**：
  - **Web 端**：网关在 `/api/config` 动态输出 `config.version`，前端 `clients/web/public/app.js` 将版本号绑定渲染至侧边栏底部 `#appVersion` 元素（例如 `v2.5.1`）。
  - **Android 端**：在 `clients/android/app/build.gradle.kts` 启用 `buildConfig = true`，侧边栏抽屉底部及“后端配置”对话框中通过 `BuildConfig.VERSION_NAME` 正确渲染版本号（例如 `pi-chat · Android v2.5.1`）。
  - **HarmonyOS 端**：在侧边栏抽屉底部正确渲染当前鸿蒙端版本号（例如 `pi-chat · HarmonyOS v2.5.1`）。

---

### 铁律三：任务完成必须提交并推送到远端 (Always Commit & Push to Remote)
- **触发时机**：在完成代码修改、版本号递增后。
- **强制操作**：
  1. **跳过本地构建与测试，直接提交推送**：**严禁在本地运行 `pnpm test` / `pnpm build`**。本地环境经常与 CI 环境不一致（Node 版本、pnpm 版本、平台差异），本地通过不代表 CI 通过，本地失败也不代表代码有问题。所有构建与测试**全部委托给 GitHub Actions CI**，避免在本地环境调试上浪费时间。
  2. **端侧构建分工**：Android APK 打包（Gradle 编译）、HarmonyOS 产物及多版本 Node 矩阵等重型任务由 GitHub Actions CI 自动执行，**严禁在本地盲目执行 `./gradlew assembleDebug`**，避免因宿主机缺失 Android/Java 环境或依赖下载导致长时间卡死。
  3. **规范提交信息**：遵循 Conventional Commits 规范编写清晰的 commit message（如 `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`）。
  4. **推送到远端**：执行 `git push origin main`（或当前分支），确保远端仓库与本地完全同步。
  5. 最终运行 `git status` 验证分支与 `origin/main` 一致，无残留未提交文件。

---

### 铁律四：交付后由 GitHub Actions 跑全量 CI 并监控结果 (Delegate CI to GitHub Actions & Monitor)
- **触发时机**：代码推送到远端仓库后。
- **分工与执行规范**：
  1. **全量流水线自动化**：代码推送到主干会自动触发 GitHub Actions CI（包含 Node 20/22 矩阵测试、HarmonyOS 归档、Android APK 自动编译以及 NPM 发布校验）。
  2. **异步快速交付，拒绝同步死等**：推送后任务即可视为就绪并向用户交付响应，**严禁使用 `gh run watch` 同步阻塞会话等待数分钟**。
  3. **CI 状态监控与失败诊断**：推送后通过 GitHub API 轮询 CI 运行状态，发现失败 job 时**拉取 job 日志定位根因**，修复后再次推送闭环。具体方法见下方「CI 监控权限与操作指南」。
- **原因与目的**：充分发挥 GitHub Actions 云端流水线的算力，彻底解放本地端改代码的交互卡顿，实现秒级验证与交付。

#### CI 监控权限与操作指南

> **本仓库为公开仓库，CI 监控需要配置 GitHub Token。**

**权限需求：**

| 操作 | 是否需要 Token | 权限要求 |
|---|---|---|
| 查询 CI 运行状态（list runs / jobs） | 推荐（无 token 限 60 次/小时） | 任意有效 token 即可（5000 次/小时） |
| 下载 CI job 日志（定位失败根因） | **必需** | classic PAT 的 `repo` scope，或 fine-grained PAT 的 `Actions: Read` |
| 触发 CI（push 代码） | 走 git 凭证 | 与 CI 查询权限无关 |

**Token 配置方式（推荐 fine-grained PAT）：**

1. 前往 GitHub → Settings → Developer settings → Fine-grained personal access tokens
2. 创建 token，**仅授权 `liguoshuai-1990/pi-chat` 仓库**，权限选择 `Actions: Read`
3. 将 token 存入环境变量（如 `GITHUB_TOKEN` 或 `GH_TOKEN`），**严禁写入代码或提交到仓库**
4. Agent 通过 `curl -H "Authorization: token $GITHUB_TOKEN"` 调用 GitHub API

**常用 CI 监控命令：**

```bash
# 查询最近一次 CI 运行状态
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/liguoshuai-1990/pi-chat/actions/runs?per_page=1"

# 查询某次运行的所有 job 状态
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/liguoshuai-1990/pi-chat/actions/runs/<run_id>/jobs"

# 下载失败 job 的日志（定位根因）
curl -s -L -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/liguoshuai-1990/pi-chat/actions/jobs/<job_id>/logs"
```

---

## ⚡ 效率、专注与职业化准则 (Efficiency, Focus & Professionalism)

> 与上述四大铁律同等重要，目标是**更快的交付、更聚焦的行为、更专业的产出**。以下每一条均可被客观衡量与检验。

### 效率：做得快 (Be Fast)

1. **并行执行**：多个互不依赖的工具调用（例如读取多个文件、运行多条独立 `bash` 命令）**必须在同一批次并行发出**，严禁串行逐条等待。
2. **合并命令**：多条相关的 shell 命令用 `&&` / `;` 合并为一条，减少往返次数。
3. **禁止冗余**：已读取的文件内容、已确认的状态与版本号，**不得重复读取或重复验证**；基于已知上下文直接推进。
4. **最小路径**：只执行完成目标所必需的最少步骤，跳过无关探索；不“顺便”检查或浏览与任务无关的模块与代码。

### 专注：做对事 (Stay Focused)

1. **单一目标**：一次只完成用户明确要求的这一件事，拒绝“顺手重构 / 顺手优化 / 顺手排版”等范围外的动作。
2. **守住范围 (No Scope Creep)**：只改动与任务直接相关的文件；发现的无关“改进机会”只记录到最终总结，**不**当场处理。
3. **先澄清后动手**：需求存在歧义或多种合理解法时，先抛出**一个关键澄清问题**，而非基于假设做大范围、可能返工的工作。
4. **一次到位**：动笔前想清楚方案，避免对同一处“改完又改”的无效往返。

### 职业化：做得专业 (Be Professional)

1. **诚实不作假**：绝不编造 API、命令输出、测试结果或执行记录；未执行的操作不得谎称已执行；不确定之处明确标注“未验证 / 需确认”。
2. **先诊断后修复**：先定位根因（读日志、读报错、读现状）再动手，禁止盲目试错、无依据猜测。
3. **最小改动 (Minimal Diff)**：改动与目标一一对应、范围最小化，遵循项目既有代码风格，不引入无关依赖或格式扰动。
4. **透明收尾**：开始前用一句话说明计划；结束后用简洁清单汇报「做了什么 / 改了什么 / 验证了什么 / 结果如何」，不啰嗦、不遗漏关键风险。

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
 └─ 在 docs/CHANGELOG.md 中记录更新项
         │
         ▼
[Step 4: 提交并推送到远端]
 ├─ git add <files>
 ├─ git commit -m "<type>: <description>"
 ├─ git push origin main
 └─ git status (确认完全干净)
         │
         ▼
[Step 5: GitHub Actions CI 全量验证与监控]
 ├─ GitHub 自动执行 Node 20/22 矩阵 / Android APK 编译 / 打包
 ├─ 通过 GitHub API 轮询 CI 状态（非阻塞）
 └─ 失败则拉取 job 日志定位根因，修复后再次推送闭环
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
