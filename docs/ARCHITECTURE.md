# 🏛️ Pi-Chat Monorepo 架构设计与系统规范 (Architecture Design)

## 1. 架构目标与全景图

`pi-chat` 是一个采用 **pnpm Workspaces** 进行组织的多端协同大工程（Monorepo）。系统通过标准化通信协议将底层的 Pi Coding Agent 智能体能力解耦并无缝分发至 **Web 浏览器端**、**Android 原生移动端**、**华为鸿蒙原生端** 与 **VPS 桥接网关服务端**。

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

## 2. 核心模块定位与交付形态

整个 Monorepo 包含 **5 个独立且统一协调的交付件**：

| 模块目录 | 交付包名 | 技术栈 | 职责与交付物形态 |
| :--- | :--- | :--- | :--- |
| `packages/protocol/` | `@liguoshuai/pi-chat-protocol` | Node.js ESM / TS | 跨端通信协议 Schema、TS 类型声明、消息验证器 (`.tgz` + NPM Registry) |
| `server/` | `@liguoshuai/pi-chat-server` | Express + WS + SSE | VPS 桥接网关服务，管理 `pi --mode rpc` 子进程池与鉴权 (`.tgz` + CLI) |
| `clients/web/` | `@liguoshuai/pi-web-chat` | HTML5 / CSS3 / ES6 | ChatGPT/Gemini 风格 Web 客户端 (`.tgz` + CLI) |
| `clients/android/` | `pi-chat-android` | Kotlin / Compose | Android 手机原生应用 (`app-debug.apk`) |
| `clients/harmony/` | `pi-chat-harmony` | ArkTS / ArkUI | 华为鸿蒙原生 Stage 移动应用 (`pi-chat-harmony-app.zip` / `.hap`) |

---

## 3. 跨端通信协议与消息生命周期

各端与 VPS 网关之间的通信严格遵循 `@liguoshuai/pi-chat-protocol` 规范：

### 3.1 客户端请求消息 (Client Messages)
- **`prompt`**：发送用户对话提示词及图片附件（`{ type: "prompt", message: string, images?: ImageAttachment[] }`）。
- **`steer`**：在 Agent 思考或执行工具中途注入指导性指令（`{ type: "steer", message: string }`）。
- **`abort`**：中止当前 Agent 执行任务（`{ type: "abort" }`）。
- **`get_state`**：查询当前 Agent 运行状态、当前模型及工作目录。
- **`get_available_models`**：获取当前环境可用的 LLM 模型清单及其特性（🧠 推理、👁️ 视觉、🛠️ 工具）。
- **`set_model`**：即时切换 Agent 使用的 Provider 与模型 ID（`{ type: "set_model", provider: string, modelId: string }`）。
- **`set_thinking_level`**：切换推理深度（`{ type: "set_thinking_level", level: "off"|"minimal"|"low"|"medium"|"high"|"max" }`）。
- **`new_session`**：创建新的对话会话。
- **`switch_session`**：切换到指定历史会话文件。
- **`ping`**：30s 周期性心跳保活。

### 3.2 服务端推送消息 (Server Messages)
- **`agent_start`**：智能体启动思考与应答任务。
- **`agent_stream` / `message_update`**：打字机文本增量与深度思考内容增量（带 `thinking_delta` 标记）。
- **`tool_execution_start`**：工具开始执行（包含工具名称 `toolName` 与参数 `args`）。
- **`tool_execution_update`**：长耗时工具的增量标准输出流。
- **`tool_execution_end`**：工具执行完成（包含执行结果 `result`、耗时与成功状态）。
- **`agent_end` / `agent_settled`**：智能体任务完成并进入待命状态。
- **`backfill_start` / `backfill_end`**：断线重连时的历史增量回填广播。

---

## 4. 安全防护与韧性设计

1. **CSWSH 防护**：网关在握手阶段通过 `isAllowedOrigin` 验证 `Origin` 请求头，严格阻断恶意第三方网页发起的跨站 WebSocket 劫持。
2. **路径遍历防护 (Path Traversal)**：服务端在处理会话文件读取与写入时，通过绝对路径解析与前缀对比，严格限制在合法目录范围内。
3. **统一 Token 鉴权**：在开启 `AUTH_TOKEN` 时，REST 接口、WebSocket 握手及 SSE 连接必须携带正确的 Bearer Token。
4. **环形缓冲区 (Ring Buffer)**：每个 Agent 实例维护环形缓冲区，客户端意外断网或移动端切换网络时，子进程不中断，重连后自动回放全部丢失数据包。
5. **空闲回收与看门狗**：Agent 在无人连接且空闲超过 `IDLE_TIMEOUT_MS`（默认 5 分钟）时自动平滑释放，兼顾内存资源与实时可用性。

---

## 5. CI/CD 流水线与版本锁步机制

1. **多环境自动化测试**：每次 Push/PR 在 Node 18/20/22 下运行全量测试。
2. **Android 产物打包 (`pi-chat-android-apk`)**：全自动编译生成 APK，保留 30 天供随时下载。
3. **NPM 包打包 (`pi-chat-npm-packages`)**：将协议、网关与 Web 客户端自动打包为 `.tgz` 归档。
4. **鸿蒙工程打包 (`pi-chat-harmony-bundle`)**：自动将鸿蒙原生源码归档为 `pi-chat-harmony-app.zip`。
5. **版本发布自动挂载**：打上 `v*` 标签后自动创建 GitHub Release 并挂载全量 5 大交付物。
