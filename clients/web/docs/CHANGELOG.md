# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.10.1] - 2026-09-03

### Fixed
- **HarmonyOS 监听器泄漏修复 (`clients/harmony/.../ChatViewModel.ets`)**：`init()` 每次调用都新增 WebSocket 状态与消息监听器但不移除旧的，导致重复调用时监听器堆积、消息被重复处理。现已保存监听器引用并在重新初始化时先移除旧监听器。
- **HarmonyOS WebSocket 重连竞争修复 (`clients/harmony/.../WebSocketManager.ets`)**：`connect()` 替换已有连接时，旧 socket 的异步 `on('close')` 回调仍会触发 `scheduleReconnect()`，导致连接抖动。现已通过捕获 ws 实例引用，在陈旧回调中跳过重连逻辑。
- **Android WebSocket 连接泄漏修复 (`clients/android/.../WebSocketClient.kt`)**：`connect()` 未关闭已有 WebSocket 连接，在重连场景下旧连接资源泄漏。现已在 `connect()` 开头主动关闭并清理旧连接。
- **Android 协程作用域泄漏修复 (`clients/android/.../ChatRepository.kt` / `ChatViewModel.kt`)**：`reconnect()` 创建新 `ChatRepository` 但未取消旧实例的协程作用域，导致协程泄漏。现已新增 `close()` 方法并在重连时调用。
- **协议层冗余代码清理 (`packages/protocol/src/index.js`)**：`formatDuration` 函数前两个条件分支完全相同，移除冗余的 `ms < 1000` 分支。
- **HarmonyOS 冗余代码清理 (`clients/harmony/.../Index.ets`)**：同步移除 `formatDuration` 中相同的冗余分支。
- **Web 端 Token 泄漏防护 (`clients/web/public/app.js`)**：从 URL 提取 auth token 后立即使用 `history.replaceState` 清除 URL 中的 token 参数，防止通过 Referer 头、截图或分享链接泄漏。
- **Web 端代码围栏匹配修复 (`clients/web/public/app.js`)**：`renderMarkdown` 中 ```` 围栏匹配改为仅在行首匹配，避免将行内三反引号误判为代码围栏。
- **Web 端 SVG 元素命名空间修复 (`clients/web/public/app.js`)**：DOM 辅助函数 `el()` 对 SVG 标签使用 `createElementNS` 创建，修复 SVG 图标渲染问题。
- **Web 端发送失败处理增强 (`clients/web/public/app.js`)**：`sendWs` 返回布尔值，`submitPrompt` 在 WebSocket 断开时回退流式状态并提示用户，`setComposerAborting(true)` 正确设置 `state.aborting`。
- **Android API 基址规范化 (`clients/android/.../ApiService.kt`)**：构造函数中自动去除 `baseUrl` 尾部斜杠，避免拼接出双斜杠 URL。

### Changed
- 全端版本号统一递增至 2.10.1（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.10.0] - 2026-09-02

### Added & Aligned
- **Android 原生客户端与移动 Web 端全要素对齐 (`clients/android`)**：
  - **顶部栏元素完整对齐 (TopBar Alignment)**：
    - 新增 **工作目录胶囊按钮 (CWD Pill)**：展示当前工作目录，点击弹出工作目录切换对话框（包含路径输入与 `~`, `~/.pi`, `/tmp` 快捷芯片）。
    - 新增 **模型选择胶囊按钮 (Model Pill)**：展示当前模型名称与 `★ 默认` 徽章，点击弹出支持搜索、厂商归类、能力标签（🧠 推理、👁️ 视觉、🛠️ 工具）的模型选择对话框。
    - 新增 **深度思考级别胶囊按钮 (Thinking Pill)**：展示当前思考深度，点击弹出 `Off`、`Minimal`、`Low`、`Medium`、`High`、`Max` 等推理级别选择对话框。
    - 新增 **会话导出按钮 (Export Chat)**：一键将完整对话导出为标准 Markdown 格式并唤起系统分享。
    - **设置入口单点统一**：移除侧边抽屉顶部多余的重复设置按钮，保留顶部栏统一单一设置入口，避免操作歧义。
  - **空白引导页全要素对齐 (Empty State Alignment)**：
    - 引入 `π` 经典头像与提示文案。
    - 引入 **当前模型信息横幅 (Empty Model Banner)**：展示当前模型名称、默认徽章、🧠 思考 / 👁️ 视觉 / 🛠️ 工具能力标签及“切换模型”快捷按钮。
    - 引入 **快捷指令芯片 (Suggestion Chips)**：提供“列出当前目录文件”、“总结这个项目”、“代码审查”等一键触发指令。
  - **底部输入区域与富文本展示对齐 (Composer & Message Bubbles)**：
    - 增加待发送附件预览栏（带缩略图与删除 `✕` 按钮）。
    - 增加图片全屏查看画廊模式 (Image Lightbox Modal)。
    - 助手回复内容 Markdown 解析优化，代码块增加语言标签与“复制代码”独立按钮。
    - 增加底部操作提示文案：“pi 会执行命令与读写你的文件 —— 请注意操作内容。”

### Changed
- 全端版本号统一递增至 2.10.0（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.9.1] - 2026-09-02

### Fixed & Optimized
- **网关路由健壮性增强 (`server/src/routes.js`)**：修复 `/api/sessions` 历史会话列表中若存在数值格式时间戳导致 `localeCompare` 抛错的问题，优化为安全兼容数字与 ISO 字符串的多格式时间戳倒序排列。
- **Web 前端异常流式保护 (`clients/web/public/app.js`)**：在 WebSocket 消息处理中补充对 `error` 与 `pi_exit` 事件的完备响应，遇到异常时自动终结流式状态、解除输入框锁定并提示用户。
- **Android 原生端异常退出流式重置 (`clients/android`)**：`ChatRepository.kt` 补充对 `error` 和 `pi_exit` 事件的处理，避免在子进程异常退出时状态滞留在流式中。
- **HarmonyOS 原生端异常流式重置 (`clients/harmony`)**：`ChatViewModel.ets` 补充对 `error` 和 `pi_exit` 事件的处理，确保鸿蒙界面在异常中断时能正常完成并释放输入。
- **跨端通信协议 Schema 完备性更新 (`packages/protocol/src/schema.json`)**：补充 `remote_user_steer` 与 `extension_ui_request` 到服务端消息类型枚举定义。

### Changed
- 全端版本号统一递增至 2.9.1（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.9.0] - 2026-09-02

### Added
- **思考耗时与执行耗时多端展示特性 (Thinking & Execution Duration Display)**：
  - **Web 端 (`clients/web`)**：
    - 思考过程块 (`.thinking-block`)：流式思考进行中实时显示动态耗时（例如 `3.2s`），思考完成显示完整用时徽章（例如 `用时 3.2s`）。
    - 工具执行块 (`.tool-block`)：执行中显示动态计时（例如 `执行中 · 1.2s`），执行完毕显示最终耗时（例如 `完成 · 1.2s` 或 `错误 · 0.8s`）。
    - 助手回复消息头部 (`.role-tag`)：实时显示本次回答生成总耗时，并在生成完成后展示总耗时（例如 `耗时 4.5s`）。
    - 历史会话加载 (`reconstructFromEntries`)：支持自动从历史日志计算各工具调用耗时与助手生成总耗时并渲染。
  - **Android 原生端 (`clients/android`)**：
    - `ChatMessage` 与 `ToolCall` 模型扩充思考用时 (`thinkingDurationMs`) 与执行耗时 (`durationMs`, `turnDurationMs`) 属性。
    - Compose 界面中的 `ThinkingBlock`、`ToolCallBlock` 以及 `MessageBubble` 均支持清晰展示思考耗时、工具执行耗时与回答生成总用时。
    - 历史会话加载支持还原思考与工具执行耗时。
  - **HarmonyOS 鸿蒙原生端 (`clients/harmony`)**：
    - `ChatMessage` 增加 `thinkingDuration` 与 `turnDuration` 属性支持。
    - `Index.ets` 在思考过程与助手回复头部优雅展示思考耗时与执行总耗时。
  - **跨端协议与公共库 (`@liguoshuai/pi-chat-protocol`)**：
    - 新增跨端标准耗时格式化函数 `formatDuration(ms)` 与单元测试。

### Changed
- 全端版本号统一升级至 2.9.0（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.8.0] - 2026-09-02

### Added
- 前端思考过程与工具调用块时间戳显示：在思考过程块和工具调用块中添加时间戳，格式为当天 HH:mm，跨天 MM-dd HH:mm。

## [2.7.0] - 2026-09-01

### Added
- **网关 REST CORS 跨域支持与预检支持 (`server`)**：
  - 在 Express 网关服务中增加标准 CORS 拦截器，支持自定义 `ALLOWED_ORIGINS` 配置与通配放行，支持 `OPTIONS` preflight 预检请求与相关请求头（`Authorization`, `Content-Type`, `x-api-token`）。
- **服务端环境变量自动检测与多宿主兼容 (`server`)**：
  - 服务端配置模块增加自动检测并读取根目录或包内 `.env` 文件的能力。
  - 完善 Windows 宿主机上的 `pi` 执行文件解析（`.cmd` / `.exe`）与 `spawn` 平台兼容性。
- **Web 端 PWA (Progressive Web App) 支持 (`clients/web`)**：
  - 新增 `manifest.webmanifest` 与高清矢量 `icon.svg`，支持在手机与桌面浏览器中一键“添加到主屏幕”，享受沉浸式应用体验。
- **移动端指数退避断线重连 (`clients/android` & `clients/harmony`)**：
  - Android 原生端 (`WebSocketClient.kt`) 与 HarmonyOS 鸿蒙原生端 (`WebSocketManager.ets`) 统一引入 Exponential Backoff + Jitter（指数退避与随机抖动重连算法），有效防止服务端重启或网络抖动时的瞬时并发重连风暴。
- **CI 工作流强化 (`.github/workflows/ci.yml`)**：
  - 在 GitHub Actions 中增加 Android 原生端自动化构建与依赖检查（`gradlew assembleDebug`）。

### Changed
- 全端版本号统一升级至 2.7.0（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.6.0] - 2026-09-01

### Added
- **跨端协议增强与强类型声明 (`@liguoshuai/pi-chat-protocol`)**：
  - 新增 `createBackfillStartMessage` 与 `createBackfillEndMessage` 协议消息构造器，支持在断线重连回放中透传 `overflowed` 标志。
  - 新增 `ToolCallPayload` 与 `ToolResultPayload` 强类型接口，增强跨端工具调用的类型安全性。
  - 在 Android (`PiChatProtocol.kt`) 与 HarmonyOS (`PiProtocol.ets`) 客户端协议模型中同步补齐 `overflowed` 等字段。
- **网关断线溢出检测与客户端自愈补偿 (`server` & `clients/web`)**：
  - 网关 `PiAgent` 增加事件环形缓冲区溢出状态跟踪（`hasBufferOverflowed`），在客户端重连事件回放结束（`backfill_end`）时明确通知客户端。
  - Web 客户端侦测到 `overflowed: true` 时，自动在后台触发增量/完整历史记录无感同步（`syncSessionHistory`），彻底杜绝网络严重抖动或长时间离线导致的消息截断。
- **Web 前端流式渲染性能与快捷键体验优化 (`clients/web`)**：
  - 流式更新渲染全面统一采用 `requestAnimationFrame` 防抖批量刷新（`refreshStreamingContentDebounced`），消除高频 token 吐出时的页面重排重绘瓶颈。
  - 新增 `Cmd/Ctrl + Shift + O` 快捷新建会话别名，适配主流 AI 交互习惯。

### Changed
- 全端版本号统一升级至 2.6.0（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.5.1] - 2026-09-01

### Added
- **AI Coding Agent 工作指南与工程规范 (`AGENTS.md` & `CLAUDE.md`)**：
  - 确立三大强制铁律：工作前必拉取远端主干（`git pull origin main`）、任何修改必递增 SemVer 语义化版本号并在 Web 与各客户端正确呈现、任务完成必通过全量测试并提交推送至远端。
  - 制定 Monorepo 全仓版本同步清单（Lockstep）与多端版本呈现规范。
- **客户端版本号呈现强化**：
  - Android 原生端：启用 `buildConfig = true`，在侧边栏抽屉底部及后端配置对话框中通过 `BuildConfig.VERSION_NAME` 实时展示客户端版本号（`v2.5.1`）。
  - HarmonyOS 鸿蒙原生端：在侧边栏底部展示应用版本号（`v2.5.1`）。
  - Web 端：通过网关 `/api/config` 动态获取并在侧边栏底部 `#appVersion` 区域正确展示当前版本号（`v2.5.1`）。

### Changed
- 全端版本号统一升级至 2.5.1（Root / Protocol / Server / Web / Android / HarmonyOS）。

---

## [2.5.0] - 2026-09-01

### Added
- Android 端聊天消息、思考过程与工具执行块均显示时间戳（当天 `HH:mm`，跨天 `MM-dd HH:mm`）。
- Android 端新增工具执行渲染（`tool_execution_start/update/end`）：展示工具名、参数、结果与执行状态（执行中/完成/错误）。
- 用户消息头部显示 `user`，助手消息头部显示 `pi`。

### Changed
- Android 端会话列表在新建会话、`agent_start`/`agent_settled`、切换会话及服务端返回 `sessionFile` 时即时刷新，新会话更快出现在侧边栏。
- 全端版本号统一升级至 2.5.0。

## [2.4.1] - 2026-09-01

### Fixed
- **彻底解决新建对话中断已有后台任务的问题**：
  - 修复了 `startNewSession` 在已有活动 WebSocket 连接上直接发送 `new_session` RPC 指令导致原有会话子进程被重置与中断的问题。新建会话时安全断开当前连接（原会话保持后台运行），并为新会话连接独立的无状态 Agent。
  - 服务端网关 `NEW_SESSION` 与 `SWITCH_SESSION` 消息处理器增加安全解绑（detach）逻辑，避免跨会话指令误触或覆盖已有活跃 Agent 进程。
- **精准修复老会话误判为“运行中”的状态异常**：
  - 严格区分进程资源防回收判定（`isBusy`，包含 pending 异步请求）与真实 AI 流式生成状态（`isStreaming`，严格对应 `state === 'streaming'`）。
  - 服务端 `/api/sessions` 接口与 `backfill_end` 状态同步均修正为读取 `isStreaming`，彻底杜绝老会话连接时因 `get_state`/`get_available_models` 临时 pending 导致误判为“运行中”的问题。
  - 优化了事件环形缓存机制：会话生成结束收敛（`agent_settled`）后彻底清空缓冲区，且仅在流式生成期间缓存事件，避免非流式 RPC 响应污染回放缓冲区导致前端误进入流式状态。
  - 前端 `updateState` 及侧边栏会话路径比对增加统一路径规范化匹配（`sameSession`），避免路径形式差异导致草稿会话残留或状态错乱。

---

## [2.4.0] - 2026-08-31

### Fixed & Improved
- **后台异步长任务稳定性与持久化机制全面强化 (Background Async Persistence & Lifetime Fix)**：
  - **移除 30 分钟无条件强杀定时器**：将 `MAX_AGENT_LIFETIME_MS` 默认设为 `0`（禁用硬超时杀进程）。若用户配置了正数生命周期上限，也会严格判断 `isBusy`（正在生成/执行工具中）与 `hasListeners`（仍有客户端监听），任务执行期间绝不强杀子进程。
  - **扩大离线事件环形缓冲区**：将 `EVENT_BUFFER_SIZE` 默认容量从 2000 提升至 5000，保障长时间后台离线输出不丢帧。
- **Web 端平滑多任务切换与静默转入后台 (Seamless Background Session Switch)**：
  - 移除了在生成过程中新建会话（`startNewSession`）或侧边栏切换会话（`loadSession`）时的强制中断（`abortGeneration()`）逻辑。
  - 切换或新建会话时，原会话平滑转入后台静默继续执行，并弹出轻提示告知用户。
  - 修复了断线重连（`ws.onopen`）与离线事件增量回放（Backfill）之间的 DOM 渲染竞态条件，避免流式内容被意外清除。
- **侧边栏会话后台执行状态感知 (Sidebar Background Execution Indicator)**：
  - 服务端 `/api/sessions` 接口扩展返回 `isStreaming` 状态字段，精准反馈每个会话对应的后台 Agent 是否正在忙碌。
  - Web 端侧边栏为正在后台生成中的会话实时展示 `⚡ 运行中` 呼吸动画状态徽标。
  - 页面可见性恢复（`visibilitychange`）及定时后台状态轮询自动刷新各会话状态。

---

## [2.2.0] - 2026-08-30

### Fixed & Improved
- **服务端会话路径解析与遍历安全加固 (Session Path Resolution & Security)**：
  - 修复了 `/api/session`（GET 与 DELETE）在处理会话相对路径时由于错误相对路径基准导致的误拦截（403 Forbidden），增强为相对于 `config.sessionsDir` 的安全解析并保留严格的路径越界校验与符号链接真实路径防穿透防护。
  - 会话扫描增强为多层级安全目录递归遍历（`listAllSessionFiles`），支持更深的会话目录结构与符号链接解析。
  - 为服务端 `sessionMetadataCache` 增加 LRU/最大条目上限限制（5000条），防止长期运行内存泄漏。
- **服务端网关稳健性与跨平台优化 (Gateway Robustness & Cross-Platform)**：
  - 完善了 WebSocket 握手鉴权响应对请求 `id` 的透传关联，优化了 `PING`/`heartbeat` 的 ID 支持。
  - 规范了 `PROMPT` 消息中的 `message` 字符串与 `images` 数组格式，防止向 Pi 进程传递 `undefined`。
  - 改进了 SSE 客户端异常断开时的错误捕获与失效监听器及时清理。
  - 增强了 `resolvePiBin` 的跨平台检测路径，支持 macOS Homebrew、Linux `~/.local/bin`、`~/.cargo/bin` 等常见环境。
- **Web 端多端同步与渲染优化 (Web UI & Markdown Rendering)**：
  - 修复了 `remote_user_prompt` 事件未同步呈现多端上传的 `images` 附件的问题。
  - 修复了 Markdown 解析器中 URL 包含查询参数时因多次转义造成的双重转义（Double Escaping）问题，并支持 `mailto:` 链接解析。
- **协议库与 TypeScript 类型定义完善 (`@liguoshuai/pi-chat-protocol`)**：
  - 新增 `createSetSessionNameMessage`、`createGetEntriesMessage`、`createGetStateMessage`、`createGetAvailableModelsMessage`、`createExtensionUiResponseMessage` 辅助构造方法。
  - 增强了 `SET_SESSION_NAME` 与 `SET_THINKING_LEVEL` 的数据校验与 TypeScript 类型声明。

---

## [2.1.0] - 2026-08-30

### Fixed & Improved
- **移动端流式打字与思考过程实时渲染修复 (Mobile Streaming & Thinking Render Fix)**：
  - 在 `@liguoshuai/pi-chat-protocol`、Android 和 HarmonyOS 原生客户端中完善了 `assistantMessageEvent` 结构解析，修复了移动端在 AI 回复生成期间无法接收 `text_delta` 与 `thinking_delta` 流式打字效果的问题。
- **移动端历史会话转录加载修复 (Mobile Session History Restore)**：
  - 在 Android (`ApiService`) 与 HarmonyOS (`HttpService`) 中新增了 `/api/session?file=...` 接口调用，在切换会话时自动还原历史聊天气泡。
- **Web 端 401 鉴权重连修复 (Web Re-Auth Fix)**：
  - 修复了 `app.js` 中弹窗输入 Token 后调用未定义 `initWebSocket` 导致 `ReferenceError` 的异常，改为正确调用 `connectWs`。
- **服务端网关 RPC ID 保持与进程管理增强 (Gateway RPC ID & Lifecycle Improvements)**：
  - 修复了网关转发指令时丢失客户端 `id` 的问题，确保 RPC 请求响应精确关联。
  - 增强了 IPv6 Localhost 跨域兼容性支持与死连接自动清理。
  - 补充了 `@liguoshuai/pi-chat-protocol` 中的 `createSetThinkingLevelMessage` 与 `createCycleThinkingLevelMessage` 辅助方法。

---

## [2.0.0] - 2026-08-30

### Major Architecture Refactoring (Monorepo & Multi-Client Ecosystem)
- **Monorepo 多端大仓库架构升级**：
  - 项目重构为 `pi-chat` Monorepo，采用 pnpm Workspaces 进行多包统一管理。
  - 核心架构拆分为 `clients/web`、`clients/android`、`clients/harmony`、`server`（VPS 网关）与 `packages/protocol`（跨端共享协议）。
- **服务端网关统一解耦与单真源设计 (`@pi-chat/server`)**：
  - 提取 `@pi-chat/server` 为统一后端网关核心，支持全双工 WebSocket、SSE 打字机增量推送（`/api/stream`）、多端统一 Token 鉴权（`AUTH_TOKEN`）、30s 心跳保活与空闲进程内存自动回收。
  - `clients/web/server.js` 瘦身为极简适配层，保持对 `@liguoshuai/pi-web-chat` npm 发行版及 `pi-web-chat` 全局 CLI 的 100% 独立向后兼容。
- **Android 原生端应用骨架 (`clients/android`)**：
  - 基于 Kotlin + Jetpack Compose + Material 3 + OkHttp WebSocket + Coroutines/StateFlow 搭建，支持生成 APK 安装包。
- **华为鸿蒙 OS 原生端应用骨架 (`clients/harmony`)**：
  - 基于 ArkTS + 声明式 ArkUI (Stage 模型，API 12+) + `@ohos.net.webSocket` 搭建，支持生成 HAP 安装包。
- **跨端标准通信协议 (`@pi-chat/protocol`)**：
  - 统一 JSON Schema 标准、TypeScript 定义与自动容错校验器，三端交互格式完全对齐。

---

### Added & Published
- **NPM 官方包发布与全局命令行安装支持 (Official NPM Package & Global CLI)**：
  - 正式发布软件包至 npm 官方注册表（[`@liguoshuai/pi-web-chat`](https://www.npmjs.com/package/@liguoshuai/pi-web-chat)），支持通过 `npm i -g @liguoshuai/pi-web-chat` 或 `pnpm add -g @liguoshuai/pi-web-chat` 全局安装并随时随地使用 `pi-web-chat` 命令启动。
  - 支持通过 `npx @liguoshuai/pi-web-chat` 免安装即时启动，并在 README 中完善了全局安装、npx 启动与源码安装三种模式的快速指引。

### Fixed & Improved
- **移动端附件导入功能全面重构与修复 (Mobile Attachment Import Fix)**：
  - **移动端文件选择器唤起修复**：将上传触发器重构为标准可访问的 `<label for="imageFileInput">` 并配合 CSS `.sr-only-file-input`，彻底解决 iOS Safari、Android Chrome、移动端 WebView 及微信内置浏览器中因 `display: none` 导致异步 JS `.click()` 被浏览器安全策略拦截而无法调起系统相册/文件选择器的问题。
  - **移动端格式与相机照片兼容性**：扩展对 iOS HEIC/HEIF 相机原图、AVIF、ICO、SVG 及大写扩展名的识别与支持。
  - **移动端高清原图智能压缩降采样 (Client-side Downscale)**：针对手机拍摄的超高分辨率照片（12MP~48MP），自动使用 Canvas 进行等比下采样（最大 2048px）与高质量编码压缩，防止超大 Base64 数据挤爆移动端内存或造成 WebSocket 通信中断，同时确保所有主流大模型 Vision API 稳定解析。
  - **文本与源码文件附件导入支持 (Text & Code Attachment Parsing)**：支持通过附件按钮、拖拽或剪贴板直接导入 `.py`、`.js`、`.json`、`.md`、`.txt`、`.log` 等各类代码和文本附件，自动提取并按对应语言 Markdown 代码块注入输入框。
  - **预览交互与触控体验优化 (Touch UX & Preview Lightbox)**：输入框待发送图片缩略图支持点击直接弹出 Lightbox 大图预览，加大移动端单张删除按钮的触控热区（22px）与操作反馈。

---

## [1.10.2] - 2026-08-30

### Fixed & Improved
- **移动端顶栏排版与信息密度重构 (Mobile Topbar UX)**：
  - 在移动端隐藏多余的会话名截断占位，隐藏导出按钮文字标签仅保留操作图标，为工作目录与模型选择胶囊腾出充足显示空间。
  - 优化移动端触控胶囊布局与间距，杜绝文字极端挤压和残缺问题。
- **欢迎区与模型卡片响应式布局优化 (Empty State & Model Banner)**：
  - 优化欢迎引导文案，兼容移动端抽屉式侧边栏交互。
  - 为 `★ 默认模型` 徽标增加专用样式并强制单行禁止折行，彻底消除断词分行问题。
  - 修复模型卡片在移动端下的左右对齐与视觉比例，“切换模型”按钮平滑对齐。
  - 优化快捷推荐指令标签（Suggestions Chips），支持移动端优雅折行排版。
- **移动端输入框与占位提示适配 (Composer Mobile Adaptation)**：
  - 移动端自动使用精简的 Placeholder 提示文案，彻底解决长提示在窄屏单行输入框下文字被腰斩截断的问题。
  - 增强底部操作区全面屏手势安全区（`safe-area-inset-bottom`）适配。

---

## [1.10.1] - 2026-08-30

### Improved
- **附件上传图标与交互优化 (Attachment Icon & UX)**：
  - 将输入框上传图标更换为美观清晰的标准曲别针附件矢量图标（Paperclip 📎）。
  - 优化按钮尺寸（`32px × 32px` 标准圆形）、对称内边距与悬停/按压交互动效。
- **文件与拖拽兼容性增强 (Upload Compatibility)**：
  - 完善文件类型扩展（支持 `image/*` 及 `.png, .jpg, .jpeg, .webp, .gif, .bmp, .svg, .ico, .avif`）。
  - 增强 MIME 类型缺失时的扩展名自动推断与回退处理机制。
  - 增加全局 Drag & Drop 默认事件拦截，防止图片拖拽偏离输入框时误触浏览器页面跳转。

---

## [1.10.0] - 2026-08-30

### Security
- **WebSocket 跨站劫持 (CSWSH) 防护与 Origin 校验**：
  - 在 `server.js` 增加 `verifyClient` 来源校验，严格拦截非授权外部网页发起的跨域 WebSocket 连接，防御针对本地服务与命令执行的 CSWSH 攻击。
  - 支持同源、`localhost`、`127.0.0.1` 及通过 `ALLOWED_ORIGINS` 环境变量配置的反向代理域名白名单。
- **路径与系统配置写入加固**：
  - 加固 `/api/set-default-model` 接口，严格校验客户端传入的目标工作目录，防止任意路径操作。
- **Markdown 链接协议与属性逃逸 XSS 防护**：
  - 增强链接协议校验（仅允许 `http:`、`https:`、`mailto:`），修复 URL 包含特定引号实体时在属性反转义下的 XSS 逃逸隐患。

### Added
- **多模态图片输入与预览支持 (Multimodal Image Attachments & Lightbox)**：
  - 输入框支持截图粘贴（`Ctrl+V` / `Cmd+V`）、本地图片文件拖拽（Drag & Drop）以及附件图标上传。
  - 输入框上方显示待发送图片缩略图胶囊，支持单张移除。
  - 消息气泡中支持渲染用户上传的多张图片缩略图，点击可弹出全屏大图预览（Lightbox）。
  - 加载历史会话记录时自动提取并渲染历史消息中的图片附件。
- **对话导出为 Markdown 功能 (Export Chat as Markdown)**：
  - 顶栏新增“导出”按钮，一键将当前会话（包含会话名称、模型信息、工作目录、思考过程、工具调用与对话正文）导出为标准 Markdown（`.md`）文件下载。
- **全局快捷键扩充 (Keyboard Shortcuts)**：
  - `Ctrl/Cmd + Shift + N`：快速新建会话。
  - `Ctrl/Cmd + K` 或 `Ctrl + /`：快速聚焦侧边栏搜索框。
  - `Ctrl/Cmd + B`：快速切换侧边栏展开/折叠。
  - `Escape`：支持快速关闭大图预览、搜索框失焦、关闭菜单及模态框。
- **侧边栏搜索体验优化**：
  - 搜索结果为空时展示“未找到匹配的会话”空提示。
  - 会话列表刷新时自动保持当前搜索过滤词。
- **自动化单元测试套件**：
  - 新增基于 `node --test` 的单元测试，覆盖安全规则、Origin 校验与路径穿越检查。

### Changed
- **段落排版与换行优化**：Markdown 段落内单换行符自动转为 `<br>`，优化 AI 输出文本的行间结构与排版体验。
- **跨平台工程化优化**：优化 `package.json` 中的 `prepare` 脚本，避免 Windows 下执行 `chmod` 报错；将 `rpctest.mjs` 整理归入 `scripts/` 目录。

---

## [1.9.1] - 2026-08-29

### Added
- **侧边栏底部开源项目跳转链接 (Repository Link in Sidebar Bottom)**：
  - 在侧边栏底部元信息区域增加 `pi-web-chat` 项目开源仓库链接（`https://github.com/liguoshuai-1990/pi-web-chat`），方便用户快速跳转与查阅源码。

---

## [1.9.0] - 2026-08-29

### Added
- **历史对话删除功能 (Session Deletion & Auto Process Cleanup)**：
  - 后端新增 `DELETE /api/session` 接口，支持通过文件路径删除历史 JSONL 会话记录，并带有严格的会话目录越界与路径穿越安全校验。
  - 删除会话时自动清理后端内存元数据缓存，并自动停止与回收当前会话所绑定的常驻后台 Pi 代理子进程。
  - 前端侧边栏会话列表新增垃圾桶删除按钮（桌面端 Hover 显示，移动端常驻展示），点击后带有确认拦截提示，防止误删。
  - 删除当前正在查看/进行的会话时，自动重置为空白新会话并清理 URL 参数与流式状态；删除其他会话时无感刷新会话列表。
- **左侧栏拖拽缩放宽度特性 (Resizable Sidebar with Dragging)**：
  - 左侧边栏新增右侧边缘拖拽把手（`#sidebarResizer`），支持鼠标及触控指针拖拽自由调节侧边栏宽度（180px - 自适应上限）。
  - 基于 Pointer Capture API 与 `--sidebar-width` 动态 CSS 变量实现 60fps 丝滑拖拽缩放体验，并消除文本误选与拖动延迟。
  - 侧边栏折叠与展开动画完全自适应动态设置的侧边栏宽度，避免折叠时发生截断或残留。
  - 支持双击拖拽把手快速重置回默认宽度（260px），并通过 `localStorage` 自动持久化保存用户自定宽度偏好。
  - 优化移动端响应式，移动端抽屉侧栏下自动禁用并隐藏桌面端拖拽把手。

---

## [1.8.9] - 2026-08-29

### Fixed
- **Markdown 下划线变量与标识符渲染保护 (Markdown Identifier & Underscore Parsing Protection)**：
  - 优化行内 Markdown 解析器，限定下划线 `_` 仅在非单词边界（空格/标点包裹）时触发斜体，防止编程标识符与文件名（如 `user_id_list`、`process.env.NODE_ENV`）被误切分解析为斜体。
  - 优化加粗与嵌套斜体（`**bold and *italic***`）的非贪婪匹配规则。
- **移动端模型选择菜单支持“设为默认” (Mobile Model Selector 'Set Default' Accessibility)**：
  - 在移动端媒体查询下保持 `.btn-set-default` 可见（`opacity: 1`），修复手机端因缺少 hover 无法将模型设为全局默认的问题。
- **工具调用头部与顶栏弹性布局溢出保护 (Tool Block & Topbar Flex Overflow Protection)**：
  - 给 `.tool-head .args` 增加 `min-width: 0`，防止长命令/长文件路径将右侧“复制”按钮与“执行状态”标签挤出卡片。
  - 给桌面端 `.topbar .session-name` 增加 `min-width: 0`，防止窄屏下超长会话标题破坏顶栏胶囊布局。

---

## [1.8.8] - 2026-08-29

### Fixed
- **消息发送框确认按钮上下居中与正圆对齐优化 (Composer Send Button Alignment & Circular Sizing)**：
  - 修复默认单行输入状态下，发送按钮因与 `textarea` 存在高度差并在 `flex-end` 布局下导致严重偏下、没有垂直居中的问题。
  - 精准对齐单行 `textarea` 高度（32px）与按钮高度（32px），使单行状态下发送/确认按钮在输入框内绝对垂直居中，多行输入时依然平滑吸底。
  - 将桌面端发送按钮修正为标准正圆（`32px × 32px`，`border-radius: 50%`），并补充字号与行高约束，确保图标居中且不影响手机侧及响应式体验。

---

## [1.8.5] - 2026-08-23

### Fixed
- **中止/终止生成按钮逻辑修复 (Abort Button Logic & UX Fix)**：
  - 修复生成过程中点击终止按钮（`■`）时，因输入框为空触发提前返回（`if (!text) return`）导致无法发出 `abort` 信号的问题。
  - 抽离独立的 `abortGeneration()` 统一处理中断生成流程，确保点击停止按钮无条件触发任务终止。
  - 修复输入框有草稿时点击停止按钮误触发 `steer`（插入指令）的问题，明确区分停止按钮与插入指令按钮职责。
  - 新增中止中即时视觉反馈（按钮变为等待状态 `⏳`，输入框边缘高亮变红，提示文字变更为“中止当前任务中…”），并在底层 `agent_settled` 或 `abort` 响应后安全恢复。
  - 支持在生成过程中按 `Escape` 键快速中止当前任务（模态框或菜单打开时除外）。
  - 在新建会话及切换会话时，若当前任务正在运行中，自动先行中断当前流式任务以避免后台状态错乱。

---

## [1.8.4] - 2026-07-26

### Added
- **Markdown 渲染能力增强 (Markdown Enhancements: HR, Strikethrough & Task Checkboxes)**：
  - 支持标准 Markdown 水平分割线（`---`、`***`、`___`）渲染为 `<hr>` 标签。
  - 支持删除线语法（`~~strikethrough~~`）渲染为 `<del>` 标签。
  - 支持任务列表复选框（`- [ ]` 与 `- [x]`）及加号无序列表（`+ item`）。
  - 为 `h4`、`h5`、`h6`、`hr`、`del` 及任务复选框补充了精细的暗色主题 CSS 样式。

### Fixed
- **移动端息屏/切出恢复后历史消息自动同步 (Mobile Reconnect Session Auto-Sync)**：
  - 修复手机端在后台挂起或息屏后切回页面时，未能及时同步后台已生成完毕的最新回复内容的问题。
  - 增加 `syncSessionHistory` 历史同步机制，并在 `ws.onopen`、`visibilitychange` 与 `pageshow` 事件中自动拉取磁盘最新消息渲染至对话区。
  - 优化 `backfill_start` / `backfill_end` 流式状态重置，保障后台生成途中切回时无缝追平实时生成内容。
- **未绑定会话孤儿子进程即时回收 (Immediate Cleanup of Unkeyed Idle Agents)**：当客户端打开新建会话页面但未发送消息即关闭或切换时，后端未分配 Session Key 的孤立 `PiAgent` 进程在连接断开后立即释放，避免占用 5 分钟闲置内存。
- **切换与加载历史会话时工作目录自动同步 (Session CWD Auto-Sync)**：点击侧边栏或通过 URL 参数（`?session=...`）打开会话时，自动将 `state.cwd` 同步为会话真实的 `data.header.cwd`，确保 Agent 执行环境与会话一致。
- **工作目录变更后项目级默认配置实时重载 (Project Settings Live Reload on CWD Change)**：切换工作目录时重新获取 `/api/config?cwd=...`，确保项目根目录下的 `.pi/settings.json` 模型配置即时生效。
- **波浪号路径解析规范化 (Tilde `~` Path Resolution Normalization)**：服务端引入统一的 `normalizePath`，确保会话参数与路径校验中包含的 `~` 家目录前缀能被正确展开并绝对化。
- **历史错误消息展示保护 (Error Notice on Historical Failed Messages)**：修复历史会话中若生成中途报错中断时未能渲染失败提示条的问题。
- **Package.json 发布字段补充 (Scripts Directory Inclusion)**：在 `package.json` 的 `files` 字段中加入 `scripts/` 目录，确保 Systemd 服务脚本正常打包发布。

---

## [1.8.3] - 2026-07-26

### Fixed
- **移动端工作目录切换弹窗按钮溢出修复 (CWD Modal Mobile Overflow & Input Sizing)**：
  - 修复手机端切换工作目录弹窗中“确定切换”按钮超出卡片右侧边框的问题。
  - 为 `.input-group input` 添加 `min-width: 0` 和 `box-sizing: border-box`，消除原生 input 元素的内在最小宽度导致的 Flexbox 溢出。
  - 适配移动端弹窗内边距与间距（padding 降至 16px），并在 `<= 380px` 窄屏设备上自适应将按钮折行全宽呈现，防止水平溢出。

---

## [1.8.2] - 2026-07-26

### Fixed
- **移动端顶栏空间挤压与思考胶囊截断修复 (Mobile Topbar Layout & Thinking Pill Overflow)**：
  - 移除移动端 `.model-pill-container` 的固定 `max-width: 130px` 宽度限制，修复深度思考胶囊被挤压截断、只显示一半图标的问题。
  - 优化移动端顶栏各元素间距与自适应弹性缩放：侧边栏菜单按钮调整为 36px，工作目录胶囊最大宽度限制为 75px，模型胶囊适度收敛文字并隐藏默认徽章，思考胶囊保留完整图标与级别文本。
  - 增加对 `<= 360px` 极窄小屏设备的精细化响应式适配规则，保障全尺寸移动端设备顶部操作栏整齐美观且不换行、不溢出。

---

## [1.8.1] - 2026-07-26

### Fixed
- **模型切换系统通知未定义函数报错修复 (Missing appendSystemNotice ReferenceError)**：补充前端 `appendSystemNotice` 函数实现，使用 `.system-notice-divider` 与 `.system-notice-text` 渲染模型变更系统提示，解决切换模型时触发 `ReferenceError` 的问题。
- **思考深度循环切换响应数据字段适配 (cycle_thinking_level Response Handling)**：兼容 Pi RPC 响应中返回的 `data.level` 字段，避免因字段名不匹配导致思考深度未能及时更新。
- **会话自定义命名解析与侧边栏即时呈现 (Session Name & session_info Extraction)**：服务端 `/api/sessions` 与 `/api/session` 增加对 `session_info` 记录的解析，支持读取用户通过 `set_session_name` 设置的会话名称并在侧边栏和顶栏直观显示。
- **默认模型设为已启用模型列表防回退保护 (enabledModels Sync on Set Default)**：在写入 `defaultModel` 时同步检查并加入 `enabledModels` 列表，防止 Pi core 启动时回退至 `enabledModels[0]`。
- **会话历史加载异常容错与提示 (Session Load Error Handling)**：`loadSession` 增加网络及文件读取异常判断与 Toast 友好提示，避免读取异常会话文件时界面卡死。
- **Systemd User 单元文件权限沙箱配置优化 (Systemd Unit Workspace Access)**：移除 `ProtectHome=read-only`，确保作为用户级服务启动时 Pi Agent 可以正常读写和编辑工作区项目文件。

---

## [1.8.0] - 2026-07-26

### Added
- **默认模型确认与展示体系 (Default Model Identification & Visual Indicators)**：
  - 后端 `/api/config` 自动读取并整合项目配置 `<cwd>/.pi/settings.json` 与全局配置 `~/.pi/agent/settings.json` 中的 `defaultProvider`、`defaultModel` 及 `defaultThinkingLevel`。
  - 顶部模型胶囊 (Model Pill) 自动识别并展示 `★ 默认` 或 `★ 项目默认` 徽章，悬停提示详细配置来源。
  - 新建对话欢迎面板 (Empty State) 增加当前会话模型展示卡片，直观呈现模型名称、默认状态及特性标签。
- **深度思考 (Thinking / Reasoning) 联动选择器**：
  - 当模型支持推理思考（`reasoning: true`）时，顶栏自动浮现 `🧠 High` / `🧠 Medium` 等深度思考胶囊。
  - 支持快捷弹出思考深度菜单（Off / Minimal / Low / Medium / High / Max），即时调节思考预算；非思考模型自动隐藏。
- **一键持久化设为默认模型 (Set as Default Model)**：
  - 新增后端接口 `POST /api/set-default-model`，模型列表项右侧支持一键将当前选中的模型设为全局/项目默认模型。
- **模型快捷置顶与特性标签 (Pinned, Recents & Capabilities)**：
  - 模型下拉面板置顶呈现 `🌟 默认与常用` 分组，自动基于 `localStorage` 缓存并置顶最近使用的模型。
  - 模型项展示 `🧠 Thinking`（深度思考）、`👁️ Vision`（多模态识图）、`★ 默认` 等能力标签。
- **全键盘极客操作与快捷键 (Keyboard Navigation & Shortcut)**：
  - 支持全局快捷键 `Ctrl + M` / `Cmd + M` 快速呼出/收起模型选择面板。
  - 搜索框支持 `↑` / `↓` 移动高亮、`Enter` 快速切换、`Esc` 退出。
- **会话流模型切换历史标记**：
  - 会话中途切换模型时，在消息流中自动插入系统分割通知（`── 已切换模型至 Provider / ModelName ──`）。

---

## [1.7.6] - 2026-07-26

### Security
- **Markdown 渲染 HTML 属性逃逸注入安全漏洞修复 (HTML Attribute Breakout XSS Vulnerability)**：升级 `public/app.js` 中的 `escapeHtml` 严密性，将原有对 `&`、`<`、`>` 的处理，扩展至双引号 `"` (`&quot;`) 与单引号 `'` (`&#39;`)，阻断由于模型生成恶意链接等引起的 `href` 属性逃逸与任意 HTML 属性/事件（XSS）注入风险。

### Fixed
- **多设备与多标签页流式事件同步及中途连入追平优化 (Multi-device/Multi-tab Live Event Streaming Sync)**：
  - 优化 `PiAgent` 事件录制范围：只要处于流式生成（Busy/Streaming）状态，即便当前已有在线浏览器连接，也会向 `eventBuffer` 持续录制。
  - 优化缓存释放策略：若 Agent 仍处于 busy 生成状态，新连入的客户端消费完 `eventBuffer` 后不再立即清空 Buffer。
  - 优化重连/中途断开录制：若最后一个客户端在 streaming 途中断开连接，只要生成任务仍在运行中，即不销毁当前的缓存。
  - 以上多项优化完美实现了多台设备（例如手机、电脑）、多个浏览器 Tab 随时刷新或中途连入正在运行中的流式会话时，能够无缝重播已生成的上半段内容并追平后续实时流，极大地增强了多端多 Tab 的协同可靠性。

---

## [1.7.5] - 2026-07-26

### Fixed
- **初始化 CWD 配置加载与 WebSocket 建立竞态修复 (Async CWD Init Race Condition)**：
  - 前端 `init()` 声明为异步函数，优先 `await loadServerConfig()` 完成服务器配置（`serverCwd` / `homeDir`）与本地缓存读取后，再发起 WebSocket 连接或加载会话，彻底消除首次加载时 agent 子进程工作目录与前端显示不一致的问题。
  - 服务端 `normalizeCwd(dir)` 在 `dir` 为空时默认使用 `process.cwd()`（服务启动目录），保证前后端默认工作目录始终精确统一。
- **错误信息二次 HTML 转义修复 (Double Escape on Error Messages)**：移除 `message_end` 中冗余的 `escapeHtml()` 调用，避免错误信息包含特殊符号时被 Markdown 渲染器二次转义显示为实体编码字符。
- **CLI 参数解析健壮性增强 (CLI Arguments Validation)**：`bin/pi-web-chat.js` 增加对 `-p/--port` 与 `-c/--cwd` 选项值的合法性检验与防越界保护，避免 `NaN` 或 `undefined`。
- **输入法合成事件优化 (IME Keycode Handling)**：输入框 `keydown` 事件追加 `e.keyCode !== 229` 判断，进一步增强各平台中文输入法选词回车时的兼容性。
- **Systemd 安装脚本优化 (Systemd Absolute ExecStart Path)**：`scripts/install-service.sh` 生成 unit 文件时将 `ExecStart` 明确为绝对路径 `$NODE_BIN "$PROJECT_DIR/server.js"`。

---

## [1.7.4] - 2026-07-26

### Added
- **模型菜单实时搜索与过滤 (Model Search & Instant Filter)**：
  - 顶栏模型下拉菜单增加置顶固定的搜索过滤输入框，支持根据 Provider 提供商名称、模型名称、模型 ID 进行多维度实时模糊过滤。
  - 打开模型下拉框时自动聚焦并全选搜索框，支持一键清空（`×`）、按 `Escape` 快捷关闭、按 `Enter` 快捷选中。
  - 优化模型列表项布局，同时展示友好显示名与底层 Model ID，解决模型列表过长时翻找困难的问题。
  - 移动端与桌面端自适应滚动与粘性搜索栏布局。

---

## [1.7.3] - 2026-07-26

### Fixed
- **新建会话即时绑定会话文件与 URL (Instant Session Binding)**：在 `public/app.js` 中自动捕获 RPC 消息中的 `sessionFile`，新建会话发送第一条 Prompt 后立即更新浏览器 URL、当前状态与侧边栏高亮，防止页面刷新丢失当前对话。
- **服务端历史文本提取空指针保护 (Null Safety in extractText)**：在 `server.js` 的 `extractText` 增加对分片项为 null/undefined 的防守式过滤，避免异常历史记录导致元数据读取崩溃。
- **移动端侧边栏底部连接状态与版本号显示修复 (Mobile Sidebar Bottom & Safe Area)**：修复手机端侧边栏 `100vh` 溢出导致底部“已连接/版本号”不可见的问题；增加 `100dvh`、`min-height: 0`、`flex-shrink: 0` 及全面屏 `safe-area-inset-bottom` 适配。


---

## [1.7.0] - 2026-07-26

### Added
- **前端流式渲染防抖节流 (rAF UI Throttling)**：使用 `requestAnimationFrame` 节流高频 Token/Delta 事件，消除倒水式输出时的 DOM 频繁销毁与全量重塑，大幅提升高频打字时的流畅帧率，显著降低 CPU 和发热消耗。
- **后端 Session 列表 mtime 内存缓存 (Session Metadata Caching)**：`/api/sessions` 引入基于文件修改时间（`mtimeMs`）的元数据内存缓存。对无改动的历史 Session 文件跳过磁盘读取与全量 JSON 逐行解析，大幅提升侧边栏列表加载响应速度。
- **离线事件 Buffer 算法优化 (Ring Buffer O(1) Push)**：将 `PiAgent.bufferEvent` 从 $O(N)$ 复杂度的 `Array.shift()` 改为 $O(1)$ 的指针环形队列，消除无客户端连接时的数组平移消耗。
- **WebSocket 垃圾连接自动回收 (Dead Socket Cleanup)**：在 `wsSend` 广播消息时动态检测并自动剔除已处于关闭状态（`CLOSING`/`CLOSED`）的垃圾 Socket 引用，避免泄露。

---

## [1.6.0] - 2026-07-26

### Added
- **后台任务继续运行 (Background Task Persistence)**：
  - 关闭浏览器/标签页不再强制中止正在生成的 pi 任务：后台 pi RPC 子进程保持**跑完当前这一轮**；重连后可看到完整结果。
  - `PiAgent` 跟踪 `state`（`idle`/`streaming`）与 `pending` 请求。只有在“**无 WebSocket 且真正空闲**”（无 streaming 也无未响应请求）时才启动空闲回收计时。
  - 时长型缓冲区：在后台期间渲染器产出的事件会被**离线缓存**到 `EVENT_BUFFER_SIZE`（默认 2000 条）的环形 buffer。新连接上来时自动 **回放**为 `backfill_start` → N 条原始事件 → `backfill_end` 三个阶段包裹的消息，便于前端精确“追到哪儿”。
  - 新增 REST 端点 `GET /api/agents`：查看所有存活后台 pi 代理（`state`, `alive`, `busy`, `hasClients`, `uptimeMs`, `bufferedEvents`, 最近一条用户提示等）。常驻 npm 下载、上传、调试或后台 面板都可以利用。
  - 新增环境变量：`MAX_AGENT_LIFETIME_MS`（默认 1800000 = 30分钟，硬上限超出强制 `SIGTERM`；设为 0 禁用）。防止后台代理失控常驻。

### Changed
- **`IDLE_TIMEOUT_MS` 语义重要变更**：从“**断开后多久**杀进程”变为“**真正空闲后多久**才回收”（默认还是 5min）。如果断开后还在 streaming 或有余未完成的 RPC 请求，定时器不会触发，任务不会被中断。
- 首页顶栏重连后会同步服务器状态：收到 `backfill_end` 后会自动滚动到底，并恢复 `streaming` 状态（如仍在后台继续）。
- 首页增加优雅关闭：`SIGINT`/`SIGTERM` 会“逐个停止所有后台 pi 进程”后再退出，防止 server 重启时留下 zombie 进程。
- 不再支持“`IDLE_TIMEOUT_MS=0` 断开即杀”告诉——该环境变量现在表示“**禁用空闲回收**”。需要立刻释放内存，请改为正数（如 `5000`）或重启 server。

### 技术说明
- `PiAgent` 生命周期事件：`agent_start → state=streaming`；`agent_end/agent_settled → state=idle`；`pi_exit → state=idle`。这是“背景继续跑完”的关键开关。

---

## [1.5.0] - 2026-07-26

### Added
- **Idle timeout & concurrency control (内存保护增强)**：
  - 新增 `IDLE_TIMEOUT_MS` 环境变量，可配置浏览器断开后保留 pi RPC 子进程的时间（默认 300000ms = 5 分钟，设为 0 即关闭自动清理）。
  - 新增 `MAX_CONCURRENT_AGENTS` 环境变量，限制并发 pi 代理进程数（默认 0 = 无限制）。超限时新 WebSocket 连接返回 1013 (capacity) 并在控制台警告，防止多标签页把小内存机器挤爆。
  - 新增 `IDLE_DROP_HEAP=1` 环境变量，空闲时尝试调用 `global.gc()` 主动释放 V8 堆，配合 `--expose-gc` 让内存更快回收到 OS，而非被动 swap。

### Changed
- `bin/pi-web-chat.js` 启动 server 时加入 `--expose-gc` 标志，支持上述主动内存释放。

---

## [1.4.2] - 2026-07-26

### Fixed
- **移动端顶栏常驻与布局优化 (Sticky Topbar & Mobile Layout)**：
  - 顶栏 `.topbar` 设置 `position: sticky; top: 0; flex-shrink: 0; z-index: 20;`，确保在手机端滚动聊天、弹起软键盘或屏高变化时**始终常驻固定在屏幕最上方**，绝不随聊天区域滚动或被挤压。
  - 采用 Dynamic Viewport Height（`100dvh`），解决 iOS Safari 与 Android 移动浏览器地址栏/底部导航栏显示隐藏时的页面抖动与错位。
  - 优化移动端工作目录胶囊（CWD Pill）、模型胶囊（Model Pill）与会话标题的宽度挤压与弹性截断（`text-overflow: ellipsis`），小屏手机下依然精致美观。

---

## [1.4.1] - 2026-07-26

### Fixed
- **切换/加载历史会话模型精准显示**：
  - 修复加载历史会话时由于后台进程启动时与 `get_state` 异步竞态导致右上角模型 Pill 显示不准确的问题。
  - REST `/api/session` 接口现在自动从该会话的 JSONL 历史链中精确提取最后使用的模型 (`model`)。
  - 切换会话时，前端能够零延迟（Instant）同步并渲染该会话对应的正确模型，同时支持 `model_select` 事件实时联动。

---

## [1.4.0] - 2026-07-26

### Added
- **多端与多浏览器同步协同 (Multi-Device & Multi-Browser Session Sharing)**：
  - **WebSocket 多连接池**：服务端 `PiAgent` 进程升级为多连接池（`Set<WebSocket>`），电脑、手机、平板可同时挂载到同一个正在运行的会话，所有端实时同步接收 AI 流式回答。
  - **多端消息双向广播**：手机端发送 Prompt 或插入指导指令（Steer）时，电脑端无需刷新即可实时呈现用户消息并同步流式输出 AI 答复。
  - **URL 参数关联与一键分享**：选择会话时自动更新浏览器 URL 参数（`?session=...`），分享 URL 或在手机侧边栏选中同个会话即可直接加入同一会话同步协同。

---

## [1.3.0] - 2026-07-26

### Added
- **运行时实时插入/拦截指令 (Steer Instructions During Agent Turns)**：
  - AI 正在思考、读取文件或执行命令（`streaming`）时，可以在输入框输入补充或修正要求。
  - 输入框右侧会自动展示 **`🧭 插入指令`** 按钮，按 Enter 或点击按钮可实时将指令发送给 `pi` 代理进程（发送 `steer` 消息）。
  - 聊天界面中插入的指令会展示带 **`🧭 指导指令`** 徽章的突出气泡，`pi` 接收后能在当前轮次中即时调整执行方向。
  - 未输入内容时，按钮保持原有的 `■` 停止按钮功能。

---

## [1.2.0] - 2026-07-26

### Added
- **断线自动重连 (Auto Reconnect with Exponential Backoff)**：网页连接断开后前端启动指数退避自动重连（1s ~ 15s），并在侧边栏底部指示灯实时显示重连状态（`重连中 (x)`）。重连成功弹出“网络连接已恢复”提示。
- **双向心跳检测 (Heartbeat Ping/Pong)**：服务端每 30 秒发送 WS Protocol Ping 清理僵尸连接，前端每 15 秒发送应用层 Ping，超时 45 秒无响应自动切断重连。
- **重连会话状态同步 (State Restoration)**：重连后自动向服务端获取 `isStreaming` 状态。若生成已在后台完成则载入最新对话历史，若仍生成中则自动平滑接续流式输出。
- **一键复制功能 (Copy Buttons)**：
  - **代码块/命令复制**：所有 Markdown 渲染的代码块顶部增加语言标签与“复制”按钮。
  - **工具调用指令复制**：在工具调用（如 `bash` 命令执行）卡片标题栏增加“复制”按钮，方便快速复制命令。
  - **回答全文复制**：在 `pi` 角色标签右侧新增“复制全文”按钮。

---

## [1.1.0] - 2026-07-26

### Added
- **后台进程持久化 (Process Persistence)**：刷新或暂时离开 Web 页面时，`pi` Agent 进程继续在后台运行，重新打开/刷新网页会自动重挂载 (re-attach) 正在运行的进程，任务不会中断。
- **历史工具输出归折 (Clean Tool Results Rendering)**：从历史记录恢复会话时，将离散的 `toolResult` 输出与对应 `toolCall` 绑定，整洁收纳于工具调用的 `⚙` 折叠卡片内，避免原始日志/代码平铺乱穿于聊天框中。

### Fixed
- **历史会话加载异常**：修复 `/api/session` 接口中局部变量名遮蔽 Node.js `path` 模块导致的无法弹出会话历史问题。

---

## [1.0.1] - 2026-07-20

### Fixed
- **空内容 pi 气泡**：`message_start` 原本不区分角色，用户消息回显也建了一个空 pi 气泡 — 现在只对 `role:assistant` 开 streaming 块。
- **重复文本渲染**：pi 在 `message_start` 就带完整 content、随后又用 `text_delta` 发同一文本 — 改用 `text_end.content` 覆盖累加结果，避免出现 `WS_OKWS_OK`。
- **模型出错时空白回复**：当模型返回 `stopReason=error` 又无内容时（如选了不可用模型），现在显示明确的“生成失败 / 请换模型”提示。
- **侧边栏漏掉 Web 新建的会话**：`server.js` 传给 pi 的 `--session-dir` 导致新 session 被直接放在 sessions 根目录而非 cwd 子目录中；`listAllSessionFiles` 原仅扫子目录，于是 11 条 Web 创建的会话一个都列不出来 — 现在同时扫根目录下的 `.jsonl`。
- **新建会话非手动刷新不可见**：根因是上一条 — 侧边栏根本扫不到新文件。现在 `agent_settled` 后列表实时反映新会话，无需刷新页面。
- **初始化时模型 pill 永远空白**：`init()` 里 `// pull current state once:\n setTimeout(...)` 把 `\n` 当成字面字符写进了单行注释，`get_state` / `get_available_models` 永不发出 — 改为真实换行后两调用均发出。
- **工具调用参数显示不全**：新增 `toolcall_delta` / `toolcall_end` 处理，用 `toolcall_end` 的最终 `toolCall.arguments` 刷新头部 args 显示。
- **同一 agent 多轮 agent message 互相污染**：`message_start`(assistant) 重置本块的 text/thinking 累加器，避免上一轮工具调用与下一轮文本串到一起。

---

## [0.2.0] - 2026-07-19

### Added
- **新建会话流程修复**：`btnNew` 点击后刷新侧边栏、清理流式状态、生成新 ws 代次。
- **WebSocket 代次机制**：`wsGen` 防止旧 socket 消息污染新上下文。
- **输入框红边提示**：ws 未连时提交会有 350ms 红色 flash。
- **连接状态文本动态更新**：「连接中…」→「已连接」/「已断开」。
- **提交**：`5a8f036` "Fix new-session flow: ws generation guard + sidebar refresh + drop input"

### Fixed
- 新建会话后左侧不出现（缺 `refreshSessions()`）
- 快速切换会话导致 prompt 被当作 abort（旧 socket stragglers）

---

## [0.1.0] - 2026-07-19

### Added
- 项目初始化：`server.js` (Express + ws) + `public/` (HTML/JS/CSS)
- REST API：
  - `GET /api/sessions?cwd=` — 列出该 cwd 下所有 session（标题、时间、消息数）
  - `GET /api/session?file=` — 重建会话的根→叶对话线
- WebSocket `/ws?cwd=&session=` — 1:1 桥接 `pi --mode rpc`
- 前端 UI：
  - 左侧栏：搜索、历史列表、点击切换
  - 右侧：空状态建议、流式对话、Markdown 渲染
  - 底部：textarea + 发送/停止按钮
  - 顶栏：会话名、模型选择 pill
- 流式渲染：文本打字光标、thinking 块、工具折叠块
- 会话历史持久化：复用 pi 原生 `~/.pi/agent/sessions/*.jsonl`
- 多模型切换（pi 配置的所有 provider/model）
- 响应式深色主题（ChatGPT/Gemini 风格）

---

## Legend

| 标记 | 含义 |
|------|------|
| **Added**    | 新功能 |
| **Changed**  | 现有功能变更 |
| **Deprecated** | 即将移除 |
| **Removed**  | 已移除 |
| **Fixed**    | Bug 修复 |
| **Security** | 安全相关修复 |