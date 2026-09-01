# Pi-Chat Monorepo 架构设计文档 (Architecture Design)

## 1. 架构目标与全景图

`pi-chat` 是一个采用 **pnpm Workspaces** 进行组织的多端协同大仓库（Monorepo）。系统通过标准化通信协议将底层的 Pi Coding Agent 智能体能力分发至浏览器 Web 端、Android 移动端和华为鸿蒙原生端。

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
|   - LLM 推理 (Anthropic/OpenAI/Gemini/Ollama)                                     |
|   - 本地工具执行 (Read / Write / Bash / Edit / Git)                               |
|   - 状态持久化 (~/.pi/agent/sessions/*.jsonl)                                      |
+-----------------------------------------------------------------------------------+
```

---

## 2. 核心模块定位与解耦协作

### 2.1 `server/` 与 `clients/web/` 的协作关系
- **单一数据源与统一内核 (Single Source of Truth)**：
  `server/` 是整个生态**唯一的后端网关核心**，管理所有 Agent 子进程生命周期、Token 鉴权、心跳、SSE 与会话管理。
- **Web 端的薄封装设计**：
  `clients/web/server.js` 仅作为针对 npm 交付包 `@liguoshuai/pi-web-chat` 的轻量运行胶水层，直接引用 `@liguoshuai/pi-chat-server` 启动并托管 `clients/web/public` 前端资源，消除了代码重复。
- **全端同等接入地位**：
  Web 前端 (`clients/web/public/app.js`) 与 Android、鸿蒙移动端一样，原生支持通过 `token` 参数或弹窗输入访问密钥，既可同源一体化部署，亦可跨域独立部署直连 VPS 网关。

---

## 3. 核心模块分工列表

1. **`server` (`@liguoshuai/pi-chat-server`)**：
   - 统一 VPS 部署入口，提供 Token 认证、RESTful 历史会话管理、WebSocket 多路复用和 SSE 流推送。
2. **`clients/web` (`@liguoshuai/pi-web-chat`)**：
   - 维持既有独立发布流（npm `@liguoshuai/pi-web-chat`）。
   - 现代化 Web 界面，支持 Markdown 渲染、代码高亮与折叠、附件上传、移动端响应式布局与 Token 鉴权提示。
3. **`clients/android`**：
   - 基于 Android 原生 Jetpack Compose 与 Material 3 设计。
   - 使用 OkHttp WebSocket 与 Coroutines / StateFlow 实现极速响应和流式增量绘制。
4. **`clients/harmony`**：
   - 基于华为 HarmonyOS Next ArkTS 与 ArkUI 框架开发。
   - 适配 Stage 模型与跨端响应式布局。
5. **`packages/protocol` (`@liguoshuai/pi-chat-protocol`)**：
   - 统一全端消息格式，消除各端通信协议不一致的问题。
   - 包含校验器与别名兼容层（`client_send` -> `prompt`, `heartbeat` -> `ping`）。

---

## 4. 会话与进程生命周期管理

- **连接绑定与解耦**：每个会话由 `cwd` 与 `sessionPath` 唯一确定。客户端断开后，Agent 子进程继续在 VPS 后台运行直至任务完成。
- **断线无损回填**：当客户端重新连接时，服务端自动回放断开期间缓存在 Ring Buffer 中的事件流。
- **自动内存回收**：当 Agent 子进程无客户端连接且处于空闲状态超过 `IDLE_TIMEOUT_MS`（默认 5 分钟）时，网关将平滑终止该进程释放 VPS 系统资源。
