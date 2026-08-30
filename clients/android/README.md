# Pi Chat Android App

Pi Chat Android 原生移动客户端工程，采用现代 Android 全家桶技术栈构建：
- **UI 框架**：Jetpack Compose + Material 3
- **异步与流式通信**：Kotlin Coroutines + StateFlow
- **网络层**：OkHttp WebSocket (支持长连接自动重连、心跳保活与 Token 鉴权) + Retrofit 风格 REST 交互
- **数据序列化**：Kotlinx Serialization

---

## 工程目录结构

```
clients/android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/pichat/android/
│           ├── MainActivity.kt               # App 入口
│           ├── data/
│           │   ├── model/ChatMessage.kt       # 消息与会话数据模型
│           │   ├── protocol/PiChatProtocol.kt # WebSocket 通信协议序列化
│           │   ├── network/WebSocketClient.kt # OkHttp WebSocket 管理器
│           │   ├── network/ApiService.kt      # REST API 服务
│           │   └── repository/ChatRepository.kt # 聊天核心仓库
│           └── ui/
│               ├── screen/ChatScreen.kt       # Compose 聊天界面与抽屉历史
│               ├── viewmodel/ChatViewModel.kt # StateFlow 状态管理
│               └── theme/                     # 统一主题配色
└── build.gradle.kts
```

---

## 快速运行与调试

1. 使用 **Android Studio (Ladybug / Iguana 或更高版本)** 打开 `clients/android` 目录。
2. 确保已在 VPS 或本地启动 Pi Gateway 网关服务（例如 `pnpm --filter @pi-chat/server start`）。
3. 如果在 Android 模拟器上运行，默认连接本地网关 `http://10.0.2.2:3000`；如果是真机调试，请修改 `ChatViewModel.kt` 中的 Gateway IP 为你的局域网/VPS 公网地址。
4. 点击 Run (Shift + F10) 进行编译并在设备/模拟器中安装体验。
