# 🚀 Pi-Chat: Multi-Client Monorepo for Pi Coding Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-Workspaces-orange.svg)](https://pnpm.io/)
[![Web Version](https://img.shields.io/npm/v/@liguoshuai/pi-web-chat.svg?label=npm%20@liguoshuai/pi-web-chat&color=cb3837)](https://www.npmjs.com/package/@liguoshuai/pi-web-chat)

**Pi-Chat** 是一个面向 [Pi 编程智能体 (Pi Coding Agent)](https://github.com/badlogic/pi) 的全多端协同生态大仓库（Monorepo）。它将原有的单体 Web 聊天应用解耦并扩展为包含 **Web 浏览器端**、**Android 原生端**、**鸿蒙 (HarmonyOS Next) 原生端**、**VPS 桥接网关服务端** 以及 **跨端标准化通信协议包** 的多端协同架构。

---

## 🏛️ Monorepo 目录结构

```
pi-chat/
├── package.json              # 根目录 workspace 全局配置与聚合脚本
├── pnpm-workspace.yaml       # pnpm 工作区配置
├── clients/                  # 多端客户端目录
│   ├── web/                  # Web 前端（原 @liguoshuai/pi-web-chat，保持独立发布）
│   ├── android/              # Android 原生应用 (Kotlin + Jetpack Compose + OkHttp)
│   └── harmony/              # 华为鸿蒙原生应用 (ArkTS + ArkUI + @ohos.net.webSocket)
├── server/                   # 运行在 VPS 上的 Pi Agent 桥接网关 (@pi-chat/server)
├── packages/                 # 共享标准库
│   └── protocol/             # 跨端标准化通信协议定义与校验器 (@pi-chat/protocol)
├── docs/                     # 系统架构与开发文档
└── LICENSE                   # MIT 开源许可证
```

---

## 🧩 模块与子工程说明

### 1. 跨端共享协议 (`packages/protocol`)
- **包名**：`@pi-chat/protocol`
- **定位**：定义了 Web、Android、HarmonyOS 与网关通信的统一 JSON 消息契约。
- **特性**：包含完整 TypeScript 类型声明、JSON Schema 定义、消息构造器与容错校验器（规范化 `client_send` / `prompt`、`heartbeat` / `ping` 等）。

### 2. VPS 桥接网关服务端 (`server/`)
- **包名**：`@pi-chat/server`
- **定位**：托管在云端 VPS 或本地的网关服务，负责启动并管理底层的 `pi --mode rpc` 子进程池。
- **特性**：
  - **全双工 WebSocket 网关**：支持多端连接、会话隔离与广播。
  - **SSE 增量推送流** (`/api/stream`)：支持轻量端只读单向打字机流式消费。
  - **多端统一 Token 鉴权**：通过 `AUTH_TOKEN` 环境变量防止未授权访问。
  - **断线无损回填**：连接断开时任务在后台继续运行，重连后通过 `backfill_start` / `backfill_end` 无损回放历史增量。
  - **空闲自动回收**：无人使用且空闲时自动杀掉子进程回收 VPS 内存。

### 3. Web 网页端 (`clients/web/`)
- **包名**：`@liguoshuai/pi-web-chat`
- **定位**：原 Web 聊天端，具有 ChatGPT / Gemini 风格现代化界面。
- **独立交付**：在 Monorepo 内保持原生独立性，可以直接通过 `npm install -g @liguoshuai/pi-web-chat` 或 `npx @liguoshuai/pi-web-chat` 执行运行与构建发布。

### 4. Android 原生端 (`clients/android/`)
- **技术栈**：Kotlin + Jetpack Compose + Material 3 + OkHttp + Coroutines/StateFlow
- **特性**：
  - 基于 OkHttp WebSocket 封装带指数退避的自动断线重连与 30s 心跳保活。
  - 流式打字机动画渲染与思考过程折叠气泡。
  - 会话抽屉历史导航与多会话即时无缝切换。

### 5. 鸿蒙原生端 (`clients/harmony/`)
- **技术栈**：ArkTS + ArkUI (Stage 模型，兼容 HarmonyOS Next / OpenHarmony API 12+)
- **特性**：
  - 基于 `@ohos.net.webSocket` 与 `@ohos.net.http` 封装网络通信层。
  - 声明式 `SideBarContainer` 侧边栏历史抽屉与自适应深色主题。
  - 原生打字机流式增量合并与实时中止支持。

---

## ⚡ 快速开始 (Quick Start)

### 1. 环境准备
- Node.js >= 18.0.0
- pnpm >= 8.0.0 (`npm i -g pnpm`)
- 已安装并配置好 [pi-coding-agent](https://github.com/badlogic/pi)

### 2. 安装工作区依赖
```bash
# 根目录下执行
pnpm install
```

### 3. 运行开发服务
```bash
# 启动 Web 前端服务
pnpm dev:web

# 启动 VPS 网关服务
pnpm dev:server
```

### 4. 运行全仓库测试
```bash
pnpm test
```

---

## 📱 移动端开发与编译

### Android 应用
1. 打开 **Android Studio**，选择 `clients/android` 目录导入工程。
2. 确保已在本地或 VPS 启动了网关（默认端口 3000）。
3. 如需修改连接地址，可在 `ChatViewModel.kt` 中配置 Gateway IP。
4. 点击 **Run** 即可在模拟器或真机运行。

### 鸿蒙应用
1. 打开 **Huawei DevEco Studio**，选择 `clients/harmony` 目录导入工程。
2. 在 `Index.ets` 或 `ChatViewModel.ets` 中配置目标 Gateway IP。
3. 连接 HarmonyOS Next 手机或模拟器，点击 **Run 'entry'** 进行运行。

---

## 🤖 AI Agent 开发与贡献规范 (Agent Guidelines)

本项目面向 AI Coding Agent（Pi Coding Agent、Claude Code、Cursor 等）制定了严格的开发工作流与三大铁律，详情请参阅 **[`AGENTS.md`](./AGENTS.md)**：

1. **工作前必拉取最新主干代码**：执行任何分析与开发前必须运行 `git fetch origin && git pull origin main` 同步远端最新基线。
2. **遵循语义化版本规范递增版本号**：每次修改均需累加 SemVer 版本号（如 `2.5.0` -> `2.5.1`），全仓各模块同步升级，并确保 Web 及各客户端正确展示版本号。
3. **完成修改必通过全量测试并推送远端**：所有改动需经过 `pnpm test` 及相关端构建校验，并通过 `git push origin main` 及时提交推送。

---

## 📦 发布指南 (Release)

### 发布 Web 端 npm 包
```bash
pnpm publish:web
```
该命令会自动在 `clients/web` 目录下执行发布，完全向后兼容现有的 `@liguoshuai/pi-web-chat` npm 交付物。

---

## 📄 开源许可证

本项目遵循 [MIT License](LICENSE)。
