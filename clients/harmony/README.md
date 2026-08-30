# Pi Chat HarmonyOS App (v2.1.0)

Pi Chat 华为鸿蒙系统 (HarmonyOS Next / OpenHarmony) 原生客户端工程，基于 Stage 模型与声明式 ArkUI 框架构建：
- **开发语言与框架**：ArkTS + ArkUI (Stage 模型，API 12+)
- **长连接与流式通信**：`@ohos.net.webSocket` (支持自动重连、心跳保活、Token 鉴权)
- **RESTful API 交互**：`@ohos.net.http` (用于读取 VPS 会话列表、配置)
- **页面架构**：SideBarContainer 抽屉历史导航 + 响应式打字机流式展示 + 思考折叠气泡

---

## 工程目录结构

```
clients/harmony/
├── AppScope/
│   ├── app.json5                             # 应用全局配置 (版本号 2.0.0)
│   └── resources/
├── entry/
│   ├── src/main/
│   │   ├── module.json5                      # 声明 INTERNET 网络权限
│   │   └── ets/
│   │       ├── entryability/EntryAbility.ets # Stage 生命周期入口
│   │       ├── model/ChatModel.ets           # 消息与数据模型
│   │       ├── protocol/PiProtocol.ets       # 跨端协议序列化
│   │       ├── network/WebSocketManager.ets  # @ohos.net.webSocket 管理器
│   │       ├── network/HttpService.ets       # @ohos.net.http 服务
│   │       ├── viewmodel/ChatViewModel.ets   # 响应式状态管理
│   │       └── pages/Index.ets               # 声明式聊天与侧边栏界面
│   ├── build-profile.json5
│   └── hvigorfile.ts
├── build-profile.json5
└── package.json
```

---

## 快速运行与调试

1. 使用 **DevEco Studio 5.0 (API 12+)** 打开 `clients/harmony` 目录。
2. 配置真机或 DevEco Emulator 模拟器签名（**File** -> **Project Structure** -> **Project** -> **Signing Configs** 勾选 *Automatically generate signature*）。
3. 将 `Index.ets` / `ChatViewModel.ets` 中的网关地址修改为你的 Pi Gateway 服务端地址（如 `http://<VPS-IP>:3000`）。
4. 点击 **Run 'entry'** 进行编译并在鸿蒙设备上运行体验。

---

## 📦 编译与打包 HAP / APP 安装包

### 方式 1：使用 DevEco Studio 图形界面打包
1. 在 DevEco Studio 菜单栏选择 **Build** -> **Build Hap(s)/APP(s)** -> **Build Hap(s)**。
2. 编译完成后，在右下角点击链接，即可在 `entry/build/default/outputs/default/` 目录下找到生成的 `.hap` 安装包。

### 方式 2：使用 hvigor 命令行打包
```bash
cd clients/harmony

# 执行 hvigor 构建命令
hvigorw --mode module -p module=entry@default -p product=default assembleHap

# 生成的 HAP 安装包路径：
# entry/build/default/outputs/default/entry-default-unsigned.hap (或已签名的 entry-default-signed.hap)
```

直接安装到鸿蒙真机或模拟器：
```bash
hdc app install entry/build/default/outputs/default/entry-default-signed.hap
```
