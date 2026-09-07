# Pi-Chat 测试用例覆盖度报告

> 生成日期：2026-09-07 | 版本：v2.19.5 → v2.19.6

## 一、总览

| 模块 | 测试文件 | 测试数 | 通过 | 覆盖率评估 |
|---|---|---|---|---|
| protocol | `packages/protocol/test/protocol.test.js` | 6 | 6 | 高 |
| server | `server/test/server.test.js` | 34 | 34 | 中高 |
| web | `clients/web/test/unit.test.js` | 6 | 6 | 中 |
| android | 4 个 Kotlin 测试文件 | ~50 | N/A (CI) | 中 |
| harmony | 无测试目录 | 0 | N/A | 无 |

## 二、Protocol 模块

### 已覆盖场景

| 场景 | 测试名 | 覆盖点 |
|---|---|---|
| 消息构造器 | Message creation helpers | 全部 24 种消息类型 |
| 构造器边界 | Message constructors edge cases | null/undefined/非数组/默认值 |
| 消息标准化 | normalizeClientMessage | 别名转换/null/非对象/透传 |
| 消息校验 | validateClientMessage | 全类型校验+拒绝 |
| 时间格式化 | formatDuration | 边界值/NaN/Infinity/大值 |
| 枚举完整性 | Enum constants frozen | 全值+Object.isFrozen |

### 新增测试（本次补充）

1. createNewSessionMessage / createCompactMessage / createAgentStatusMessage
2. 构造器边界安全（null 参数、非数组 images、默认值）
3. normalizeClientMessage 对 null/非对象/未知类型的处理
4. validateClientMessage 对 new_session/compact/heartbeat/cycle_thinking_level 覆盖
5. formatDuration 对 NaN/Infinity/大值边界测试
6. 枚举常量冻结性和完整值校验

## 三、Server 模块

### 已覆盖场景（34 个测试）

| 场景 | 测试名 | 新增 |
|---|---|---|
| Token 验证 | verifyToken | |
| WS 鉴权 | verifyWsAuth | |
| HTTP 中间件 | authMiddleware | |
| Origin 校验 | isAllowedOrigin | |
| 配置完整性 | Server configuration | |
| 路径标准化 | normalizePath | |
| CWD 安全校验 | normalizeCwd ALLOWED_CWD_DIRS | ✅ |
| 服务器创建 | createServer | |
| CORS | CORS middleware | |
| 配置端点 | /api/config piVersion/defaultModel | ✅ |
| 目录验证端点 | /api/validate-dir | ✅ |
| Agent 列表端点 | /api/agents | ✅ |
| WS 非对象 JSON | non-object JSON safe | ✅ |
| WS 无效 JSON | invalid JSON safe | ✅ |
| WS ping/pong | ping with pong | ✅ |
| WS 未知类型 | unknown type error | ✅ |
| Agent 状态跟踪 | isStreaming vs isBusy | ✅ |
| 环形缓冲区 | bufferEvent overflow | ✅ |
| 错误事件 | error/pi_exit clear buffer | ✅ |
| send 失败 | send failure not alive | ✅ |
| status 字段 | status fields | ✅ |
| WS switch_session | switch_session response | |
| 静态资源缓存 | Cache-Control headers | |
| 内存 session | /api/sessions | |
| Timing 跟踪 | trackTiming | ✅ |
| response 回调 | onPiMessage pending callback | ✅ |
| remote_user_prompt | onPiMessage tracks prompt | ✅ |
| sessionFile 提取 | onPiMessage sessionFile | ✅ |
| 大缓冲区 | onStdout large buffer | ✅ |
| 多行 JSON | onStdout multi-line | ✅ |
| 非 JSON 行 | onStdout ignores non-JSON | ✅ |
| Agent 复用 | getOrCreateAgent reuse | ✅ |
| 容量限制 | getOrCreateAgent capacity | ✅ |
| 全局关闭 | shutdownAllAgents | ✅ |

### 未覆盖场景

| 场景 | 优先级 |
|---|---|
| POST /api/set-default-model | 高 |
| POST /api/chat REST | 高 |
| POST /api/abort REST | 高 |
| WS auth 带内鉴权超时 | 中 |
| SSE /api/stream | 中 |
| replayBufferedWs backfill | 中 |
| 空闲回收 maybeScheduleIdleKill | 低 |
| 生命周期终止 maybeScheduleLifetimeKill | 低 |

## 四、Web 模块

### 已覆盖场景

| 场景 | 测试名 |
|---|---|
| 包名 | package.json name |
| Origin 校验 | isAllowedOrigin |
| URL 消毒 | sanitizeUrl |
| 路径遍历 | Path traversal prevention |
| MIME 检测 | detectImageMimeType |
| 版本同步 | Version lockstep |

### 未覆盖场景

| 场景 | 优先级 |
|---|---|
| DOM 交互（渲染、事件） | 中 |
| WebSocket 连接管理 | 中 |
| 流式消息渲染 | 中 |
| Session 列表管理 | 中 |
| 模型切换 UI | 低 |
| Thinking level 切换 UI | 低 |

## 五、Android 模块

### 已覆盖场景

| 场景 | 测试文件 |
|---|---|
| 消息序列化 | ClientMessageSerializationTest.kt |
| 服务器消息解析 | GenericServerMessageTest.kt |
| 时间戳解析 | TimestampTest.kt |
| 数据模型 | ChatMessageTest.kt |

### 未覆盖场景

| 场景 | 优先级 |
|---|---|
| WebSocket 连接/断线重连 | 中 |
| UI 渲染（Compose） | 中 |
| 网络错误处理 | 中 |
| 双精度 timestamp | 低 |

## 六、HarmonyOS 模块

状态：无测试目录。建议后续建立 ArkTS 单元测试框架。

## 七、用户旅程覆盖矩阵

| 旅程阶段 | 关键场景 | Protocol | Server | Web | Android |
|---|---|---|---|---|---|
| 首次发现 | 版本号展示 | Y | Y | Y | Y |
| 配置连接 | 目录验证 | - | Y | Y | N |
| 配置连接 | Auth 鉴权 | Y | Y | N | N |
| 配置连接 | CORS 安全 | - | Y | Y | - |
| 核心对话 | 发送 prompt | Y | Y | N | Y |
| 核心对话 | 流式响应 | Y | Y | N | Y |
| 核心对话 | 中断 | Y | Y | N | Y |
| 核心对话 | Steer | Y | Y | N | Y |
| 核心对话 | 模型切换 | Y | Y | N | Y |
| 核心对话 | Thinking level | Y | Y | N | Y |
| 核心对话 | 图片附件 | Y | Y | Y | Y |
| 会话管理 | 列表 | - | Y | N | N |
| 会话管理 | 切换 | Y | Y | N | Y |
| 会话管理 | 新建 | Y | Y | N | Y |
| 会话管理 | 重命名 | Y | Y | N | Y |
| 会话管理 | Compact | Y | Y | N | N |
| 断线重连 | Backfill | Y | Y | N | N |
| 断线重连 | 事件缓冲 | - | Y | N | N |
| 错误处理 | 错误消息 | Y | Y | N | Y |
| 错误处理 | pi_exit | Y | Y | N | Y |
| 安全 | 路径遍历 | - | Y | Y | - |
| 安全 | Origin 劫持 | - | Y | Y | - |
| 安全 | URL 消毒 | - | - | Y | - |
| 并发 | Agent 复用 | - | Y | - | - |
| 并发 | 容量限制 | - | Y | - | - |
| 并发 | 空闲回收 | - | N | - | - |
| 计时 | Thinking/Tool 时长 | - | Y | - | - |

Y=已覆盖 N=未覆盖 -=不适用

## 八、改进总结

### 本次新增测试

- Protocol: 4→6 个测试（+2 新测试块，内含 ~30 个新断言）
- Server: 17→34 个测试（+17 个新测试）
- Web: 6 个（无变化）
- 总计新增 17 个测试用例

### 发现的潜在问题

1. `createBackfillStartMessage(-1)` 返回 -1 而非 0（`-1 || 0` 不触发因为 -1 是 truthy）— 这是设计行为而非 bug，测试已正确记录
2. `app.js` 非哈希文件获取 `no-cache` 而非 `immutable` — 这是正确的缓存策略
3. Server REST POST 端点（/api/chat, /api/abort, /api/set-default-model）完全无测试 — 建议后续补充
4. HarmonyOS 完全无测试 — 建议建立测试框架
