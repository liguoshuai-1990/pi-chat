# pi-web-chat

一个 [pi](https://pi.dev) 编程代理的 Web 界面，风格参考 ChatGPT / Gemini ——
左侧历史会话侧边栏 + 右侧对话区 + 底部输入框。底层通过 pi 的 **RPC 模式**
(`pi --mode rpc`) 与 pi 子进程通信，前端走 WebSocket 流式渲染。

> 项目主页：https://github.com/liguoshuai-1990/pi-web-chat

---

## 📸 功能特性

- 💬 **流式对话** —— 文本逐字流式渲染，带打字光标与 Markdown 高亮
- ⚡ **后台任务持久化** —— 关闭网页/标签页不中断正在生成的任务，重新进入自动回放（Backfill）追平进度
- 🌐 **多端/多设备同步协同** —— 多个浏览器标签页或多设备（手机/电脑）可同时连入同一会话，实时双向同步
- 🧭 **运行时实时插入指令 (Steer)** —— 生成过程中可随时插入转向指令指导 AI 调整后续行动
- 🗂️ **会话历史与管理** —— 自动读取并显示 `~/.pi/agent/sessions/` 下所有历史会话，实时自动落盘
- ⚙️ **工具与思考过程折叠** —— bash / read / write / edit 等工具调用与 thinking 思考卡片实时展开/收起
- 🧩 **动态模型切换** —— 顶栏模型胶囊，零延迟覆盖所有 pi 已配置的模型
- 🔄 **断线自动重连与心跳** —— 带指数退避自动重连、双向心跳 Ping/Pong 检测
- 📋 **快捷复制** —— 支持代码块、工具指令、回答全文一键复制
- 📱 **移动端响应式** —— Viewport `100dvh` 优化、顶栏常驻固定、滚动置顶/置底快捷悬浮按钮（FAB）

---

## 🚀 快速开始

```bash
cd pi-web-chat
npm install

# 确保 pi 已安装并已配置好至少一个 provider：
#   pi         （交互模式 → 运行 /login 选择 provider，或设置 API key）
npm start
# → http://localhost:3000
```

---

## ⚙️ 环境变量配置

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `PORT` | `3000` | Web 服务监听端口 |
| `PI_BIN` | 自动探测（`~/.npm-global/bin/pi` 等） | 显式指定 pi 可执行文件绝对路径 |
| `PI_SESSIONS_DIR` | `~/.pi/agent/sessions` | pi 的 session 存储目录 |
| `IDLE_TIMEOUT_MS` | `300000` (5分钟) | 真正空闲（无连接+非流式）后的进程回收超时（0 为禁用回收） |
| `MAX_AGENT_LIFETIME_MS` | `1800000` (30分钟) | 单个 Agent 进程后台生存硬上限（0 为无上限） |
| `EVENT_BUFFER_SIZE` | `2000` | 离线环形 Buffer 允许缓存的最大事件条数 |
| `MAX_CONCURRENT_AGENTS` | `0` (无限制) | 进程池最大并发 Agent 进程数量 |
| `IDLE_DROP_HEAP` | `false` | 进入空闲时是否给 V8 引擎 GC 提示（需 `--expose-gc`） |

---

## 📁 项目结构

```
pi-web-chat/
├── README.md                       本文件
├── package.json
├── package-lock.json
├── server.js                       Express + WebSocket，桥接 pi RPC 与进程池管理
├── bin/
│   └── pi-web-chat.js              CLI 可执行入口
├── public/
│   ├── index.html                  单页 UI
│   ├── app.js                      前端逻辑与状态机
│   └── style.css                   ChatGPT/Gemini 风格样式
└── docs/                           项目文档库
    ├── ARCHITECTURE.md             架构设计文档
    ├── DESIGN.md                   详细设计与决策文档
    ├── ISSUES.md                   历次问题排查与修补记录
    └── CHANGELOG.md                版本变更日志
```

---

## 🏗️ 架构概览

```
 浏览器 (多 Tab / 多设备) ──WebSocket(/ws?cwd=...&session=...)──► Node server.js
                                                                (Session Key 进程池 activeAgents)
                                                                │
                                                                ├──► pi --mode rpc (后台持久化 Worker)
                                                                ├──► REST /api/sessions ──► 列会话历史
                                                                ├──► REST /api/session ────► 构建对话链
                                                                └──► REST /api/agents ─────► 实时监控看板
```

详细架构说明与设计决策请参阅 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与 [docs/DESIGN.md](docs/DESIGN.md)。

---

## 📝 License

MIT

---

## 🛠️ Systemd 服务（可选）

若希望开机自启、后台常驻、重启自愈，可安装为 user-level systemd 服务（无需 sudo）：

```bash
# 从项目根目录运行
./scripts/install-service.sh 3000

# 或自定义端口（默认 3000）：
./scripts/install-service.sh 8080
```

查看状态 / 日志：
```bash
systemctl --user status pi-web-chat
journalctl --user -u pi-web-chat -f
```

> ⚠️ **Linger**：systemd user 服务默认随登录会话结束。若需 **开机自启 / 登出后继续跑**，需一次性启用：
> ```bash
> sudo loginctl enable-linger $USER
> ```

卸载服务：
```bash
systemctl --user disable --now pi-web-chat
rm ~/.config/systemd/user/pi-web-chat.service
systemctl --user daemon-reload
```
