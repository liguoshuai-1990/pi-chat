# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.18.3] - 2026-09-06

### Fixed
- **Android 会话列表 JSON 解析失败修复（v2.18.2 遗留问题）**：
  - 修复服务端 `/api/sessions` 返回的 `id` 字段类型不一致问题：Pi 会话文件头部的 `id` 可能为数字类型，但 Android 客户端 `SessionInfo.id` 声明为 `String?`，导致 kotlinx.serialization 抛出 `Unexpected JSON token at offset N` 异常。服务端现已统一将 `id` 转换为字符串。
  - Android `SessionInfo` 的 `file` 和 `name` 字段添加默认值（空字符串），避免因 `null` 值导致反序列化失败。
  - Android JSON 解析器添加 `coerceInputValues = true` 配置，将 JSON 中的 `null` 值自动强制转换为 Kotlin 属性的默认值，提升解析容错能力。
  - Android `ApiService.getSessions()` 新增容错降级解析机制：当严格解析失败时，逐条解析 `sessions` 数组中的会话对象并跳过无法解析的条目，避免单个异常会话导致整个会话列表加载失败。
  - Android `loadSessions()` 错误处理优化：加载失败时保留已有会话列表而非清空，并添加错误日志输出。
- **Web 端流式超时看门狗崩溃修复**：
  - 修复 `submitPrompt()` 中 5 分钟流式超时回调调用了未定义的 `toast()` 函数（应为 `showToast()`），导致超时触发时抛出 `ReferenceError`，流式状态无法正确重置，用户界面永久卡在生成中状态。
- **Web 端定时器冗余 DOM 查询清理**：
  - 移除 `startStreamingTimer()` 中对 `.tool-duration.live` 的重复 `querySelectorAll` 调用，该查询已被上方合并查询覆盖。减少每 100ms 一次的冗余 DOM 扫描，降低 CPU 开销。

## [2.18.2] - 2026-09-06

### Fixed
- **Android 会话列表加载失败修复**：
  - 修复服务端 `/api/sessions` 返回的 `timestamp` 字段类型不一致问题：服务端发送数字（epoch 毫秒），但 Android 客户端 `SessionInfo.timestamp` 声明为 `String?`，导致 kotlinx.serialization 抛出 `Unexpected JSON token` 异常，会话列表无法加载。现已统一为 `Long?`。
  - 修复服务端活跃 Agent（尚未刷盘的会话）返回 `title` 字段而非 `name`，导致 Android `SessionInfo` 缺少必填字段 `name` 的反序列化失败。已改为返回 `name`、`sessionName`、`firstUser`，与磁盘会话格式保持一致。
  - 服务端 `/api/sessions` 响应中所有 `timestamp` 统一规范化为 epoch 毫秒数字，消除字符串/数字混用导致的跨端解析问题。

### Added
- **Android 会话列表刷新按钮**：
  - 在侧边栏抽屉顶部"新对话"按钮旁新增刷新按钮，点击可重新拉取会话列表，解决此前无法在抽屉内手动刷新历史对话列表的问题。

## [2.18.1] - 2026-09-06

### Fixed
- **配置与文档巡检修复**：
  - 修正 `server/.env.example` 缺失 `LONG_RUNNING_TIMEOUT_MS` 变量，恢复与根目录 `.env.example` 的一致性（违反了自身注释声明的不变量）。
  - 新增 `ALLOWED_CWD_DIRS` 安全配置项至两份 `.env.example`，此前该功能已在代码中实现但未文档化。
  - 修正 Android `versionCode` 公式从 `MAJOR*10000+MINOR*100+PATCH` 改为 `MAJOR*1000000+MINOR*10000+PATCH*100`，与 HarmonyOS 保持一致（v2.18.0: 21800 → 2180000）。
  - 同步 `README.md`、`clients/android/README.md`、`clients/harmony/README.md`、`docs/USER_JOURNEY.md` 中过时的 v2.17.9 版本引用至 v2.18.0。

## [2.18.0] - 2026-09-06

### Added
- **Android 端使用体验优化**：
  - 顶栏新增「生成中」流式状态指示器，对话进行时实时可见。
  - 下拉刷新现在同时刷新会话列表，不再仅刷新当前会话消息。

### Fixed
- **Android 端 UI 修复**：
  - 导出按钮图标从 Share 改为 Download，与 Web 端保持一致。
  - 模型选择对话框高度过高问题，列表最大高度从 360dp 降至 260dp。
  - 顶栏三个快捷按钮（目录/模型/思考）在小屏显示不全，移除横向滚动改为自适应权重布局，缩小字号与间距确保全部可见。

## [2.17.9] - 2026-09-06

### Fixed
- **文档与配置全面巡检修复**：
  - 修正 `README.md`、`clients/web/README.md`、`docs/ARCHITECTURE.md` 中过时的 Node.js >= 18 引用为 >= 20（Node 18 已 EOL，CI 矩阵已移除 18.x）。
  - 修正 `README.md` 版本徽章与 APK 引用从过时的 2.17.3 同步至当前版本。
  - 修正 `clients/android/README.md`、`clients/harmony/README.md` 中过时的 v2.17.4 版本引用。
  - 修正 `docs/USER_JOURNEY.md` 中过时的 v2.12.7 版本引用。
  - 修正 `package.json`、`clients/web/package.json` 的 `engines.node` 从 >=18 更新为 >=20。
  - 修正 `CLAUDE.md` 与 `AGENTS.md` 的工作流不一致：更新铁律三为跳过本地测试直接推送、铁律四为异步 CI 监控（移除 `gh run watch` 推荐），同步版本清单为动态化后的 5 处源。
  - 移除 `docs/CHANGELOG.md` 中重复的 2.15.7 条目（与 2.16.1 内容完全相同的误粘贴）。
  - 清理 `scripts/bump-version.mjs` 中的死代码（`updateAndroidGradle`、`updateHarmonyIndexEts` 函数已不再调用）与过时注释。



## [2.17.8] - 2026-09-06

### Fixed
- **Web 移动端附件上传兼容性修复**：移除 `<input type="file">` 上混合的大量生僻扩展名过滤属性（`accept`），解决移动端浏览器（如 Android、鸿蒙系统及各类内置浏览器）在拉起系统选择器时因 MIME 解析失败导致提示“暂无可用打开方式”的问题；附件格式由前端 JS（`handleIncomingFiles`）统一进行解析、压缩和友好提示。

## [2.17.7] - 2026-09-06

### Changed
- **版本号归一化：从 8 处硬编码降至 5 处**：
  - 新增 `scripts/bump-version.mjs` 一键版本递增脚本，支持 `patch`/`minor`/`major` 或指定完整版本号，自动同步全仓 5 处版本源 + CHANGELOG。
  - Android `build.gradle.kts` 改为构建时从 root `package.json` 读取版本号（`JsonSlurper`），消灭 `versionName` + `versionCode` 两个硬编码源。
  - HarmonyOS `Index.ets` 改为运行时从 `bundleManager.getBundleInfoForSelfSync()` 读取版本号，消灭 `Text('v...')` 硬编码源。
  - Web 测试 `unit.test.js` 适配动态版本读取，改为验证读取逻辑存在而非匹配硬编码值。
  - AGENTS.md 版本同步清单与 SOP 流程图同步更新。

## [2.17.6] - 2026-09-06

### Changed
- **AGENTS.md 工作流重构：跳过本地构建测试，全面委托 CI**：铁律三不再要求本地运行 `pnpm test` / `pnpm build`，直接提交推送；铁律四新增 CI 监控权限与操作指南（GitHub API 查状态 + 拉日志），包含 fine-grained PAT 配置方法。SOP 流程图同步精简。

## [2.17.5] - 2026-09-06

### Fixed
- **CI 修复：移除已 EOL 的 Node 18.x 矩阵**：根因为 `node --test --test-timeout=8000` 中的 `--test-timeout` flag 是 Node 20 才引入的，Node 18 不识别（报 `bad option`）。Node 18 已于 2025-04 EOL，从 CI 矩阵移除 18.x，保留 20.x 与 22.x。

## [2.17.4] - 2026-09-06

### Fixed
- **彻底根除执行过程中的“空任务”幽灵卡片 (Ghost Tool Call Fix)**：
  - 修复 Web 客户端在流式参数片段 `toolcall_delta` 到来时误调 `ensureToolBlock` 产生 `id === "undefined"` 幽灵空卡片的重大缺陷；在 `ensureToolBlock` 中加入严苛防御性校验（无有效 ID 直接拒绝创建），杜绝界面出现名称为空、参数为空、无输出的僵尸占位任务。
  - 修复 Android 原生客户端在 `toolcall_start` 阶段无法解析顶层 `ev.id` 与 `ev.toolName` 的缺陷，统一事件字段映射，消除模型生成参数阶段的卡片闪烁与空状态。

### Changed
- **工具调用卡片体验升级：提前展示执行指令 (Early Command Display)**：
  - **指令即刻呈现**：在工具正式启动执行（`tool_execution_start`）或参数生成完毕（`toolcall_end`）瞬间，卡片内即刻格式化并提前渲染完整的【执行指令】代码块（如 `$ bash ...` 或参数明细），用户无需等待命令执行结束即可第一时间知晓正在运行的具体命令。
  - **结构层次分明**：卡片内部展开区规范化拆分为【执行指令】与【输出结果 / 实时状态】两部分；执行中配以呼吸态动态提示，执行完展示最终输出或错误状态。
  - **测试稳定性加固**：根目录 `pnpm test` 脚本加入 `--workspace-concurrency=1` 串行执行各包测试，彻底消除并行执行时测试端口竞争导致的偶发中断。
- 全端版本号统一递增至 2.17.4（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.17.3] - 2026-09-06

### Fixed
- **测试稳定性与防挂起修复 (Anti-Hang & Resource Leak Fix)**：
  - `server/fixtures/pi-stub.mjs` 测试桩进程新增 `stdin end`、`SIGTERM` 与 `SIGINT` 信号监听并为长定时器添加 `.unref()`，彻底杜绝单测异常时子进程残留挂起 60 秒的缺陷。
  - `server/test/server.test.js` 引入全局 `after()` 清理钩子，在测试套件结束时自动执行 `shutdownAllAgents()` 兜底终止所有未关闭的 agent 子进程和连接句柄。
  - `packages/protocol`、`server`、`clients/web` 的单测命令均增加 `--test-timeout=8000` 超时保护，杜绝任何未决 Promise 或 Socket 导致的无限卡死。

### Changed
- **工作流与工程效能优化 (AGENTS.md)**：
  - **测试轻量化与秒级交付**：本地仅执行秒级轻量单元测试（`pnpm test`）与语法构建检查（`pnpm build`），耗时通常在 2~3 秒内完成。
  - **重型编译全量交付 GitHub Actions CI**：严禁在本地机器盲目运行 `./gradlew assembleDebug`，将 Android APK 编译打包、鸿蒙产物归档和 Node 18/20/22 矩阵测试全量交给 GitHub Actions CI 云端执行。
  - **移除 CI 同步死等 (gh run watch)**：本地测试通过并 push 后即可交付，改由 GitHub CI 异步执行，彻底解除改代码任务长期卡在 test/CI 阶段的痛点。
- 全端版本号统一递增至 2.17.3（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.17.2] - 2026-09-06

### Fixed
- **Server: `IDLE_TIMEOUT_MS` 代码默认值与文档对齐** — `config.js` 中默认值由 `300000`（5 分钟）修正为 `1800000`（30 分钟），与 `.env.example`、service 模板及 CHANGELOG 声明一致，确保未配置 `.env` 时也保持 pi 子进程热机，避免冷启动首句延迟。
- **HarmonyOS: 侧边栏版本号漂移修复** — `Index.ets` 侧边栏硬编码版本号由过时的 `v2.17.0` 修正为当前 `v2.17.2`。
- **Protocol: JSON Schema `level` 类型对齐** — `schema.json` 中 `level` 字段类型由仅 `string` 扩展为 `string|number`，与 `validateClientMessage` 实际校验逻辑一致。

### Changed
- **文档同步**：修正 `server/README.md`、`clients/web/README.md`、`docs/ARCHITECTURE.md` 中过时的 `IDLE_TIMEOUT_MS` 默认值描述（5 分钟 → 30 分钟）；同步 `README.md`、Android/HarmonyOS README 中过时的 `v2.14.5` APK 引用至 `v2.17.2`。
- **测试加固**：`clients/web/test/unit.test.js` 新增 HarmonyOS `Index.ets` 侧边栏版本号自动化断言，防止硬编码版本号再次漂移。
- 全端版本号统一递增至 2.17.2（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.17.1] - 2026-09-06

### Fixed
- **网关与 Web 端：修复首次思考转圈时刷新页面会话丢失的严重缺陷**：
  - **会话地址原子锚定**：Web 前端在发送首条 prompt 时立即调用 `updateUrlSession(sessionFile)` 将 `session` 锚定至浏览器地址栏（并保留当前 `cwd` 等参数），避免因刷新导致 URL 丢失 session 状态。
  - **内存活跃会话动态合并**：服务端 `/api/sessions` 列表接口新增合并 `activeAgents` 中当前工作目录下的活跃会话，即使首轮思考期间 pi 尚未向磁盘刷入 `.jsonl` 文件，左侧历史列表也能实时呈现“运行中”会话项。
  - **未落盘会话历史容错合成**：`/api/session` 接口在磁盘文件尚不存在（ENOENT）时，检查对应活跃中的 `activeAgent`，直接返回包含首条提问的虚拟 transcript 结构，避免页面刷新后报 404 导致聊天区域清空。
  - **首轮 Prompt 缓冲重放机制**：WebSocket 网关在接收到首条 prompt 时将其缓冲，客户端在首轮思考中途刷新重连后，`replayBufferedWs` 会先重放用户的初始提问，再流式重放正在进行的思考与回答，实现首轮思考刷新无缝衔接。

### Changed
- **Web 端：优化首次思考状态的实时视觉反馈**：
  - 在 `thinking-placeholder` 中增加动态耗时显示（如 `正在思考中… (1.2s)`），并在超过 2.5 秒时自动过渡提示为 `正在深度推理中… (2.8s)`，彻底消除大模型首字推理等待期间的停滞感与死锁焦虑。
- 全端版本号统一递增至 2.17.1（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.16.6] - 2026-09-06

### Fixed
- **服务端 index.js 重复错误处理器**：移除了 `unhandledRejection` 和 `uncaughtException` 的重复注册（此前会导致每条未捕获错误输出两行日志），同时移除了未使用的 `server` 变量。
- **鸿蒙端版本号硬编码**：修复 `Index.ets` 中侧边栏版本号硬编码为 `v2.16.3` 的问题，更新为 `v2.16.6` 与当前发布版本一致。

### Performance
- **Web 端流式渲染 O(n²) 优化**：`refreshStreamingContent` 在每次文本增量时不再清空并重建整个 DOM，新增快速路径——当仅最后一个文本项内容变化时直接更新其 `innerHTML`，避免长消息（多工具调用 + 长文本）的 O(n²) 重建开销。
- **Web 端计时器 DOM 扫描优化**：`startStreamingTimer` 将两次独立 `querySelectorAll` 合并为一次组合查询，轮询间隔从 100ms 提升至 200ms，DOM 扫描频率从 20 次/秒降至 5 次/秒。
- **Web 端会话列表轮询优化**：后台会话列表刷新间隔从 10s 提升至 15s，并在移动端侧边栏收起时跳过刷新，减少不必要的 API 调用。


## [2.16.5] - 2026-09-05

### Added
- **Web 端「压缩上下文」手动压缩按钮**：在顶栏新增「压缩」按钮，长会话越聊越慢时一键触发 pi 端 compact，释放历史上下文累积的 token；压缩完成后回显预估剩余 token 并同步会话状态。
- **协议新增 `compact` 消息类型**：在 `packages/protocol` 中新增 `ClientMessageType.COMPACT`、`createCompactMessage()` 构造器、JSON Schema 枚举与 TS 类型，并在网关 `server/src/ws.js` 透传 `compact` RPC 命令。

### Changed
- **网关空闲回收与提示缓存配置优化**：
  - `IDLE_TIMEOUT_MS` 默认由 `300000`（5 分钟）提升到 `1800000`（30 分钟），切项目/新会话后保持 pi 子进程热机，避免冷启动首句延迟。
  - 新增 `PI_CACHE_RETENTION=long` 环境变量（已同步至根目录与 `server/.env.example`、`server/scripts/pi-chat-gateway.service`），拉长 provider 提示缓存跨空闲期/会话切换的保留时间，进一步降低首字延迟。
- 全端版本号统一递增至 2.16.5（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.16.4] - 2026-09-05

### Fixed
- **WebSocket 网关: switch_session 响应协议契约对齐**：
  - 修复客户端发送带有 `id` 的 `switch_session` 请求时，服务端返回 `command: "get_state"` 导致 Android/HarmonyOS/Web 端 switch_session 回调无法命中或响应超时的缺陷。
  - 网关直接向客户端回复标准 `{ type: "response", command: "switch_session", success: true, data: { sessionPath } }` 并后台触发 state 同步。
- **Web 前端: 解决静态资源强缓存 1 天导致用户无法及时加载最新版本**：
  - 优化 `server/src/server.js` 静态资源缓存策略：HTML/manifest 设置 `no-cache, no-store, must-revalidate`；未带 hash 的核心 JS/CSS（`app.js`, `style.css`）使用 `no-cache`（走 304 ETag 协商缓存），仅带 hash 的静态资源强缓存 1 年。
- **Web 前端: 修复发送失败时用户输入内容丢失**：
  - `submitPrompt` 若因网络断开等原因发送失败，自动将文本和上传附件图片恢复到输入框并重新聚焦，保障用户数据资产不丢失。
- **Web 前端: 修复侧边栏在新建会话与请求异常时白屏闪烁**：
  - 会话列表内存缓存至 `state.lastSessions`，`startNewSession()` 保留已有会话避免瞬间全空；`refreshSessions()` 异常时不再抹除既有列表；`deleteSession` 使用 `sameSession()` 正确匹配多格式会话路径。
- **Web & Android: 流式输出时避免与用户争抢滚动条**：
  - 引入智能吸底判断（`userScrolledUp` / `isNearBottom`）：当用户主动上滑查阅历史记录时，暂停流式生成的高频强制拉底，给用户完整的自由阅读体验；划回底部或手动发消息时自动恢复跟随。
- **Markdown: 修复连续多行引用块 (blockquote) 样式断裂与锚点跳转失效**：
  - 连续 `> text` 行合并入同一个 `<blockquote>` 容器，解决多行外边距及边框断裂问题；`sanitizeUrl` 扩展支持页面安全锚点 `#`。
- **Web 前端: 浏览器标签页标题 (document.title) 动态同步**：
  - 切换或新建会话时，实时将页面标题更新为对应会话名（如 `会话名 · pi-chat`），优化多 Tab 并发使用体验。
- **服务端: 补全 child process stdio 异常处理与 timing 耗时统计**：
  - 为 `proc.stdout` 和 `proc.stderr` 补充错误事件监听，防止未处理 stream error；在 `agent_end` 时自动归档未结束的 `thinkingDurations`。
- **移动端 (Android / HarmonyOS): 4401 鉴权失败停止无意义重连**：
  - 在检测到 4401 Unauthorized 关闭码时，停止自动重连风暴，避免无效重试刷爆服务端日志。

### Changed
- 全端版本号统一递增至 2.16.4（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。



## [2.15.7] - 2026-09-05

### Fixed
- **解决 Android 客户端断连重连导致网关 3000 端口挂掉的问题 (Reconnect Storm & Subprocess Flood Defense)**：
  - **Android 端修复重连死循环与代次错乱**：
    - 在 `WebSocketClient` 引入单调递增的代次 ID（`currentGeneration`），旧连接的所有回调（`onOpen`、`onMessage`、`onClosed`、`onFailure`）被强制屏蔽抛弃，杜绝主动关闭旧连接时旧回调反向触发 `scheduleReconnect` 导致的重连风暴。
    - 将 `scheduleReconnect` 单例化管理（`reconnectJob`），确保并发失败或多次调用时旧重试任务被立即 `cancel()`，防止重试协程爆炸。
    - 增加 `activeCwd` 与 `activeSessionPath` 状态追踪与更新机制，避免重连时 sessionPath 丢失导致的重复空会话创建。
    - 在 `ApiService` 中统一配置 15s 连接超时与 30s 读写超时，并在 `ChatRepository.close()` 时安全释放线程池与连接池资源。
  - **服务端加固进程容错与子进程防打爆机制**：
    - 在 `server/src/index.js` 中增加全局 `uncaughtException` 与 `unhandledRejection` 事件监听，防止移动端网络异常、TCP RST 或未处理 socket 错误直接使网关退出。
    - 在 `server/src/server.js` 与 `server/src/ws.js` 中分别为 `httpServer` 与 `wss` 注册 `error` 监听器，杜绝底层协议升级失败导致进程崩溃。
    - 在 `server/src/agent.js` 中优化 `getOrCreateAgent`：无 `sessionPath` 时复用同 `cwd` 下空闲且无监听者的 unkeyed agent，杜绝频繁重连 spawn 多个 `pi` CLI 进程吃光服务器内存（OOM）。
    - 在 `markActivity` 中对无 session 的孤儿 agent 实行闲置立即回收，杜绝后台僵尸进程堆积。

### Changed
- 全端版本号统一递增至 2.15.7（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

## [2.16.3] - 2026-09-05

### Fixed
- **Android: 补全 animation import** — 添加 `androidx.compose.animation.*` 导入，修复 fadeIn/fadeOut/slideInVertically/slideOutVertically 未解析引用。

## [2.16.2] - 2026-09-05

### Fixed
- **Android: 修复 scroll-to-top FAB 动画类型推断编译错误** — slideInVertically/slideOutVertically 使用默认动画参数，避免 tween 泛型推断失败导致 CI Android 构建失败。

## [2.16.1] - 2026-09-05

### Fixed
- **Server: /api/log-error 端点添加认证中间件** — 修复未认证客户端可无限调用日志注入端点的安全漏洞 (S1)。
- **Server: 添加 unhandledRejection / uncaughtException 全局异常兜底** — 防止未捕获的 Promise rejection 导致进程崩溃 (C1)。
- **Server: CORS 默认策略收紧** — 未配置 ALLOWED_ORIGINS 时仅允许 localhost 跨域，不再反射任意 Origin (C2)。
- **Server: WebSocket 消息处理补全 .catch()** — PROMPT/STEER/NEW_SESSION 三处 agent.send().then() 均添加错误捕获 (H1)。
- **Server: SSE keepalive setInterval 添加 .unref()** — 防止 SSE 连接阻止进程优雅退出 (H2)。
- **Server: Express body parser 限制从 50MB 降至 10MB** — 减少内存耗尽攻击面 (M11)。
- **HarmonyOS: 侧边栏版本号修正** — 从硬编码的旧版本号修正为 v2.16.1 (HC3)。
- **HarmonyOS: errorMessage 渲染到 UI** — 添加错误横幅，之前 12+ 处错误赋值对用户完全不可见 (HC2)。
- **Android: error StateFlow 渲染到 UI** — 收集并显示 error 流，添加可关闭的错误横幅 (AC3)。

## [2.16.0] - 2026-09-05

### Added
- **Android: 消息列表"回到顶部"浮动按钮** — 当用户向下滚动离开顶部时，右下角自动出现上箭头 FAB，点击平滑滚动到第一条消息，与 Web 端 mobileToolbarFab 行为一致。
- **Android: 消息列表自动滚动优化** — 新消息出现时平滑动画滚到底部，流式输出内容更新时瞬时 snap 到底部，避免动画高频中断导致的滚动失效。

## [2.15.6] - 2026-09-05

### Added & Enhanced
- **Android 富文本 Markdown 原生表格与任务清单支持**：
  - 在 `FormattedMarkdownText` 中实现 Markdown 表格语法树节点 `MarkdownSegment.Table` 及其水平平滑滚动的专属原生暗黑表格卡片展示，支持多列对齐、表头高亮与斑马纹隔行底色。
  - 支持 GFM 任务列表语法（`- [x]` / `- [ ]`），渲染为精致直观的勾选框（`☑`）与未勾选框（`☐`），进一步提升开发任务清单、参数表与测试用例报告的阅读质感。

### Fixed
- **Web: 刷新后耗时变 0** — `reconstructFromEntries` 中 timing 数组索引与 turn 错位修复：
  - `assistantMsgCount`（每条 assistant 消息递增）替换为 `turnIndex`（每条 user 消息递增），与服务端 `saveTimingData()` 每轮一条的 timing 数组对齐
  - `thinkingIdx` 从每条 assistant 消息重置改为每个 turn 重置，修复多消息 turn 中 thinking 时长取错索引
  - `turnDurationMs` 仅在 turn 最后一条 assistant 消息上显示，避免轮内多条消息重复显示相同总耗时

### Changed
- 全端版本号统一递增至 2.15.6（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

## [2.15.5] - 2026-09-05

### Fixed
- **Web 端复制按钮 SVG 渲染深度加固**：
  - 将 `makeCopyIconSvg()` 内部构造机制从基于 `innerHTML` 解析升级为直接通过 `document.createElementNS` 构建独立的 `rect` 与 `path` SVG 子元素节点，规避个别浏览器对 SVG 容器 `innerHTML` 命名空间属性继承不全的问题。
  - 在 CSS 中增加 `.btn-copy-* svg * { fill: none; }` 样式重置规则，彻底消除任何残留的黑色填充块（黑斑）。

### Changed
- 全端版本号统一递增至 2.15.5（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.4] - 2026-09-05

### Fixed
- **Web 端复制按钮黑斑修复**：修复 Web 前端复制按钮 SVG 缺少 `viewBox="0 0 24 24"` 及 `fill="none"`、`stroke="currentColor"` 属性导致浏览器默认以黑色填充并在按钮左侧呈现黑斑的问题，同时在全局 CSS 中规范复制按钮 SVG 的线条轮廓样式。
- **Android 工具执行卡片折叠与异常输出收拢**：
  - 工具卡片默认采用折叠状态（与 Web 端保持一致），避免多行命令执行结果直接霸屏展开；用户可自主点击卡片展开/收起参数与输出日志。
  - 修复 `ChatRepository` 在消息结算与 watchdog 超时退出时未将未完结工具状态标记为 DONE 的隐患，防止工具卡片永久处于运行中并展开。
  - 过滤流式处理中非文本增量消息向 `message.content` 的错误追加，杜绝内部系统或工具结果泄漏进正文显示。

### Added & Enhanced
- **Android 工具卡片现代矢量图标与左右布局优化**：
  - 替换原有粗糙的 Emoji 表情，重构为现代 Material Outlined 矢量图标（终端、文件、编辑、保存、工具等）及带圆角底色的专属图标徽章。
  - 重构工具卡片顶栏布局：工具名称与指令摘要使用自适应权重展示，快捷复制指令按钮、耗时状态胶囊徽章与展开折叠箭头靠右对齐，彻底消除卡片右侧大片空白问题。
- **Android 多维复制能力增强**：
  - 在 Assistant 回答卡片顶部标题行新增“复制全文”快捷操作按钮，并在卡片底部提供清晰醒目的“复制回复”胶囊按钮。
  - 用户消息气泡支持点击快捷复制提问内容。
  - 工具卡片折叠与展开状态下均支持一键复制执行指令与输出结果，代码块组件保留显式复制按钮。
- **Android 富文本 Markdown 渲染重构升级**：
  - 深度重构 `FormattedMarkdownText`，全面支持多级标题（H1~H4）层级与字号间距排版、圆点无序列表、序号有序列表、引用块（带 Accent 竖条装饰）、分割线以及暗黑代码块。
  - 引入基于 Compose `AnnotatedString` 的行内 Markdown 解析器，完整高亮行内代码（薄荷绿等宽字体与暗色衬底）、粗体、斜体、删除线与链接样式，大幅提升最终回复的可读性与美观度。

### Changed
- 全端版本号统一递增至 2.15.4（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.3] - 2026-09-05

### Fixed
- **修复 pnpm-lock.yaml 与 server/package.json 不一致**：`express` 和 `ws` 从 devDependencies 移至 dependencies 后未同步更新 lockfile，导致 CI `frozen-lockfile` 安装失败（`ERR_PNPM_OUTDATED_LOCKFILE`）。

### Changed
- 全端版本号统一递增至 2.15.3（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.2] - 2026-09-05

### Fixed
- **网关核心运行时依赖修正**：将 `server/package.json` 中的 `express` 与 `ws` 从 `devDependencies` 正式移入 `dependencies`，避免独立安装或作为库引用 `@liguoshuai/pi-chat-server` 时出现 `Cannot find module` 运行时崩溃。

### Added & Enhanced
- **全仓版本一致性测试加固**：在 `clients/web/test/unit.test.js` 中新增对 Android（`build.gradle.kts` 的 `versionName` 与 `versionCode`）及 HarmonyOS（`app.json5` 的 `versionName` 与 `versionCode`）元数据的自动化断言校验，实现全仓 8 个版本清单文件 100% 自动化测试守卫。
- **配置与文档补全**：根目录 `.env.example` 补充 `LONG_RUNNING_TIMEOUT_MS=600000` 长任务超时环境变量说明与注释。
- **构建命令与测试解耦**：解耦根 `package.json` 中 `build` 脚本与 `test` 脚本，新增 `check`（一键检查 `build + test`），消除 CI 流水线中重复跑两遍测试的问题。
- **前端渲染模块化抽离**：将 Web 端 `clients/web/public/app.js` 中独立自包含的 Markdown 渲染与安全清洗逻辑提取至单独的 `markdown.js` 模块，提升前端架构可维护性与代码整洁度，保持零打包构建与开箱即用特性。

### Changed
- 全端版本号统一递增至 2.15.2（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.1] - 2026-09-05

### Fixed
- **修复 Android ChatScreen.kt 编译错误**：删除 `ToolCallBlock` 函数中残留的孤立代码片段（来自此前重构的遗留），修复大括号不平衡导致的 `Syntax error: Expecting a top level declaration` 编译失败。

### Changed
- 全端版本号统一递增至 2.15.1（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.0] - 2026-09-05


## [2.14.14] - 2026-09-05

### Fixed & Optimized
- **优化移动端思考流与工具执行过程展示**：
  - Android 客户端 `ChatRepository` 补全 `thinking_start`、`thinking_end`、`text_start`、`text_end`、`toolcall_*` 等细粒度流式事件状态流转，修复思考过程状态无法及时闭环或卡在 active 状态的问题。
  - Android 客户端 `ThinkingBlock` 增加清晰的可展开提示标识；`ToolCallBlock` 支持执行中自动展开命令参数与实时输出，执行完成后可一键复制与折叠。
  - HarmonyOS 客户端 `ChatViewModel` 同步补齐思考流全生命周期方法（`startThinking`、`finishThinking`、`setAssistantFinalText`）。
- **统一全仓 Monorepo 版本号**：同步递增至 `v2.14.14`。

## [2.14.13] - 2026-09-05

### Fixed
- **文档整理与路径修正**：
  - 将 `CHANGELOG.md` 与 `ISSUES.md` 从 `clients/web/docs/` 迁移至项目根 `docs/`，与 `ARCHITECTURE.md`、`USER_JOURNEY.md` 统一收纳。
  - 修复 `clients/web/docs/ARCHITECTURE.md` 中残留的旧版本号引用（v2.14.5 → v2.14.13）及过时的目录结构（移除不存在的 `package-lock.json`、已迁出的 `ISSUES.md` / `CHANGELOG.md`）。
