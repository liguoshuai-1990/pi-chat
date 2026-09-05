# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [2.15.2] - 2026-09-05

### Fixed
- **网关核心运行时依赖修正**：将 `server/package.json` 中的 `express` 与 `ws` 从 `devDependencies` 正式移入 `dependencies`，避免独立安装或作为库引用 `@liguoshuai/pi-chat-server` 时出现 `Cannot find module` 运行时崩溃。

### Added & Enhanced
- **全仓版本一致性测试加固**：在 `clients/web/test/unit.test.js` 中新增对 Android（`build.gradle.kts` 的 `versionName` 与 `versionCode`）及 HarmonyOS（`app.json5` 的 `versionName` 与 `versionCode`）元数据的自动化断言校验，实现全仓 8 个版本清单文件 100% 自动化测试守卫。
- **配置与文档补全**：根目录 `.env.example` 补充 `LONG_RUNNING_TIMEOUT_MS=600000` 长任务超时环境变量说明与注释。
- **构建命令与测试解耦**：解耦根 `package.json` 中 `build` 脚本与 `test` 脚本，新增 `check`（一键检查 `build + test`），消除 CI 流水线中重复跑两遍测试的问题。
- **前端渲染模块化抽离**：将 Web 端 `clients/web/public/app.js` 中独立自包含的 Markdown 渲染与安全清洗逻辑提取至单独的 `markdown.js` 模块，提升前端架构可维护性与代码整洁度，保持零打包构建与开箱即用特性。

### Changed
- 全端版本号统一递增至 2.15.2（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.1] - 2026-09-05

### Fixed
- **修复 Android ChatScreen.kt 编译错误**：删除 `ToolCallBlock` 函数中残留的孤立代码片段（来自此前重构的遗留），修复大括号不平衡导致的 `Syntax error: Expecting a top level declaration` 编译失败。

### Changed
- 全端版本号统一递增至 2.15.1（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。


## [2.15.0] - 2026-09-05


## [2.14.14] - 2026-09-05

### Fixed & Optimized
- **优化移动端思考流与工具执行过程展示**：
  - Android 客户端 `ChatRepository` 补全 `thinking_start`、`thinking_end`、`text_start`、`text_end`、`toolcall_*` 等细粒度流式事件状态流转，修复思考过程状态无法及时闭环或卡在 active 状态的问题。
  - Android 客户端 `ThinkingBlock` 增加清晰的可展开提示标识；`ToolCallBlock` 支持执行中自动展开命令参数与实时输出，执行完成后可一键复制与折叠。
  - HarmonyOS 客户端 `ChatViewModel` 同步补齐思考流全生命周期方法（`startThinking`、`finishThinking`、`setAssistantFinalText`）。
- **统一全仓 Monorepo 版本号**：同步递增至 `v2.14.14`。

## [2.14.13] - 2026-09-05

### Fixed
- **文档整理与路径修正**：
  - 将 `CHANGELOG.md` 与 `ISSUES.md` 从 `clients/web/docs/` 迁移至项目根 `docs/`，与 `ARCHITECTURE.md`、`USER_JOURNEY.md` 统一收纳。
  - 修复 `clients/web/docs/ARCHITECTURE.md` 中残留的旧版本号引用（v2.14.5 → v2.14.13）及过时的目录结构（移除不存在的 `package-lock.json`、已迁出的 `ISSUES.md` / `CHANGELOG.md`）。
  - 同步更新 `AGENTS.md`、`CLAUDE.md`、`clients/web/README.md` 中对 CHANGELOG 路径的引用。

### Changed
- 全端版本号统一递增至 2.14.13（Monorepo Lockstep：Root / Protocol / Server / Web / Android / HarmonyOS）。

## [2.14.12] - 2026-09-05

### Fixed
- **修复 HarmonyOS `versionCode` 位数与数值回退**：将 `clients/harmony/AppScope/app.json5` 的 `versionCode` 从错误的三位缩短格式（`21411`）恢复为标准的七位格式（`2141200`），并统一全仓版本号至 2.14.12。修正自 2.14.7 起 `versionCode` 由 `2140600` 误缩为 `21407` 造成的数值回退，避免 HarmonyOS 应用商店因版本号非单调递增而拒绝上架。
