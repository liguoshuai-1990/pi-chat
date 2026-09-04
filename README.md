# 🚀 Pi-Chat: Multi-Client Monorepo for Pi Coding Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-Workspaces-orange.svg)](https://pnpm.io/)
[![CI Status](https://github.com/liguoshuai-1990/pi-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/liguoshuai-1990/pi-chat/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-2.12.8-emerald.svg)](https://github.com/liguoshuai-1990/pi-chat)

**Pi-Chat** 是一个面向 [Pi 编程智能体 (Pi Coding Agent)](https://github.com/badlogic/pi) 的全多端协同生态工程（Monorepo）。它将底层的 Pi Coding Agent 智能体能力解耦并无缝分发至 **Web 浏览器端**、**Android 手机原生端**、**华为鸿蒙 (HarmonyOS Next) 原生端**、**VPS 桥接网关服务端** 以及 **跨端标准化通信协议包**。

---

## 🏛️ 系统架构全景图

```
+-----------------------------------------------------------------------------------+
|                                 Clients (客户端层)                                |
|                                                                                   |
|  +------------------------+  +--------------------------+  +-------------------+  |
|  |     clients/web        |  |     clients/android      |  |  clients/harmony  |  |
|  |  (Web UI / npm 交付)   |  | (Jetpack Compose/Kotlin) |  |   (ArkTS/ArkUI)   |  |
|  +-----------+------------+  +------------+-------------+  +---------+---------+  |
+--------------|----------------------------|--------------------------|------------+
               |                            |                          |
               | WebSocket / SSE / REST     | WebSocket / REST         | WebSocket
               | (JSON Protocol + Token)    | (OkHttp + Flow)          | (@ohos.net)
               v                            v                          v
+-----------------------------------------------------------------------------------+
|                        packages/protocol (跨端协议共享标准包)                       |
|   - JSON Schemas, TypeScript Definitions, Message Validators, Error Codes        |
+-----------------------------------------------------------------------------------+
                                            |
                                            v
+-----------------------------------------------------------------------------------+
|                     server/ (VPS 统一桥接网关服务 @liguoshuai/pi-chat-server)       |
|                                                                                   |
|   +-----------------------+   +-----------------------+   +--------------------+  |
|   |   Token 鉴权与安全拦截  |   |   SSE/WS 全双工网关   |   |  30s 心跳与断线重连 |  |
|   +-----------+-----------+   +-----------+-----------+   +----------+---------+  |
|               |                           |                          |            |
|   +-----------v---------------------------v--------------------------v---------+  |
|   |                       PiAgent 进程池与状态管理器                            |  |
|   |   - 子进程生命周期 (spawn / SIGTERM)                                         |  |
|   |   - Ring Buffer 增量回填 (backfill_start / backfill_end)                     |  |
|   |   - 空闲内存回收 (IDLE_TIMEOUT_MS) 与最大存活保障                              |  |
|   +---------------------------------------+------------------------------------+  |
+-------------------------------------------|---------------------------------------+
                                            v  (stdio: stdin / stdout JSON RPC)
+-----------------------------------------------------------------------------------+
|                       pi --mode rpc (底层 Pi 智能体核心进程)                         |
|   - LLM 推理 (Anthropic / OpenAI / DeepSeek / Gemini / Ollama)                    |
|   - 本地工具执行 (Read / Write / Bash / Edit / Glob)                              |
|   - 状态持久化 (~/.pi/agent/sessions/*.jsonl)                                      |
+-----------------------------------------------------------------------------------+
```

---

## 📦 五大核心交付件 (Deliverables Matrix)

本项目采用统一 Monorepo 体系，在每次 CI/CD 构建与版本发布时生成 **5 个标准化交付件**：

| 序号 | 交付件名称 | 技术栈 / 目录 | 交付物形态 | 职责与定位 |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **`@liguoshuai/pi-chat-protocol`** | TypeScript / ESM<br>`packages/protocol/` | NPM Registry 包<br>`.tgz` 归档包 | 跨端统一通信协议 Schema、TS 类型声明、消息验证器与序列化工具 |
| **2** | **`@liguoshuai/pi-chat-server`** | Node.js + WS + SSE<br>`server/` | NPM CLI / 守护服务包<br>`.tgz` 归档包 | VPS 统一网关服务，管理 `pi --mode rpc` 子进程池、鉴权与断线增量回填 |
| **3** | **`@liguoshuai/pi-web-chat`** | HTML5 + CSS3 + Vanilla JS<br>`clients/web/` | NPM Web CLI 包<br>`.tgz` 归档包 | ChatGPT/Gemini 风格 Web 客户端，支持独立部署或本地运行 |
| **4** | **`pi-chat-android`** | Kotlin + Jetpack Compose<br>`clients/android/` | `.apk` 原生安装包 | Android 移动端原生应用，与 Web 端全要素对齐，随时随地操控 VPS 编程助手 |
| **5** | **`pi-chat-harmony`** | ArkTS + ArkUI Stage<br>`clients/harmony/` | `.zip` 源码与工程包 | 华为鸿蒙原生移动应用（兼容 HarmonyOS Next / OpenHarmony API 12+） |

---

## 🌟 全端功能对齐特性 (Multi-Client Feature Parity)

| 功能模块 | Web 前端 (`clients/web`) | Android 原生端 (`clients/android`) | HarmonyOS 鸿蒙端 (`clients/harmony`) |
| :--- | :---: | :---: | :---: |
| **全双工流式打字机** | ✅ | ✅ | ✅ |
| **思考过程实时计时与折叠卡片** | ✅ (`3.2s` / `用时 3.2s`) | ✅ (`3.2s` / `用时 3.2s`) | ✅ (`3.2s` / `用时 3.2s`) |
| **工具执行卡片与耗时统计** | ✅ (`💻 bash` / `📄 read` 等) | ✅ (`💻 bash` / `📄 read` 等) | ✅ (`💻 bash` / `📄 read` 等) |
| **工作目录切换 (CWD Pill & Dialog)** | ✅ (路径输入 + 快捷芯片) | ✅ (路径输入 + 快捷芯片) | ✅ (可配置) |
| **模型切换 (Model Pill & Selector)** | ✅ (搜索 / 厂商 / 特性标签) | ✅ (搜索 / 厂商 / 特性标签) | ✅ (可配置) |
| **深度思考级别切换 (Thinking Pill)** | ✅ (`Off` ~ `Max`) | ✅ (`Off` ~ `Max`) | ✅ (协议支持) |
| **插入指令 (Steer Prompt)** | ✅ (流式中实时注入) | ✅ (流式中实时注入) | ✅ (流式中实时注入) |
| **图片多附件上传与大图画廊** | ✅ (拖拽/粘贴/预览) | ✅ (相册挑选/缩略图/Lightbox) | 🔄 (协议层已支持) |
| **一键导出 Markdown 对话记录** | ✅ (Markdown 文件导出) | ✅ (复制并唤起系统分享) | 🔄 (开发中) |
| **单一精简设置入口** | ✅ (侧边栏底部) | ✅ (顶部栏统一齿轮) | ✅ (侧边栏底部) |
| **30s 心跳保活与自动重连** | ✅ | ✅ (指数退避) | ✅ (自动重连) |

---

## ⚡ 快速开始 (Quick Start)

### 1. 环境准备
- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0 (`npm i -g pnpm`)
- **Pi Agent**: 已全局安装并配置好 [pi](https://github.com/badlogic/pi) 命令行工具

### 2. 安装工作区依赖与编译
```bash
# 全仓依赖安装
pnpm install

# 语法与编译检查
pnpm build

# 全量单元测试 (Protocol, Server, Web)
pnpm test
```

### 3. 一键启动服务

#### 方式 A：启动 Web 完整体验端
```bash
# 开发模式（热重载）
pnpm dev:web

# 或者直接通过 npx 启动
npx @liguoshuai/pi-web-chat
```
浏览器打开 `http://localhost:3000` 即可开始编程对话。

#### 方式 B：在 VPS 服务器启动桥接网关
```bash
# 启动 VPS 独立网关服务（默认端口 3000）
pnpm dev:server

# 或通过环境变量配置端口与鉴权 Token
PORT=8080 AUTH_TOKEN=my_secret_token node server/src/index.js
```

---

## 📱 移动端使用与编译

### 1. Android 原生应用 (`clients/android`)
- **直接下载安装**：每次代码推送后，可在 GitHub 仓库的 [Actions 页面](https://github.com/liguoshuai-1990/pi-chat/actions) 或 [Releases 页面](https://github.com/liguoshuai-1990/pi-chat/releases) 直接下载打包好的 `pi-chat-v2.12.8-debug.apk`。
- **本地编译构建**：
  ```bash
  cd clients/android
  ./gradlew assembleDebug
  # 输出路径：app/build/outputs/apk/debug/pi-chat-v2.12.8-debug.apk
  ```
- **安装到设备**：
  ```bash
  adb install -r app/build/outputs/apk/debug/pi-chat-v2.12.8-debug.apk
  ```
- **配置后端**：打开 App，点击右上角 ⚙️ **设置** 按钮，填入你的 VPS 网关地址（如 `http://192.168.1.100:3000` 或 VPS 公网地址）与访问 Token 即可直连。

### 2. 华为鸿蒙原生应用 (`clients/harmony`)
- **导入工程**：使用 **DevEco Studio 5.0 (API 12+)** 打开 `clients/harmony` 目录。
- **配置签名**：在 `File` -> `Project Structure` -> `Signing Configs` 勾选自动签名。
- **构建 HAP**：
  ```bash
  cd clients/harmony
  hvigorw --mode module -p module=entry@default -p product=default assembleHap
  ```
- **安装到设备**：
  ```bash
  hdc app install entry/build/default/outputs/default/entry-default-signed.hap
  ```

---

## 🔄 CI/CD 自动化流水线 (GitHub Actions)

本项目配置了工业级完整的 CI/CD 流水线（`.github/workflows/ci.yml`）：

```
[ Git Push / Tag / Manual Trigger ]
                │
                ├───────────────────────────────────────────────────────┐
                ▼                                                       ▼
  [ Node.js Multi-OS Test ]                              [ Multi-Client Packaging ]
  ├─ Node 18.x, 20.x, 22.x                               ├─ Android APK Build & Artifact
  ├─ Syntax Check (pnpm build)                           ├─ NPM Tarballs Packaging (pnpm pack:all)
  └─ Unit Tests (pnpm test)                              └─ HarmonyOS Bundle Archiving
                │                                                       │
                └───────────────────────┬───────────────────────────────┘
                                        ▼
                   [ Release Job (Triggered on Tag v*) ]
                   ├─ Aggregate all 5 deliverables
                   └─ Publish GitHub Release automatically
```

1. **多环境自动化测试**：每次 Push/PR 在 Ubuntu、Node 18/20/22 下运行全量测试。
2. **Android 产物打包 (`pi-chat-android-apk`)**：全自动编译生成 APK，保留 30 天供随时下载。
3. **NPM 包打包 (`pi-chat-npm-packages`)**：将协议、网关与 Web 客户端自动打包为 `.tgz` 归档。
4. **鸿蒙工程打包 (`pi-chat-harmony-bundle`)**：自动将鸿蒙原生源码归档为 `pi-chat-harmony-app.zip`。
5. **一键版本发布**：打上版本 Tag 后自动创建 GitHub Release 并挂载全套交付件。
6. **手动一键触发**：支持在 GitHub Actions 界面通过 `Run workflow` 一键手动触发全套构建。

---

## 🔒 安全与防护机制

1. **CSWSH 跨站 WebSocket 劫持防御**：网关内置 `isAllowedOrigin` 验证，仅允许同源或受信任白名单域名接入。
2. **Path Traversal 路径遍历防护**：会话文件与工作目录严格受限在已授权根路径或 `sessionsDir` 下。
3. **Token 鉴权保护**：网关支持全局 `AUTH_TOKEN`，HTTP / WebSocket / SSE 均需 Bearer Token 鉴权。
4. **Markdown XSS 与恶意链接拦截**：前端内置 URL 校验器，严格屏蔽 `javascript:`、`data:` 等危险协议跳转。

---

## 📄 开源许可证

本项目基于 **[MIT License](./LICENSE)** 许可证开源。
