# @liguoshuai/pi-chat-server — Pi Agent Gateway

`@liguoshuai/pi-chat-server` 是运行在 VPS 上的 Pi Agent 桥接网关服务，负责协调管理底层 `pi --mode rpc` 子进程，为 Web 前端、Android 原生端以及鸿蒙原生端提供统一的 WebSocket、SSE、RESTful API 与 Token 鉴权。

---

## 核心特性

- **多端全双工网关**：原生支持 Web、Android (OkHttp Flow) 与 HarmonyOS (@ohos.net.webSocket)。
- **统一 Token 鉴权**：支持 `AUTH_TOKEN` 环境变量，拦截未授权 HTTP/SSE/WebSocket 连接。
- **打字机流式推送**：双通道（WebSocket 实时帧 / SSE 增量事件）低延迟文本增量同步。
- **断线无损回填 (Replay Buffer)**：客户端断网重连或切回前台时，自动回填断开期间生成的完整消息流。
- **会话持久化与后台常驻**：客户端断开后后台任务继续执行，空闲指定时间后自动回收内存。
- **CSWSH 跨域防护与心跳保活**：自带 30s 协议层 + 应用层心跳检测，自动清理失效连接。

---

## 环境变量配置

| 变量名 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 绑定网卡地址 |
| `AUTH_TOKEN` | `""` (留空不鉴权) | 统一访问 Token（Bearer Token / ?token=） |
| `PI_BIN` | 自动检测 | pi 可执行文件绝对路径 |
| `PI_SESSIONS_DIR`| `~/.pi/agent/sessions` | 会话 JSONL 存储目录 |
| `IDLE_TIMEOUT_MS`| `300000` (5分钟) | 无客户端连接且空闲时自动回收进程的超时时间 (0 为不回收) |
| `MAX_CONCURRENT_AGENTS` | `0` (无限制) | 允许并发运行的最大 Pi Agent 子进程数量 |
| `ALLOWED_ORIGINS`| `""` | 允许的外部跨域 Origin（逗号分隔） |

---

## 快速启动

```bash
# 启动网关服务
pnpm --filter @liguoshuai/pi-chat-server start

# 开发模式（监听热重载）
pnpm --filter @liguoshuai/pi-chat-server dev
```
