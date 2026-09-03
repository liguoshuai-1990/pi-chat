# 📱 Pi Chat HarmonyOS App (v2.10.0)

Pi Chat 华为鸿蒙系统 (HarmonyOS Next / OpenHarmony) 原生移动端工程，基于 Stage 模型与声明式 ArkUI 框架构建，支持在华为手机、平板等鸿蒙设备上无缝连接 VPS 网关与 Pi 编程助手进行流式对话。

---

## 🛠️ 技术栈与架构设计

- **开发语言**：ArkTS (TypeScript 超集)
- **UI 框架**：ArkUI (声明式 UI，Stage 模型 API 12+)
- **长连接与流式通信**：`@ohos.net.webSocket` (支持全双工长连接、心跳机制、流式合并与 Token 鉴权)
- **HTTP 服务**：`@ohos.net.http` (用于读取 VPS 会话列表与配置)
- **多端协议**：遵循 `@liguoshuai/pi-chat-protocol` 跨端标准化 JSON 通信协议
- **界面架构**：`SideBarContainer` 侧边栏历史抽屉 + 响应式流式打字机 + 思考耗时与工具卡片折叠

---

## 📂 工程目录结构

```
clients/harmony/
├── AppScope/
│   ├── app.json5                             # 应用全局元数据配置 (versionName 2.10.0)
│   └── resources/                            # 全局图标与字符串资源
├── entry/
│   ├── src/main/
│   │   ├── module.json5                      # 声明 INTERNET 网络访问权限与 Ability
│   │   ├── resources/                        # 页面级色彩、字符串与布局资源
│   │   └── ets/
│   │       ├── entryability/EntryAbility.ets # Stage 生命周期入口
│   │       ├── model/ChatModel.ets           # 消息、会话、工具调用与耗时模型
│   │       ├── protocol/PiProtocol.ets       # 跨端协议序列化与解析
│   │       ├── network/WebSocketManager.ets  # @ohos.net.webSocket 长连接管理
│   │       ├── network/HttpService.ets       # @ohos.net.http 异步请求服务
│   │       ├── viewmodel/ChatViewModel.ets   # 响应式状态管理与业务分发
│   │       └── pages/Index.ets               # 声明式主界面、侧边抽屉与气泡流
│   ├── build-profile.json5
│   └── hvigorfile.ts
├── build-profile.json5
└── package.json
```

---

## ⚡ 快速开始与调试

### 1. 导入工程
1. 使用 **Huawei DevEco Studio 5.0 (API 12+)** 打开 `clients/harmony` 目录。
2. 等待 hvigor 同步依赖完成。

### 2. 配置自动签名
1. 菜单栏选择 **File** -> **Project Structure** -> **Project** -> **Signing Configs**。
2. 勾选 **Automatically generate signature**（确保已登录华为开发者账号）。

### 3. 配置网关服务地址
在 `Index.ets` 或 `ChatViewModel.ets` 中将目标网关地址设置为你的 VPS 服务端公网地址或局域网 IP（如 `http://192.168.1.100:3000`）。

### 4. 运行与调试
连接 HarmonyOS Next 真机（开启开发者模式并允许 USB 调试）或 DevEco 模拟器，点击右上角 **Run 'entry'** (Shift + F10) 即可在鸿蒙设备上运行。

---

## 📦 编译打包 HAP 交付件

### 方式 1：DevEco Studio 图形化打包
1. 菜单栏选择 **Build** -> **Build Hap(s)/APP(s)** -> **Build Hap(s)**。
2. 编译完成后，在 `entry/build/default/outputs/default/` 目录下获取生成的 `.hap` 安装文件。

### 方式 2：使用 hvigor 命令行打包
```bash
cd clients/harmony

# 执行编译打包
hvigorw --mode module -p module=entry@default -p product=default assembleHap

# 生成路径：
# entry/build/default/outputs/default/entry-default-unsigned.hap (或已签名的 entry-default-signed.hap)
```

使用 HDC 命令行直接安装到鸿蒙设备：
```bash
hdc app install entry/build/default/outputs/default/entry-default-signed.hap
```

---

## 🔄 CI/CD 自动归档

在 GitHub Actions CI/CD 流水线中，每次代码推送或发布 Release，`harmony-deliverables` 作业会自动将 `clients/harmony` 工程完整源码及元数据打包归档为 `pi-chat-harmony-app.zip`，可随时从 [Actions 页面](https://github.com/liguoshuai-1990/pi-chat/actions) 或 Releases 中下载使用。
