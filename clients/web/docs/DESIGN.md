# 详细设计与决策文档

## 目标

将 [pi](https://pi.dev) 终端编码代理包装为一个**类 ChatGPT / Gemini 的 Web 界面**，使用户能够：

- 在浏览器中与 pi 展开对话，享受流式文本输出、思考过程卡片、Markdown 渲染与工具调用可视化；
- 与终端共享会话历史（一份存储、两端可见）；
- 支持后台持久化运行：关闭标签页或切换设备不打断正在生成的任务，重新进入时自动追进度。

非目标：
- 引入复杂的前端构建链（保持单页原生 JS/CSS，无打包工具）；
- 替代 pi 本身的文件存储层或重新实现数据库。

---

## 核心设计与进程模型

### 进程池化与后台持久化运行

```
Browser Tab 1 ──┐
                ├── WebSocket ──► server.js (activeAgents[Key]) ──stdio (JSONL)──► pi (rpc mode)
Browser Tab 2 ──┘
```

与早期“1 个 WebSocket = 1 个子进程”不同，当前设计以 **Session Key**（`${cwd}:${resolvedSessionPath}`）作为唯一标识：

1. **多端/多标签页共享**：多个浏览器标签页或多个设备打开同一个 Session 时，附加到同一个 `PiAgent` 实例。
2. **后台任务持久化**：关闭网页仅表示断开 WebSocket 连接，`PiAgent` 会继续运行直到当前的流式任务结束。
3. **离线 Buffer 与回放**：在无客户端连接期间，pi 抛出的事件将缓存在 `eventBuffer` 环形队列中。新客户端连接后，服务端通过 `backfill_start` → 增量事件 → `backfill_end` 进行追回。
4. **真·空闲回收（True-Idle Timeout）**：仅在“无 WebSocket 连接”且“真正 Idle”（非 streaming，无挂起 RPC 请求）时启动 `IDLE_TIMEOUT_MS`（默认 5 分钟）倒计时回收进程。

---

## 数据流设计

### 1. 消息发送与流式渲染

```
1. 浏览器发送 JSON: {"type": "prompt", "message": "..."}
2. 服务端转给对应 Session 的 PiAgent
3. PiAgent 更新状态为 streaming，写入 pi 的 stdin
4. pi 往 stdout 输出事件流 (agent_start / text_delta / toolcall_start / agent_end / agent_settled)
5. 服务端广播给所有连入该 Session 的 WebSocket，并写入离线 Buffer（若无连接）
6. 浏览器 handlePiMessage 增量更新 DOM（文本、思考块、工具卡片）
```

### 2. 中途中断与转向（Steering）

在代理正在执行长任务或工具调用时，用户可以输入补充指令：
- **Abort**：发送 `{"type": "abort"}` 中断当前生成。
- **Steer**：发送 `{"type": "steer", "message": "..."}` 插入中途指令，指导代理调整后续行动。

---

## 关键设计决策与权衡

### 1. 渲染策略：重构 vs 增量 DOM

针对流式输出中出现的文本、思考块（Thinking）、工具卡片交错问题：
- 选择**每次更新时重构当前 assistant 消息的内容节点**。因为单次回复文本长度通常有限，原生 DOM 节点重写开销在 5ms 以内，极大地简化了复杂的节点插入与折叠逻辑。

### 2. 代次标记（`wsGen`）

解决浏览器在极短时间内快速切换 WebSocket 会话时的竞态：
- 全局分配单调递增的 `wsGen` 代次。每次建立新 WebSocket 时递增。在接收消息前比对 `ws._gen === wsGen`，避免旧连接迟到的消息破坏新会话的状态。

### 3. Markdown 渲染：Escape-First 零依赖

不使用第三方大型 Markdown 渲染库，采用原生轻量处理：
- 在渲染入口统一对文本做 HTML Escape 转义（防止 XSS 攻击）；
- 先将围栏代码块（Fenced Code Blocks）抠出暂存，再做行内语法转换，最后还原代码块。

---

## 消息事件与 UI 控件对照表

| pi RPC 事件 | 触发动作 / 前端 UI 表现 |
|-------------|-------------------------|
| `agent_start` | 切换发送按钮为“停止/中止”状态，标志进入流式生成状态 |
| `message_start` | 在聊天区域末尾追加新的 Assistant 消息卡片 |
| `message_update` / `text_delta` | 累加到文本缓冲并重新渲染 Markdown |
| `message_update` / `thinking_delta` | 累加到 Thinking 折叠卡片并实时显示 |
| `message_update` / `toolcall_start` | 创建可视化工具调用卡片（可折叠） |
| `tool_execution_start / update / end` | 动态更新工具卡片的输入参数、标准输出与执行状态 |
| `agent_end` / `agent_settled` | 恢复发送按钮，标记流式生成结束，触发侧边栏会话列表刷新 |
| `backfill_start` / `backfill_end` | 前端标记处于历史回放状态，回放期间暂停自动滚动，回放结束后一次性同步状态并滚动到底部 |
