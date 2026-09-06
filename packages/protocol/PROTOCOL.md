# Pi-Chat 跨端通用通信协议标准 (Protocol Specification v1.0)

本协议定义了 Web 浏览器、Android 原生端、鸿蒙 (HarmonyOS ArkTS) 原生端与 Pi Agent Gateway（VPS 桥接网关）之间的通信标准。

---

## 1. 协议概览

Pi-Chat 支持双通道通信机制：
1. **WebSocket 全双工通道**（推荐）：用于低延迟交互、双向指令传输、流式打字机推送、会话状态同步及心跳保活。
2. **RESTful HTTP + SSE 通道**：用于轻量只读会话查询、环境检查以及服务端单向流式推送。

---

## 2. 鉴权与握手流程 (Authentication)

当服务端配置环境变量 `AUTH_TOKEN` 时，所有接入端必须携带有效的 Token。

### 2.1 WebSocket 鉴权方式
- **方式一（Query 参数）**：`ws://host:port/ws?cwd=/path&session=xxx&token=YOUR_TOKEN`
- **方式二（Upgrade Headers）**：`Authorization: Bearer YOUR_TOKEN`
- **方式三（初始 Handshake 消息）**：建立连接后 3 秒内发送：
```json
{
  "type": "auth",
  "token": "YOUR_TOKEN"
}
```

### 2.2 HTTP / REST / SSE 鉴权方式
- **Header 鉴权**：`Authorization: Bearer YOUR_TOKEN`
- **Query 鉴权**：`GET /api/stream?cwd=...&session=...&token=YOUR_TOKEN`

---

## 3. 心跳保活机制 (Heartbeat)

为了避免移动端（Android/鸿蒙）因 NAT 超时或网络切换导致连接断开：
1. **协议层 Ping/Pong**：网关每 30 秒向客户端发送标准 WebSocket Ping 帧。
2. **应用层 Ping/Pong**：客户端可主动周期性发送应用层消息：
   - 客户端请求：`{ "type": "ping", "timestamp": 1725000000000 }`
   - 服务端响应：`{ "type": "pong", "timestamp": 1725000000000 }`

---

## 4. 客户端 -> 服务端 指令格式 (Client -> Server)

### 4.1 发送提示词 (Prompt / Client Send)
兼容 `type: "prompt"` 与 `type: "client_send"`：
```json
{
  "type": "prompt",
  "message": "帮我写一个快速排序算法",
  "images": [
    {
      "type": "image",
      "data": "data:image/png;base64,...",
      "mimeType": "image/png"
    }
  ]
}
```

### 4.2 转向引导指令 (Steer)
在模型思考或任务运行中途给予方向纠正：
```json
{
  "type": "steer",
  "message": "请使用 Kotlin 语言实现"
}
```

### 4.3 中止生成 (Abort)
```json
{
  "type": "abort"
}
```

### 4.4 切换会话 (Switch Session)
```json
{
  "type": "switch_session",
  "sessionPath": "/home/user/.pi/agent/sessions/xxxx.jsonl"
}
```

### 4.5 新建会话 (New Session)
```json
{
  "type": "new_session"
}
```

### 4.6 模型与思考等级切换
```json
{
  "type": "set_model",
  "provider": "anthropic",
  "modelId": "claude-3-5-sonnet-20241022"
}
```
```json
{
  "type": "set_thinking_level",
  "level": "medium"
}
```

---

## 5. 服务端 -> 客户端 消息格式 (Server -> Client)

### 5.1 流式打字机增量推送 (Agent Stream)
```json
{
  "type": "agent_stream",
  "delta": "这里是追加的文本片段",
  "isThinking": false
}
```

### 5.2 状态变迁事件 (Agent Status / Lifecycle)
- `agent_start`：任务开始生成
- `agent_end`：单轮回答生成完毕
- `agent_settled`：整体任务收敛完成
```json
{
  "type": "agent_status",
  "status": "streaming",
  "timestamp": 1725000000000
}
```

### 5.3 断线重连回填 (Replay / Backfill)
客户端重连或切回后台时，服务端重放未接收的历史片段：
```json
{ "type": "backfill_start", "count": 15 }
... 历史消息流 ...
{ "type": "backfill_end", "streaming": true, "state": "streaming" }
```

### 5.4 错误响应 (Error)
```json
{
  "type": "error",
  "code": "unauthorized",
  "message": "Missing or invalid token"
}
```

---

## 6. REST API 契约列表

| 路径 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/api/config` | `GET` | 获取 VPS 环境配置、工作目录与默认模型信息 |
| `/api/sessions` | `GET` | 获指定工作目录下所有历史会话列表（按时间倒序） |
| `/api/session` | `GET` | 读取指定 `.jsonl` 会话的完整树形/线性消息历史 |
| `/api/session` | `DELETE` | 删除指定会话文件并释放内存中 Agent 进程 |
| `/api/agents` | `GET` | 查看当前后台活跃的 Pi Agent 实例状态与任务详情 |
| `/api/set-default-model` | `POST` | 修改全局或项目级默认模型配置 |
| `/api/validate-dir` | `GET` | 校验目标工作目录在 VPS 上是否存在且有权限 |
| `/api/stream` | `GET` | SSE 桥接流式推送端点 |
| `/api/chat` | `POST` | HTTP 方式发送消息 |
| `/api/abort` | `POST` | HTTP 方式中止当前任务 |
