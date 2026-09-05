# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [2.15.7] - 2026-09-05

### Fixed
- **Server: /api/log-error 端点添加认证中间件** — 修复未认证客户端可无限调用日志注入端点的安全漏洞 (S1)。
- **Server: 添加 unhandledRejection / uncaughtException 全局异常兜底** — 防止未捕获的 Promise rejection 导致进程崩溃 (C1)。
- **Server: CORS 默认策略收紧** — 未配置 ALLOWED_ORIGINS 时仅允许 localhost 跨域，不再反射任意 Origin (C2)。
- **Server: WebSocket 消息处理补全 .catch()** — PROMPT/STEER/NEW_SESSION 三处 agent.send().then() 均添加错误捕获 (H1)。
- **Server: SSE keepalive setInterval 添加 .unref()** — 防止 SSE 连接阻止进程优雅退出 (H2)。
- **Server: Express body parser 限制从 50MB 降至 10MB** — 减少内存耗尽攻击面 (M11)。
- **HarmonyOS: 侧边栏版本号修正** — 从硬编码的 v2.11.3 修正为 v2.15.7 (HC3)。
- **HarmonyOS: errorMessage 渲染到 UI** — 添加错误横幅，之前 12+ 处错误赋值对用户完全不可见 (HC2)。
- **Android: error StateFlow 渲染到 UI** — 收集并显示 error 流，添加可关闭的错误横幅 (AC3)。

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
