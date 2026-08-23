# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
