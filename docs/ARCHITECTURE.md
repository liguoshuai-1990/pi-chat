# 架构设计文档

> pi-web-chat 的技术架构、数据流、关键设计决策与扩展点说明（对应 v1.8.3 版本）。

---

## 1. 高层架构

```
┌─────────────────┐             WebSocket (JSON)             ┌──────────────────────┐
│  Browser Tab A  │ ◄──────────────────────────────────────► │                      │
└─────────────────┘                                          │                      │
┌─────────────────┐                                          │  Node.js server      │
│  Browser Tab B  │ ◄──────────────────────────────────────► │  (server.js)         │
└─────────────────┘                                          │                      │
                                                             │  ┌────────────────┐  │
                                                             │  │  PiAgent Pool  │  │
                                                             │  │ (activeAgents) │  │
                                                             │  └───────┬────────┘  │
                                                             └──────────┼───────────┘
                                                                        │
                                                    spawn child_process │ (1 agent per session key)
                                                                        ▼
                                                             ┌──────────────────────┐
                                                             │   pi --mode rpc      │
                                                             │   (后台 Agent 子进程)  │
                                                             │   stdin/stdout       │
                                                             └──────────┬───────────┘
                                                                        │
                                                     ┌──────────────────┼──────────────────┐
                                                     ▼                  ▼                  ▼
                                            ~/.pi/agent/sessions/   ~/.pi/agent/       配置/扩展/
                                            --home-zrlgs--/         extensions/        skills/
                                                    │
                                                    ▼
                                            *.jsonl (append-only tree)
```

**核心设计原则**：
- **按 Session Key 池化进程**：以 `${cwd}:${resolvedSessionPath}` 作为唯一 Key，多标签页或多设备连接同一个 Session 时共享同一个后台 `PiAgent` 进程。
- **后台持久化运行（Headless Persistence）**：网页断开（如关闭标签页）不会立即终止进程。只要 Agent 处于流式生成或有未响应请求状态，后台进程会坚持跑完当前任务。
- **离线事件环形缓存与回放（Ring Buffer & Backfill）**：无客户端连接时，pi 输出的事件自动存入环形 Buffer（默认 2000 条）。客户端重连时通过 `backfill_start` → 离线事件 → `backfill_end` 进行增量补齐。
- **真正空闲回收（True-Idle Timeout）**：仅在“无 WebSocket 连接”且“进程彻底进入 idle（非 streaming、无挂起 RPC）”时，才启动 `IDLE_TIMEOUT_MS` 空闲回收倒计时。
- **磁盘 JSONL 为唯一真理（Single Source of Truth）**：会话历史与树状分支全由 pi 本身维护在磁盘 `.jsonl` 文件中，Web 端通过 REST 接口与 RPC 消息与文件保持同步。
- **`pi` 可执行文件自动探查与派生**：服务端通过 `resolvePiBin()` 自动定位全局安装的 `pi` 可执行文件（优先使用 `PI_BIN` 环境变量 -> 检查 `~/.npm-global/bin/pi` -> `/usr/local/bin/pi` -> `/usr/bin/pi` -> 系统 `PATH`），派生 `pi --mode rpc --session-dir ...` 子进程。

---

## 2. 关键数据流

### 2.1 打开已有会话与增量回放（Backfill）

```
Browser                          server.js                      PiAgent (RPC)
  │                                 │                                │
  ├─ GET /api/session?file=X ──────►│ 读 JSONL 主干消息               │
  │◄─── { header, entries[] }──────┤                                │
  │                                 │                                │
  ├─ 渲染历史消息                    │                                │
  │                                 │                                │
  ├─ WS /ws?cwd=...&session=X ─────►│ 查找/创建 activeAgents[Key]     │
  │                                 ├─► attachWs(ws)                 │
  │                                 ├─► 发现有离线缓存事件            │
  │◄─── { type: "backfill_start" }─┤                                │
  │◄─── N 条离线事件 (text_delta…)  │ (将离线事件批量回放给当前 ws)      │
  │◄─── { type: "backfill_end" }───┤                                │
  │                                 │                                │
  ├─ 矫正当前 streaming 与 Composer 状态                              │
```

### 2.2 新建会话与发送消息

```
Browser                         server.js                       pi RPC 子进程
  │                                │                                 │
  ├─ WS /ws?cwd=... (无 session)   │ spawn pi --mode rpc             │
  │                                │◄─ pi 创建新 session jsonl       │
  │◄─── ws open (状态记为已连接)     │                                 │
  │                                │                                 │
  ├─ sendWs({type:"prompt", ...})─►│────────────────────────────────►│
  │                                │                                 ├─ agent_start (state=streaming)
  │◄─── message_update/text_delta ─┼◄────────────────────────────────┤
  │◄─── agent_settled              │◄────────────────────────────────┤ (state=idle)
  │                                │                                 ├─ session 文件实时追加
```

### 2.3 中途插话 / 转向（Mid-turn Steering）

```
Browser                         server.js                       pi RPC 子进程
  │                                │                                 │
  ├─ Agent 处于 streaming 状态 ────┼─────────────────────────────────┤ (正在执行长任务/工具)
  ├─ sendWs({type:"steer", ...})──►│────────────────────────────────►│
  │                                │                                 ├─ 注入 steer 命令
  │◄─── agent 收到并调整后续思考 ────┼◄────────────────────────────────┤
```

---

## 3. 关键模块职责

### 3.1 `server.js`

| 模块/函数 | 职责 |
|-----------|------|
| `PiAgent` 类 | 管理单个 `pi --mode rpc` 子进程：维护状态（`idle`/`streaming`）、离线事件 Buffer、挂起请求表、真·空闲回收定时器与硬生存上限定时器。 |
| `activeAgents` Map | 以 `${cwd}:${sessionFile}` 为 Key 的进程池，实现多端/多标签页共享。 |
| `GET /api/sessions` | 扫描 `~/.pi/agent/sessions/**/*.jsonl`，读取 header 做 cwd 过滤，按更新时间排序返回。 |
| `GET /api/session` | 读取单个 `.jsonl` 文件，按 parentId 关系重构叶子到根节点的标准对话链。 |
| `GET /api/agents` | 暴露后台活跃 Agent 的状态信息（运行状态、客户端数量、存活时长、离线 Buffer 消息数、最近提示词等）。 |
| `WebSocketServer` | 处理连接建立与断开，分发 `prompt`、`steer`、`abort`、`ping` 等指令，并在 `SIGINT`/`SIGTERM` 时进行优雅关闭。 |

### 3.2 `public/app.js`

| 模块/函数 | 职责 |
|-----------|------|
| `state` | 全局状态对象：维护 `wsConnected`、`streaming`、`isBackfilling`、`activeToolCalls`、`sessionId`、`wsGen` 等。 |
| `connectWs(opts)` | 管理 WebSocket 生命周期：携带代次 `wsGen` 防止旧消息污染，处理重连逻辑与心跳。 |
| `handlePiMessage(obj)` | 核心事件分发器：处理 `backfill_start`/`backfill_end`、16 种 pi 事件以及状态同步。 |
| `ensureStreamingMsg / refreshStreamingContent` | 增量渲染/更新正在流式的文本、思考过程（Thinking）与工具卡片。 |
| `renderMarkdown` | 自研轻量 Markdown 渲染器（代码块抠出保护、Html Escape、行内语法转换）。 |

### 3.3 `public/style.css`

- 暗色与明色响应式样式变量。
- 左侧 260px 侧边栏与右侧主聊天区自适应布局。
- 移动端 Fixed 顶栏、Viewport height 100dvh 适配与悬浮置顶按钮（FAB）。

---

## 4. 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| **进程池粒度** | **Session Key 池化** | 允许同一会话在多设备/多 Tab 间同步，同时保证进程资源不重复浪费。 |
| **断连处理** | **后台继续跑 + 环形 Buffer 回放** | 解决关闭标签页导致未完成任务断掉的问题；用环形 Buffer 防止长时间离线膨胀内存。 |
| **回收策略** | **真·空闲倒计时（True-Idle Timeout）** | 区分“无连接”与“真正的空闲”，保障长时间后台生成任务不被中断。 |
| **通讯协议** | **直接透传 pi 原生 JSONL** | 不做二次包装，保持与 pi RPC 协议同频更新。 |
| **持久化** | **复用 pi 本身 .jsonl** | 零额外存储依赖，Web 端与终端命令完全同源共享会话。 |

---

## 5. 配置与环境变量

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | `3000` | HTTP 与 WebSocket 监听端口 |
| `PI_BIN` | 自动探测 | pi 可执行文件绝对路径 |
| `PI_SESSIONS_DIR` | `~/.pi/agent/sessions` | 会话 JSONL 文件存取目录 |
| `IDLE_TIMEOUT_MS` | `300000` (5分钟) | 真正空闲（无连接+非流式）后的回收超时（0 为禁用回收） |
| `MAX_AGENT_LIFETIME_MS` | `1800000` (30分钟) | 单个 Agent 进程后台生存硬上限（0 为无上限） |
| `EVENT_BUFFER_SIZE` | `2000` | 离线环形 Buffer 允许缓存的最大事件条数 |
| `MAX_CONCURRENT_AGENTS` | `0` (无限制) | 进程池最大并发 Agent 进程数量 |
| `IDLE_DROP_HEAP` | `false` | 进入空闲时是否给 V8 引擎 GC 提示（需 `--expose-gc`） |

---

## 6. 目录结构

```
pi-web-chat/
├── README.md                       # 主说明文档
├── package.json
├── package-lock.json
├── server.js                       # Express + WebSocket 服务器与 PiAgent 管理
├── bin/
│   └── pi-web-chat.js              # 可执行入口
├── public/
│   ├── index.html                  # 单页 UI
│   ├── app.js                      # 前端逻辑与状态机
│   └── style.css                   # CSS 样式
├── docs/                           # 所有文档统一收纳
│   ├── ARCHITECTURE.md             # 架构设计文档（本文件）
│   ├── DESIGN.md                   # 详细设计与决策文档
│   ├── ISSUES.md                   # 排查与修补记录
│   └── CHANGELOG.md                # 版本变更日志
└── scripts/                        # 服务安装/卸载脚本
    ├── install-service.sh
    └── pi-web-chat.service
```
