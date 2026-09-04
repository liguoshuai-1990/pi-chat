# 📱 Pi Chat Android App (v2.12.7)

Pi Chat Android 原生移动端应用，与 Web 端实现全要素体验对齐，让开发者能够在手机上随时随地操控 VPS / 远程服务器上的 Pi 编程智能体。

---

## 🛠️ 技术栈与架构设计

- **界面层**：Jetpack Compose + Material 3 现代化声明式 UI
- **架构模式**：MVVM + 响应式单向数据流 (UDF)
- **异步与状态管理**：Kotlin Coroutines + `StateFlow` / `SharedFlow`
- **网络通信层**：
  - **OkHttp WebSocket**：全双工长连接通信，支持 30s 心跳保活、指数退避断线重连机制以及 Token 鉴权。
  - **RESTful API (`ApiService`)**：基于 OkHttp 读取网关服务端配置（`/api/config`）、工作目录历史会话列表（`/api/sessions`）及会话详情（`/api/session`）。
- **数据序列化**：Kotlinx Serialization (JSON)
- **构建管理**：Gradle Kotlin DSL + Version Catalog (`libs.versions.toml`)

---

## ✨ 全要素对齐特性 (Features)

1. **顶部导航栏全要素对齐 (TopBar)**：
   - **工作目录胶囊 (CWD Pill)**：显示当前工作目录缩写（如 `~`、`~/projects/pi-chat`），点击弹出切换工作目录对话框，支持输入自定义绝对路径或点击快捷目录芯片（`~`、`~/.pi`、`/tmp`）。
   - **模型选择胶囊 (Model Pill)**：展示当前激活的模型名称与 `★ 默认` 标签，点击弹出支持实时搜索、厂商分类、特性标签（🧠 推理、👁️ 视觉、🛠️ 工具、上下文长度）的模型选择列表。
   - **深度思考级别胶囊 (Thinking Pill)**：展示当前推理深度（`Off`、`Minimal`、`Low`、`Medium`、`High`、`Max`），点击弹出选择框即时切换。
   - **导出对话记录 (Export Chat)**：点击一键生成整场对话的标准 Markdown 并唤起系统分享/复制到剪贴板。
   - **单一精简设置入口**：移除了抽屉内重复的设置按钮，顶部栏右上角保留统一齿轮按钮，点击配置网关地址与访问密钥。

2. **空白引导页 (Empty State)**：
   - 经典 `π` 徽标头像与引导文案。
   - **当前模型信息横幅 (Empty Model Banner)**：直观展示当前模型名称、默认状态、能力标签及“切换模型”快捷按钮。
   - **快捷指令芯片 (Suggestion Chips)**：一键发送“列出当前目录文件”、“总结这个项目”、“代码审查”等初始需求。

3. **消息流式渲染与工具调用 (Chat Feed)**：
   - **思考过程折叠卡片 (Thinking Block)**：流式生成时实时动态计时（如 `思考中… 3.2s`），生成完毕显示总耗时（如 `用时 3.2s`），支持折叠与展开查看原始推理日志。
   - **工具调用卡片 (Tool Call Block)**：根据工具名称展示专属图标（`💻 bash`、`📄 read`、`✏️ edit`、`📁 write` 等），显示运行状态徽章（执行中 / 完成 / 失败）与执行耗时，并提供独立的一键“复制输出”按钮。
   - **Markdown 语法高亮与代码块**：代码块带独立语言标记与一键复制代码按钮。
   - **图片多附件预览与全屏画廊 (Lightbox)**：支持从手机相册挑选多张图片附件，支持缩略图预览与单个删除；点击聊天气泡中的图片可全屏大图查看。

4. **底部操作区域 (Composer)**：
   - 待发送图片附件缩略图预览条。
   - 支持多行自动伸缩输入框。
   - **插入指令 (Steer Prompt)**：在 AI 思考或执行工具过程中，实时显示“插入指令”按钮，随时向正在运行中的 Agent 注入指导性提示。
   - 发送 (↑) 与 中止 (■) 状态动态切换。
   - 安全提示文案：“pi 会执行命令与读写你的文件 —— 请注意操作内容。”

---

## 📂 工程目录结构

```
clients/android/
├── app/
│   ├── build.gradle.kts                      # 模块构建脚本 (versionName "2.12.7")
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/pichat/android/
│           ├── MainActivity.kt               # App 入口 Activity
│           ├── data/
│           │   ├── model/
│           │   │   ├── ChatMessage.kt        # 聊天消息、附件与工具调用模型
│           │   │   └── Session.kt            # 会话元数据、模型定义与服务端配置
│           │   ├── protocol/
│           │   │   └── PiChatProtocol.kt     # WebSocket 跨端通信消息协议定义
│           │   ├── network/
│           │   │   ├── ApiService.kt         # RESTful HTTP API 服务
│           │   │   └── WebSocketClient.kt    # OkHttp 长连接客户端（心跳与重连）
│           │   └── repository/
│           │       ├── ChatRepository.kt     # 核心聊天业务仓库（流式处理与状态维护）
│           │       └── SettingsStore.kt      # SharedPreferences 配置持久化
│           └── ui/
│               ├── screen/
│               │   └── ChatScreen.kt         # Compose 聊天主界面、抽屉、气泡与全部对话框
│               ├── viewmodel/
│               │   └── ChatViewModel.kt      # 界面 ViewModel 状态流
│               └── theme/                    # Color / Type / Theme 主题配色
├── gradle/
│   └── libs.versions.toml                     # Version Catalog 统一版本管理
├── build.gradle.kts
└── gradlew
```

---

## ⚡ 快速安装与运行

### 方式 1：直接下载 APK（推荐）
每次代码合并或打 Release Tag 后，GitHub Actions 会自动编译并打包最新的 Debug APK：
- 在 GitHub 仓库的 **[Actions 页面](https://github.com/liguoshuai-1990/pi-chat/actions)** 或 **[Releases 页面](https://github.com/liguoshuai-1990/pi-chat/releases)** 下载 `pi-chat-android-apk` 压缩包解压即可获得 `pi-chat-v2.12.7-debug.apk`。

### 方式 2：使用 Android Studio 源码运行
1. 使用 **Android Studio (Ladybug / Iguana 或更高版本)** 打开 `clients/android` 目录。
2. 确保 JDK 版本为 17（**Settings** -> **Build, Execution, Deployment** -> **Build Tools** -> **Gradle** -> **Gradle JDK** 选择 JDK 17）。
3. 启动本地或远程 VPS 上的 Pi Gateway 服务端（默认端口 3000）。
4. 连接 Android 手机或启动模拟器，点击 **Run 'app'** (Shift + F10) 进行编译与安装。
5. 打开应用后点击右上角 ⚙️ **设置** 按钮，输入你的网关地址（如 `http://192.168.1.100:3000` 或 VPS 公网 IP/域名），点击“保存并连接”。

### 方式 3：命令行编译与安装
```bash
cd clients/android

# 编译 Debug APK
./gradlew assembleDebug

# 生成路径：app/build/outputs/apk/debug/pi-chat-v2.12.7-debug.apk

# 通过 ADB 直接安装到手机
adb install -r app/build/outputs/apk/debug/pi-chat-v2.12.7-debug.apk
```
