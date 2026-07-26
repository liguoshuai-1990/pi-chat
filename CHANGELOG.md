# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Added
- 会话切换时右侧完整历史恢复（通过 REST `/api/session` 重建 parent 链）
- 模型切换器（顶栏 pill，支持所有 pi 配置的模型）
- Tool-call 折叠块（实时输出、可展开/折叠）
- Thinking 折叠块
- 发送按钮双态（发送/停止）+ 红色停止态
- 新会话后侧边栏在 `agent_settled` 立即刷新（无需手动刷新页面）

### Changed
- 侧边栏会话项去除无意义的 `●` 圆点，改为 tooltip 显示完整 jsonl 路径
- 发送按钮禁用逻辑：仅在 wsConnected=false 时禁用，而非 streaming 时

---

## [0.2.0] - 2026-07-19

### Added
- **新建会话流程修复**：`btnNew` 点击后刷新侧边栏、清理流式状态、生成新 ws 代次
- **WebSocket 代次机制**：`wsGen` 防止旧 socket 消息污染新上下文
- **输入框红边提示**：ws 未连时提交会有 350ms 红色 flash
- **连接状态文本动态更新**：「连接中…」→「已连接」/「已断开」
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

### Technical Debt (已知)
- 图片上传未接
- 多 cwd / 项目切换器未做
- fork / tree / clone 浏览未接
- 浅/深主题切换未做
- 双端实时同步未做
- 鉴权未做

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