# pi-web-chat

一个 [pi](https://pi.dev) 编程代理的 Web 界面，风格参考 ChatGPT / Gemini ——
左侧历史会话侧边栏 + 右侧对话区 + 底部输入框。底层通过 pi 的 **RPC 模式**
(`pi --mode rpc`) 与 pi 子进程通信，前端走 WebSocket 流式渲染。

> 项目主页：https://github.com/liguoshuai-1990/pi-web-chat

---

## 📸 功能特性

- 💬 **流式对话** —— 文本逐字流式渲染，带打字光标与 Markdown 高亮
- 🖼️ **多模态图片支持** —— 支持截图粘贴（Ctrl+V）、文件拖拽及附件上传，可在对话中渲染图片缩略图与大图预览
- 📥 **会话一键导出** —— 顶栏支持一键将当前完整会话导出为标准 Markdown（`.md`）文件
- ⚡ **后台任务持久化** —— 关闭网页/标签页不中断正在生成的任务，重新进入自动回放（Backfill）追平进度
- 🌐 **多端/多设备同步协同** —— 多个浏览器标签页或多设备（手机/电脑）可同时连入同一会话，实时双向同步
- 🧭 **运行时实时插入指令 (Steer)** —— 生成过程中可随时插入转向指令指导 AI 调整后续行动
- 🗂️ **会话历史与管理** —— 自动读取并显示 `~/.pi/agent/sessions/` 下所有历史会话，实时自动落盘与删除
- ⚙️ **工具与思考过程折叠** —— bash / read / write / edit 等工具调用与 thinking 思考卡片实时展开/收起
- 🧩 **动态模型切换** —— 顶栏模型胶囊，零延迟覆盖所有 pi 已配置的模型，支持深度思考级别调节
- ⌨️ **丰富快捷键** —— 支持 `Ctrl/Cmd+M`（切模型）、`Ctrl/Cmd+Shift+N`（新建）、`Ctrl/Cmd+K`（搜索）、`Ctrl/Cmd+B`（折叠侧边栏）、`Esc`（中断/关闭）
- 🛡️ **安全加固** —— WebSocket 跨站劫持 (CSWSH) Origin 防护与 Markdown 属性逃逸防御
- 🔄 **断线自动重连与心跳** —— 带指数退避自动重连、双向心跳 Ping/Pong 检测
- 📋 **快捷复制** —— 支持代码块、工具指令、回答全文一键复制
- 📱 **移动端响应式** —— Viewport `100dvh` 优化、顶栏常驻固定、滚动置顶/置底快捷悬浮按钮（FAB）

---

## 🚀 快速开始

### 1. 环境准备
- **Node.js**: `>= 18.0.0`
- **操作系统**: Linux / macOS / WSL (Windows)

---

### 2. 安装 pi 编程代理 (pi agent)

`pi-web-chat` 通过 RPC 模式 (`pi --mode rpc`) 与底层 `pi` 命令行 Agent 子进程通信。若系统中尚未安装 `pi`，请选择以下任一方式进行全局安装：

#### 方式 A：通过 npm / pnpm 全局安装（推荐）

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```
> 💡 `--ignore-scripts` 可跳过依赖包中的生命周期脚本，安装更干净高效。

#### 方式 B：通过 Shell 官方安装脚本

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

#### 验证安装
安装完成后，在终端运行以下命令验证：

```bash
pi --version
# 输出版本号（例如 0.82.1）即表示安装成功
```

---

### 3. 配置模型 Provider 与 API Key

`pi` 支持 Anthropic、OpenAI、OpenRouter、DeepSeek、SiliconFlow 等多种 LLM 模型 Provider。在使用前需配置好 API Key 或授权凭证：

#### 方法 A：设置环境变量（推荐）
在终端或 Shell 配置文件（如 `~/.bashrc` 或 `~/.zshrc`）中导出对应的 API Key：

```bash
# 使用 Anthropic (Claude)
export ANTHROPIC_API_KEY="sk-ant-..."

# 使用 OpenRouter
export OPENROUTER_API_KEY="sk-or-v1-..."

# 使用 OpenAI / DeepSeek / 其它 OpenAI 兼容 API
export OPENAI_API_KEY="sk-..."
```

#### 方法 B：使用 pi CLI 交互式登录
在终端输入 `pi` 命令启动交互模式，然后输入 `/login` 按照提示选择 Provider 并绑定账号或密钥：

```bash
pi
# 进入交互界面后输入：
/login
# 按照提示选择 Provider 并输入 Key，配置完成后输入 /quit 退出
```

---

### 4. 克隆与启动 pi-web-chat

#### 克隆仓库与安装依赖

```bash
git clone https://github.com/liguoshuai-1990/pi-web-chat.git
cd pi-web-chat
npm install
```

#### 启动 Web 服务

```bash
npm start
```

#### 打开浏览器体验
在浏览器中访问：
👉 **http://localhost:3000**

---

### 5. 命令行启动选项与全局 CLI（可选）

你也可以通过 `bin/pi-web-chat.js` 指定工作目录或监听端口：

```bash
# 指定端口和工作目录 (cwd)
node bin/pi-web-chat.js --port 8080 --cwd /path/to/your/project

# 或通过 npm 全局安装后在任意目录下启动
npm install -g .
pi-web-chat --port 8080
```

---

## ⚙️ 环境变量配置

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `PORT` | `3000` | Web 服务监听端口 |
| `PI_BIN` | 自动探测（`~/.npm-global/bin/pi`、`/usr/local/bin/pi` 或 `PATH`） | 显式指定 pi 可执行文件绝对路径 |
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
├── scripts/                        Systemd 服务安装与管理脚本
│   ├── pi-web-chat.service         Systemd user unit 模板
│   ├── install-service.sh          一键安装与启动脚本
│   └── uninstall-service.sh        一键卸载脚本
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
# 使用一键卸载脚本
./scripts/uninstall-service.sh

# 或手动清理：
systemctl --user disable --now pi-web-chat
rm ~/.config/systemd/user/pi-web-chat.service
systemctl --user daemon-reload
```
