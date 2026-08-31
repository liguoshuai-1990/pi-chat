# Pi Chat Android App (v2.2.0)

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
├── gradle/
│   └── libs.versions.toml                     # Version Catalog 统一版本管理
├── build.gradle.kts
└── gradlew
```

---

## 快速运行与调试

1. 使用 **Android Studio (Ladybug / Iguana 或更高版本)** 打开 `clients/android` 目录。
2. 确保已在 VPS 或本地启动 Pi Gateway 网关服务（例如 `pnpm dev:server`）。
3. 默认连接本地网关 `http://10.0.2.2:3000`（模拟器回环地址）。
4. 无需修改源码即可切换后端：打开应用后点击顶部操作栏或左侧抽屉中的 **设置（齿轮）图标**，在“后端配置”对话框中填写 Pi Gateway 服务地址与访问 Token，点击“保存并连接”即可直连局域网 / VPS 公网网关（配置会持久化保存）。
5. 点击 Run (Shift + F10) 进行编译并在设备/模拟器中安装体验。

---

## 📦 编译与打包 APK 安装包

### 方式 1：使用 Android Studio 图形界面打包
1. 顶部菜单栏选择 **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**。
2. 编译完成后，右下角弹出通知点击 **locate**，即可获取生成的 `app-debug.apk`。

### 方式 2：使用命令行快速打包
```bash
cd clients/android

# 编译 Debug APK 安装包
./gradlew assembleDebug

# 生成的安装包输出路径：
# app/build/outputs/apk/debug/app-debug.apk
```

直接安装到连接的手机：
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
