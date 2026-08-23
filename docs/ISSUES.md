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

