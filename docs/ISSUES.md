# 问题排查与修补记录

项目开发与演进过程中遇到并修复的技术问题与设计优化记录。

---

## 1. 侧边栏 `cwd` 路径编码错误

**症状**：API `GET /api/sessions?cwd=/home/zrlgs` 拿不到任何结果。

**根因**：第一版用了 `cwd.replace(/\//g, "-")` 把 `/home/zrlgs` 编码成 `-home-zrlgs`，但 pi 实际上用的是 `--home-zrlgs--`（前后都带 `-`）。

**修复**：弃用编码猜测，扫描 sessions 根目录下所有子目录，读每个 jsonl 的 header 里 `cwd` 字段，再按 `cwd` 严格比对过滤。

---

## 2. 关闭网页标签页导致正在生成的 pi 任务中断

**症状**：在用户提交了一个复杂 Prompt（或正在跑 Bash 工具）后关闭网页，AI 回答直接中断，下次连入时拿不到完整结果。

**根因**：原先 WebSocket 断开会直接触发 5 分钟倒计时杀进程；即使倒计时未到，没有客户端连入时生成的事件也被直接抛弃，未在内存中保留。

**修复**：
- 引入 **PiAgent 进程池化** 与 **真·空闲回收（True-Idle Timeout）**：只有在“无 WS 连接”且“真正 Idle”（非 streaming、无挂起 RPC）时才倒计时。
- 引入 **离线事件环形 Buffer（Event Ring Buffer）**：无客户端时缓存在 Buffer，新连接重连时发送 `backfill_start` → 增量事件 → `backfill_end` 进行追回并一次性同步状态。

---

## 3. 局域网 / 移动端 Safari 100vh 动态导航栏遮挡底部输入框

**症状**：移动端 Safari 浏览器打开 Web 界面时，底部输入框被 iOS 动态地址栏遮挡，且顶栏在滚动时会跟着滑走。

**修复**：
- 在 CSS 中使用 `100dvh` (Dynamic Viewport Height) 替代 `100vh`。
- 将顶栏改为 `sticky` / `fixed` 布局，保障移动端交互体验。
- 增加悬浮置顶/置底快捷按钮（FAB）。

---

## 4. WebSocket 代次竞态 —— 旧 socket 残留消息污染新会话

**症状**：点“新对话”快速发消息时，前一次会话延迟到达的 `agent_end` / `agent_settled` 事件跑进新会话，导致新会话 `streaming` 状态被错误覆盖。

**修复**：
- 引入全局 `wsGen` 单调递增计数器，给每个 WebSocket 分配 `_gen` 编号。
- 接收消息前比对代次，丢弃非当前代次发来的旧事件。

---

## 5. `/api/session` 中局部变量遮蔽 Node `path` 模块

**症状**：在调用 `/api/session` 接口获取历史对话时，出现 `TypeError: path.basename is not a function` 报错。

**根因**：函数内部在处理 jsonl 包含的文件条目时，使用了 `const path = ...` 局部变量名，屏蔽了 Node.js 顶层的 `import path from "node:path"` 模块。

**修复**：重命名局部变量为 `filePath` / `resolvedPath`，消除变量同名遮蔽。

---

## 6. 多设备 / 多 Tab 共享会话不同步

**症状**：同一个 Session 在手机和电脑上同时打开时，手机发送的消息电脑看不到，状态互相覆盖。

**修复**：
- 以 Session Key 为粒度管理 `PiAgent` 实例。
- 任何一个客户端发送 `prompt` 或 `steer` 指令时，通过 `agent.wsSend(..., senderWs)` 广播同步给连入该 Session 的其他客户端。

---

## 7. 新建会话时 URL、侧边栏高亮与会话状态未即时绑定

**症状**：新建对话并发送消息后，底层已生成 session jsonl，但浏览器 URL 仍为 `/`，`state.currentSessionFile` 为空，刷新页面后丢失当前会话视图，侧边栏也无法立即高亮当前项。

**根因**：前端仅在显式点击侧边栏会话或调用 `switch_session` 时才绑定 `state.currentSessionFile`，未在 `prompt` 返回包含 `sessionFile` 的 RPC 数据时即时同步。

**修复**：在前端 `handlePiMessage` 入口增加对 `obj.data?.sessionFile` 的自动感知与绑定，一旦检测到新分配的 sessionFile，即时更新 `state.currentSessionFile`、通过 `history.replaceState` 同步浏览器 URL 并刷新侧边栏高亮。

---

## 8. 历史会话内容反序列化时潜在的 null 分片过滤崩溃

**症状**：当历史会话 jsonl 中偶发由于中断或格式异常导致 content 数组中包含 `null`/`undefined` 元素时，`extractText` 会触发 `TypeError: Cannot read properties of null (reading 'type')`。

**修复**：在 `server.js` 的 `extractText` 过滤器中加入判空保护 `c && (c.type === "text" || typeof c === "string")`。

---

## 9. 移动端侧边栏底部连接状态与版本号被遮挡/不可见

**症状**：在手机端浏览器打开左侧抽屉（Sidebar）时，底部的“已连接 / 版本号”信息看不到或被系统手势栏/底栏遮挡。

**根因**：
1. 移动端 `.sidebar` 样式设置了固定 `height: 100vh`，而手机浏览器 `100vh` 包含了底部工具栏高度，导致底部区域被挤出屏幕外。
2. `.session-list` 缺少 `min-height: 0` 约束，会话数量多时 flexbox 未能限制高度，将 `.sidebar-bottom` 顶出视口。
3. 缺少 `env(safe-area-inset-bottom)` 安全区域边距，导致贴底元素被全面屏手势条遮挡。

**修复**：
- 移动端 `.sidebar` 改用 `height: 100dvh; max-height: 100dvh; overflow: hidden;`。
- 给 `.session-list` 增加 `min-height: 0`，给 `.sidebar-bottom` 增加 `flex-shrink: 0`。
- 引入 `safe-area-inset-bottom` 底部安全区自适应内边距，并将 z-index 提升至 105，确保手机端完整可见。

---

## 10. 页面初次加载时服务端配置加载与 WebSocket 连接的竞态

**症状**：在未设置 localStorage CWD 时打开页面，前端顶栏胶囊显示为当前服务启动目录（`serverCwd`），但后端生成的 agent 子进程的工作目录实际上是用户的 home 目录（`~`），导致执行文件操作或命令时位置不一致。

**根因**：前端 `init()` 中 `loadServerConfig()` 异步发起 `/api/config` 请求，但没有等待返回就同步调用了 `connectWs({})`。此时 `state.cwd` 尚为空字符串 `""`，WebSocket URL 为 `/ws?cwd=`，后端 fallback 成了 `home()`。等到 fetch 返回后 `state.cwd` 虽被赋予 `serverCwd`，但 WebSocket 连接和 `PiAgent` 已经按 `home()` 创建。

**修复**：
- 前端 `init()` 改为异步函数，显式 `await loadServerConfig()` 保证配置解析完毕后再建立 WebSocket 连接或加载会话。
- 后端 `normalizeCwd(dir)` 在 `dir` 为空时优先返回 `process.cwd()`，其次回退到 `home()`，确保前后端默认工作目录始终精确一致。

---

## 11. 模型异常响应错误信息二次转义 (Double Escape)

**症状**：当模型返回错误（如 stopReason="error"）且错误信息中含有 `<`、`&` 等字符时，聊天框中显示为 `&lt;`、`&amp;` 字面量。

**根因**：`public/app.js` 在 `message_end` 处理中对 `errMsg` 调用了一次 `escapeHtml()`，随后 `refreshStreamingContent()` 调用 `renderMarkdown()` 时又内部进行了一次 `escapeHtml()`。

**修复**：移除 `message_end` 中冗余的 `escapeHtml()`，统一由 Markdown 渲染器进行安全转义。

---

## 12. Markdown 渲染中潜在的 XSS 注入安全漏洞 (HTML Attribute Breakout)

**症状**：若模型返回了特制格式的 Markdown 链接（例如 `[点击](http://abc.com" style="..." onmouseover="alert(1))`），该链接渲染为 HTML 时能逃逸 `href="..."` 属性，注入任意 HTML 属性与恶意 JavaScript。

**根因**：原先 `escapeHtml()` 仅转义了 `&`、`<`、`>`，未能转义双引号 `"` 与单引号 `'`，使得属性逃逸攻击成为可能。

**修复**：修改 `public/app.js` 中的 `escapeHtml()` 实现，额外对 `"` (`&quot;`) 与 `'` (`&#39;`) 进行了严格转义，阻止任何 HTML 属性级别的注入攻击。

---

## 13. 多设备 / 多 Tab 流式对话时新连入客户端无法追平进度

**症状**：在某一会话处于流式文本生成（Streaming）状态时，若用户在另一台设备或新的浏览器标签页中打开相同会话，由于 `PiAgent` 检测到已连接客户端而不将流式事件写入 `eventBuffer`，新连入的客户端无法回放当前的流式消息，导致其显示为空白、缺页或卡在加载中。

**根因**：
- 原逻辑在 `onPiMessage` 中判断只有在无客户端连接时才缓存事件（`if (!this.hasWs) this.bufferEvent(obj)`）。
- 离线回放完毕后，会强制清空环形 Buffer，导致后续其他客户端连入时无内容可播。

**修复**：
- 在 `server.js` 的 `onPiMessage` 逻辑中，当 `PiAgent` 处于繁忙或流式对话过程中（`this.isBusy` 为真）即便有客户端在线也开启缓存。
- 修改 `detachWs`，当所有连接断开但 Agent 仍在生成中时，保留 `eventBuffer` 保证继续录制。
- 修改 `replayBuffered`，在 Agent 仍处于 busy 状态时消费后不清空缓存，使多个设备/多个 Tab 可多次或同时连入并安全回溯追平全部生成细节，并在流式终止时通过 `agent_settled` 进行最终的统一清理。

---

## 14. 切换模型时触发 `appendSystemNotice is not defined` 报错

**症状**：在顶部模型下拉菜单中切换模型后，控制台报错 `ReferenceError: appendSystemNotice is not defined`，并在 `/api/log-error` 中记录错误日志。

**根因**：前端 `app.js` 在处理模型切换和接收 `set_model` 响应时调用了 `appendSystemNotice` 函数在消息流中插入切换提醒，但在重构时该辅助函数未被声明。

**修复**：在 `app.js` 中补充 `appendSystemNotice(text)` 实现，利用 CSS 中已定义好的 `.system-notice-divider` 与 `.system-notice-text` 类在聊天区尾部安全插入居中分割标签。

---

## 15. `cycle_thinking_level` 响应字段未正确更新思考深度

**症状**：通过 RPC 调用循环切换思考级别后，前端状态与顶栏思考胶囊未实时更新。

**根因**：Pi RPC 模式下 `cycle_thinking_level` 返回的响应数据为 `{ level: ThinkingLevel }`，而前端代码按 `obj.data?.thinkingLevel` 读取导致取得 `undefined`。

**修复**：在 `app.js` 中改为 `const newLevel = obj.data?.level || obj.data?.thinkingLevel;`，兼容标准 RPC 返回格式。

---

## 16. 自定义会话名称 (`session_info`) 无法在侧边栏与顶栏显示

**症状**：通过 `set_session_name` 重命名会话后，侧边栏列表中依然只展示第一条用户 prompt 提取出的简略标题。

**根因**：服务端 `getSessionMetadata` 和 `/api/session` 在逐行扫描 `.jsonl` 时只查找了 `type === "session"` 和 `type === "message"`，忽略了 `type === "session_info"` 记录。

**修复**：
- 服务端解析 `.jsonl` 时提取最新的 `session_info.name` 作为 `sessionName` 返回。
- 前端 `renderSidebar` 优先使用 `s.sessionName || s.firstUser || "新对话"` 进行渲染。

---

## 17. Systemd 用户服务中 `ProtectHome=read-only` 导致 Agent 读写工作区报错

**症状**：通过 `install-service.sh` 将服务安装至 systemd user 后，Pi 编程代理在用户项目目录中执行 `write` 或 `edit` 工具时触发 `EACCES` 权限拒绝错误。

**根因**：服务单元模板设置了 `ProtectHome=read-only` 并仅将 `~/.pi` 和 `~/.npm-global` 列入白名单，导致 Agent 无法在 `$HOME/projects` 等工作区目录下创建或修改文件。

**修复**：移除该限制，让 User-level 服务在常规用户权限上下文下直接操作工作区。

---

## 19. 移动端切换工作目录弹窗按钮超出边框

**症状**：在手机端点击顶栏切换工作目录（CWD Modal）时，右侧的“确定切换”按钮超出了弹窗白色/暗色卡片右边框。

**根因**：
1. 原生 `<input>` 元素具有默认的内在 `size`（`min-width: auto` 相当于约 180px~200px）。在小屏手机上，input 的内在最小宽度加上“确定切换”按钮宽度和弹窗内边距超出了视口总可用宽度。
2. 移动端没有针对 `.modal` 和 `.input-group` 进行专门的响应式约束和内边距收敛。

**修复**：
- 给 `.input-group input` 添加 `min-width: 0; box-sizing: border-box;`，确保其在 flex 容器中可以自由收缩。
- 在移动端媒体查询中调整弹窗内边距为 16px，优化输入框与按钮的 padding。
- 在 `<= 380px` 超窄屏设备上自适应将输入框与操作按钮上下垂直排列（`flex-direction: column`），确保彻底杜绝横向溢出。

**症状**：在手机端竖屏打开页面时，顶栏右侧的“深度思考 / 推理级别”（`🧠 High`）胶囊被挤压，只能看到一半的脑花图标，文本完全不可见。

**根因**：移动端媒体查询中为 `.model-pill-container` 设置了 `max-width: 130px` 的硬限制。由于模型胶囊占据了大部分宽度，容器剩余宽度不足以完整容纳思考胶囊，导致其被裁剪。

**修复**：
- 移除移动端 `.model-pill-container` 的 `max-width: 130px` 限制，改为弹性无约束容器。
- 优化顶栏各按钮尺寸与间距：缩小菜单按钮为 36px，工作目录胶囊限制最大 75px，模型胶囊适度缩略模型名并隐藏手机端冗余的“默认”徽章，为思考胶囊留出充足显示空间。
- 追加 `<= 360px` 极窄屏响应式规则，确保在 iPhone SE 等小屏设备上也能完整显示。



