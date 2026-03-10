# HarmonyOS Dev Tools

Lightweight & powerful HarmonyOS / OpenHarmony development toolkit for VS Code.
轻量且强大的 HarmonyOS / OpenHarmony VS Code 开发工具包。

> Build, run, debug, and inspect HarmonyOS apps directly from VS Code — no DevEco Studio required.
> 直接在 VS Code 中构建、运行、调试和检查鸿蒙应用 — 无需 DevEco Studio。

## Features / 功能特性

### Language Support / 语言支持
- **ArkTS syntax highlighting / ArkTS 语法高亮** — for `.ets` files / 适用于 `.ets` 文件
- **70+ code snippets / 70+ 代码片段** — type `comp`, `entry`, `compv2`, `local`, `param`, `monitor`, `require`, `type`, `makeobs`, `sendable`, `navstack`, etc. / 输入前缀触发
- **Auto-completion / 自动补全** — decorators (V1+V2+API 13/14), ArkUI components (85+), and lifecycle methods / 装饰器（含 `@Require`、`@Type`）、ArkUI 组件（85+）、生命周期方法
- **Hover documentation / 悬浮文档** — bilingual docs for 30+ ArkTS decorators (V1, V2, API 13+, API 14+) / 30+ 装饰器中英文悬浮文档
- **CodeLens** — showing component references and `@Entry` route info / 显示组件引用计数和 `@Entry` 路由信息
- **Color preview / 颜色预览** — hex colors (`#RRGGBB`, `#AARRGGBB`) and named colors (`Color.Red`) / 十六进制颜色和命名颜色

### Resource Management / 资源管理
- **`$r()` auto-completion / `$r()` 自动补全** — suggests resource keys from `resources/` directory / 从 `resources/` 目录提示资源键名
- **Ctrl+Click navigation / Ctrl+Click 跳转** — jump from `$r('app.string.title')` to the resource definition / 从 `$r('app.string.title')` 跳转到资源定义
- **Resource validation / 资源校验** — diagnostics for missing or invalid resource references / 检测缺失或无效的资源引用

### HarmonyOS NEXT / V2 State Management / V2 状态管理

> **v0.2.0+** — Full support for HarmonyOS NEXT (API 12+) V2 decorators.
> **v0.2.4 NEW** — API 13 (HarmonyOS 5.0.1) and API 14 (HarmonyOS 5.0.2) support.

- **V2 Decorator support / V2 装饰器支持** — `@ComponentV2`, `@Local`, `@Param`, `@Once`, `@Event`, `@Monitor`, `@Computed`, `@ObservedV2`, `@Trace`, `@Provider`, `@Consumer`
- **API 13+ Decorators / API 13+ 装饰器** — `@Require` (required parameter enforcement)
- **API 14+ Decorators / API 14+ 装饰器** — `@Type` (PersistenceV2 type annotation)
- **API 14+ APIs** — `makeObserved()`, enhanced drag-and-drop events, `EffectComponent`
- **V1 → V2 Migration / V1 → V2 迁移** — run `HarmonyOS: Migrate V1 → V2 Decorators` to one-click migrate decorators in the current file / 运行命令一键迁移当前文件中的装饰器
  - `@Component` → `@ComponentV2`, `@State` → `@Local`, `@Prop` → `@Param`, `@Provide` → `@Provider`, `@Consume` → `@Consumer`, `@Watch` → `@Monitor`, `@Observed` → `@ObservedV2`
  - Detects V1/V2 mixing and warns before proceeding / 检测 V1/V2 混用并在执行前警告
- **API Compatibility Check / API 兼容性检查** — run `HarmonyOS: Check API Compatibility` to scan your project for version mismatches / 运行命令扫描项目中的版本兼容问题
  - Validates feature usage against `compileSdkVersion` for API 12/13/14 / 检查各 API 级别特性使用是否匹配编译 SDK 版本
  - **Deprecated API detection / 废弃 API 检测** — detects 15+ deprecated modules and functions with migration suggestions / 检测 15+ 废弃模块和函数并给出迁移建议
  - Line-number reporting for each issue / 每个问题报告行号
  - Upgrade suggestions / 升级建议
  - Checks `hvigor-config.json5` `modelVersion` / 检查 hvigor 配置版本
  - Reports V1/V2 mixing in same file / 报告同文件 V1/V2 混用

### Real-time Diagnostics / 实时诊断 (v0.4.0+)

> **NEW** — Catch errors instantly without waiting 20+ minutes for DevEco compilation.
> **新功能** — 无需等待 DevEco 20+ 分钟编译，即时捕获错误。

- **ArkTS strict type checking / ArkTS 严格类型检查** — detects `any`, `unknown`, `as any`, implicit `any` in function parameters / 检测 `any`、`unknown`、`as any`、函数参数隐式 `any`
- **State management trap detection / 状态管理陷阱检测** — warns when `@State` is used with complex objects (shallow observation), detects V1/V2 mixing, flags `@Link` in `@ComponentV2` / 当 `@State` 用于复杂对象时警告（浅观察），检测 V1/V2 混用，标记 `@Link` 在 `@ComponentV2` 中
- **Performance anti-pattern detection / 性能反模式检测** — flags `ForEach` (suggest `LazyForEach`), detects `fetch()`, `setTimeout`, `console.log`, `JSON.parse`, `await` inside `build()` / 标记 `ForEach`（建议 `LazyForEach`），检测 `build()` 中的网络请求、定时器、日志输出等
- **Quick Fix / 快速修复** — auto-fix suggestions for all diagnostics: replace `any` with concrete types, `@State` → `@ObservedV2 + @Trace`, `@Link` → `@Param`, `ForEach` → `LazyForEach`, trigger V1→V2 migration / 所有诊断的自动修复建议

### Performance Insight CodeLens / 性能洞察 CodeLens (v0.4.0+)

- **`build()` analysis / `build()` 分析** — shows component count, nesting depth, and rendering strategy / 显示组件数量、嵌套深度和渲染策略
- **ForEach/LazyForEach tips / ForEach/LazyForEach 提示** — inline CodeLens explaining rendering strategy and performance implications / 内联 CodeLens 说明渲染策略和性能影响
- **State variable count / 状态变量计数** — shows state variable count per struct with warning for > 10 / 每个 struct 的状态变量计数，超过 10 个时警告

### Config File Intelligence / 配置文件智能 (v0.4.0+)

- **Hover documentation / 悬浮文档** — bilingual (中/EN) docs when hovering over keys in `build-profile.json5`, `module.json5`, `app.json5`, `oh-package.json5` / 悬浮在配置文件键名上时显示中英文文档
- Covers 40+ configuration keys across 4 config file types / 覆盖 4 种配置文件中的 40+ 个配置键

### OHPM Dependency Insight / OHPM 依赖洞察 (v0.4.0+)

- **Outdated version detection / 过期版本检测** — checks 10+ popular OHPM packages against known latest versions / 检查 10+ 流行 OHPM 包的最新版本
- **CodeLens on dependencies / 依赖 CodeLens** — inline package description and latest version on each dependency line / 每个依赖行内联显示包描述和最新版本
- **Problems panel integration / 问题面板集成** — outdated dependencies appear in VS Code's Problems panel / 过期依赖显示在 VS Code 的问题面板中

### JSON Schema Validation / JSON Schema 校验
- `build-profile.json5` — build configuration / 构建配置
- `oh-package.json5` — package dependencies / 包依赖
- `module.json5` — module configuration / 模块配置
- `app.json5` — application metadata / 应用元数据
- `hvigor-config.json5` — hvigor build tool configuration / hvigor 构建工具配置

### Build & Run / 构建与运行

#### Build & Run (Terminal) / 终端构建运行
Run `HarmonyOS: Build & Run (Terminal)` from the Command Palette (`Cmd+Shift+P`).
从命令面板（`Cmd+Shift+P`）运行 `HarmonyOS: Build & Run (Terminal)`。

Executes in VS Code's integrated terminal with full output:
在 VS Code 集成终端中执行，完整输出：
```
[1/4] Building HAP...        -> ./hvigorw assembleHap    (构建 HAP 包)
[2/4] Locating HAP output... -> finds .hap file          (查找 HAP 文件)
[3/4] Installing to device...-> hdc install              (安装到设备)
[4/4] Launching app...       -> hdc shell aa start       (启动应用)
```

#### Build & Run on Device / 后台构建运行
Run `HarmonyOS: Build & Run on Device` — same workflow but runs in background with progress notification, then auto-opens the UI Inspector.
运行 `HarmonyOS: Build & Run on Device` — 同样的流程但在后台运行，显示进度通知，完成后自动打开 UI Inspector。

#### Other Build Commands / 其他构建命令
- `HarmonyOS: Build HAP` — build only / 仅构建
- `HarmonyOS: Clean Build` — clean build cache / 清理构建缓存
- `HarmonyOS: Stop App on Device` — force-stop the running app / 强制停止运行中的应用

### Debugging / 调试

#### Debug App on Device / 设备调试
Run `HarmonyOS: Debug App on Device` or add to `launch.json`:
运行 `HarmonyOS: Debug App on Device` 或添加到 `launch.json`：
```json
{
  "type": "harmonyos",
  "request": "launch",
  "name": "Debug HarmonyOS App",
  "bundleName": "",
  "abilityName": "EntryAbility",
  "debugPort": 9230
}
```

This will / 执行流程：
1. Set up HDC port forwarding (`hdc fport`) / 设置 HDC 端口转发
2. Launch the app in debug mode (`aa start -D`) / 以调试模式启动应用
3. Attach VS Code's debugger via Chrome DevTools Protocol / 通过 CDP 协议连接 VS Code 调试器

#### UI Inspector / UI 检查器
Run `HarmonyOS: Open UI Inspector` to open a WebView panel with:
运行 `HarmonyOS: Open UI Inspector` 打开 WebView 面板，包含：
- **Device screenshot / 设备截图** — live view of the running app / 运行中应用的实时画面
- **Component tree / 组件树** — hierarchical view of ArkUI components / ArkUI 组件的层级视图
- **Property panel / 属性面板** — bounds, attributes, and layout info for selected component / 选中组件的边界、属性和布局信息
- **Go to Source / 跳转源码** — click to jump to the component's `.ets` source code / 点击跳转到组件的 `.ets` 源代码
- **Live mode / 实时模式** — click "Live" button to auto-refresh every 2 seconds / 点击"Live"按钮每 2 秒自动刷新

#### Device Log Viewer / 设备日志查看器
Run `HarmonyOS: View Device Logs` to stream `hdc hilog` output to VS Code's Output panel.
运行 `HarmonyOS: View Device Logs` 将 `hdc hilog` 输出流式传输到 VS Code 的 Output 面板。

### Device Management / 设备管理
- **Device TreeView / 设备树视图** — sidebar panel showing connected devices with auto-refresh / 侧边栏面板显示已连接设备，自动刷新
- `HarmonyOS: Refresh Devices` — manually refresh device list / 手动刷新设备列表
- `HarmonyOS: Install HAP to Device` — select and install a .hap file / 选择并安装 .hap 文件
- `HarmonyOS: Take Device Screenshot` — capture and save device screenshot / 截取并保存设备截图

### Project Tools / 项目工具
- **Project creation wizard / 项目创建向导** — `HarmonyOS: Create New Project` with 4 templates (Empty, List, Tabs, Login) / 4 种模板（空白、列表、标签页、登录）
- **Code actions / 代码操作** — right-click menu / 右键菜单：
  - Extract to `@Component` — extract selected UI code to a new component / 提取选中 UI 代码为新组件
  - Extract to `@Builder` — extract to a `@Builder` method / 提取为 `@Builder` 方法
  - Extract to `$r()` — extract hardcoded strings to resource references / 提取硬编码字符串为资源引用
- `HarmonyOS: Migrate V1 → V2 Decorators` — one-click decorator migration (also in right-click menu) / 一键装饰器迁移（右键菜单可用）
- `HarmonyOS: Check API Compatibility` — scan project for API version mismatches / 扫描项目 API 版本兼容问题
- `HarmonyOS: Organize Imports` — organize import statements / 整理导入语句
- `HarmonyOS: Format ArkTS File` — format current file / 格式化当前文件
- `HarmonyOS: Manage Dependencies` — manage oh-package.json5 / 管理依赖
- `HarmonyOS: Search HarmonyOS Docs` — search official docs / 搜索官方文档

### Device Mirror / 设备镜像 (v0.3.0+)

> **NEW** — Mirror your device screen inside VS Code with full touch interaction.
> **新功能** — 在 VS Code 中镜像设备屏幕，支持完整触控交互。

- **Live screen streaming / 实时屏幕流** — HDC screenshot polling at 1-5 FPS / 基于 HDC 截图轮询，1-5 FPS 可调
- **Touch forwarding / 触控转发** — click, swipe, long-press directly on the WebView canvas / 在 WebView 画布上直接点击、滑动、长按
- **Key bar / 按键栏** — Home, Back, Recent, Volume, Power buttons / Home、返回、最近任务、音量、电源按键
- **Auto device detection / 自动设备检测** — auto-selects first connected device / 自动选择第一个连接的设备
- **No-device fallback / 无设备提示** — friendly message when no device is connected / 无设备连接时友好提示

### Emulator Manager / 模拟器管理 (v0.3.0+)

- **Auto-detect emulators / 自动检测模拟器** — scans DevEco Studio emulator directories (macOS/Windows/Linux) / 扫描 DevEco Studio 模拟器目录
- **TreeView integration / 树视图集成** — Devices & Emulators sections in sidebar / 侧边栏设备和模拟器分组显示
- **Launch / Stop / 启动/停止** — start emulators from VS Code, auto-opens Device Mirror when online / 从 VS Code 启动模拟器，上线后自动打开设备镜像
- **Status monitoring / 状态监控** — running/stopped status with live icons / 运行/停止状态实时图标

### Component Preview / 组件预览 (Enhanced v0.3.0+)

Run `HarmonyOS: Preview Component` on any `.ets` file to see a live preview of the UI layout.
在任意 `.ets` 文件上运行 `HarmonyOS: Preview Component`，查看 UI 布局的实时预览。

- **15+ layout containers / 15+ 布局容器** — Column, Row, Stack, Grid, List, Flex, Scroll, Tabs, Navigation, RelativeContainer, etc.
- **20+ leaf components / 20+ 叶子组件** — Text, Button, Image, TextInput, TextArea, Toggle, Slider, Progress, Search, Checkbox, Radio, Rating, etc.
- **Style property rendering / 样式属性渲染** — width, height, padding, margin, backgroundColor, borderRadius, fontSize, fontColor, opacity, justifyContent, alignItems, layoutWeight, etc.
- **Nested rendering / 嵌套渲染** — correct recursive AST-based rendering / 基于 AST 递归的正确嵌套渲染
- **4 device frames / 4 种设备框架** — Phone, Tablet, Watch, Car / 手机、平板、手表、车机
- **Auto-refresh on save / 保存自动刷新** — preview updates when switching files / 切换文件时预览自动更新
- **Hover inspect / 悬浮检查** — hover to see component type labels / 悬浮查看组件类型标签

## Requirements / 环境要求

- **HDC** (HarmonyOS Device Connector) in PATH, or configure `harmony.hdcPath` in settings / HDC 在 PATH 中，或在设置中配置 `harmony.hdcPath`
- **hvigorw** — the project must contain `hvigorw` script in the root directory / 项目根目录需包含 `hvigorw` 脚本（标准鸿蒙项目）
- A connected HarmonyOS device or emulator for build/run/debug features / 已连接的鸿蒙设备或模拟器（构建/运行/调试功能需要）

## Extension Settings / 扩展设置

| Setting / 设置项 | Default / 默认值 | Description / 说明 |
|---------|---------|-------------|
| `harmony.sdkPath` | `""` | Path to HarmonyOS SDK root / HarmonyOS SDK 根目录路径 |
| `harmony.hdcPath` | `""` | Path to HDC executable (auto-detected if empty) / HDC 可执行文件路径（为空时自动检测） |
| `harmony.enableCodeLens` | `true` | Show component references as CodeLens / 以 CodeLens 显示组件引用 |
| `harmony.enableResourceValidation` | `true` | Validate `$r()` references / 校验 `$r()` 资源引用 |
| `harmony.autoFormatOnSave` | `false` | Auto-format ArkTS files on save / 保存时自动格式化 ArkTS 文件 |
| `harmony.devicePollInterval` | `5000` | Device list refresh interval (ms) / 设备列表刷新间隔（毫秒） |
| `harmony.logLevel` | `"info"` | Extension log level / 扩展日志级别 |
| `harmony.enableDiagnostics` | `true` | Enable real-time ArkTS diagnostics / 启用实时 ArkTS 诊断 |
| `harmony.enablePerfLens` | `true` | Show performance insight CodeLens / 显示性能洞察 CodeLens |
| `harmony.enableOhpmInsight` | `true` | Show OHPM dependency insights / 显示 OHPM 依赖洞察 |

## Quick Start / 快速开始

1. Install the extension from VS Code Marketplace / 从 VS Code 插件市场安装本扩展
2. Open a HarmonyOS project folder (must contain `build-profile.json5`) / 打开鸿蒙项目文件夹（需包含 `build-profile.json5`）
3. The extension activates automatically — you'll see "HarmonyOS" in the status bar / 扩展自动激活 — 状态栏会显示 "HarmonyOS"
4. Connect a device via USB or start an emulator / 通过 USB 连接设备或启动模拟器
5. Press `Cmd+Shift+P` and run `HarmonyOS: Build & Run (Terminal)` / 按 `Cmd+Shift+P` 运行 `HarmonyOS: Build & Run (Terminal)`

## Architecture / 架构

Built with a microkernel architecture for minimal footprint:
采用微内核架构，极致轻量：
- **4-layer lazy loading / 4 层懒加载** — features load only when needed / 功能按需加载
- **~130KB production bundle / ~130KB 生产包** — ultra-lightweight / 超轻量
- **EventBus + Registry / 事件总线 + 注册表** — extensible plugin system / 可扩展的插件系统
- **Public API / 公共 API** — third-party extensions can integrate via the exported API / 第三方扩展可通过导出的 API 集成
- **417 unit tests / 417 个单元测试** — comprehensive test coverage / 全面的测试覆盖

## All Commands / 所有命令

| Command / 命令 | Description / 说明 |
|---------|-------------|
| `HarmonyOS: Create New Project` | Project creation wizard / 项目创建向导 |
| `HarmonyOS: Build HAP` | Build the HAP package / 构建 HAP 包 |
| `HarmonyOS: Clean Build` | Clean build cache / 清理构建缓存 |
| `HarmonyOS: Build & Run (Terminal)` | Build, install, and launch in terminal / 在终端中构建、安装并启动 |
| `HarmonyOS: Build & Run on Device` | Build, install, launch + open UI Inspector / 构建、安装、启动 + 打开 UI 检查器 |
| `HarmonyOS: Run on Device` | Install and run existing HAP / 安装并运行已有 HAP |
| `HarmonyOS: Debug App on Device` | Launch with debugger attached / 附加调试器启动 |
| `HarmonyOS: Stop App on Device` | Force-stop the running app / 强制停止运行中的应用 |
| `HarmonyOS: Open UI Inspector` | Device UI hierarchy viewer / 设备 UI 层级查看器 |
| `HarmonyOS: Open Device Mirror` | Mirror device screen with touch interaction / 镜像设备屏幕，支持触控交互 |
| `HarmonyOS: Launch Emulator` | Launch a DevEco Studio emulator / 启动 DevEco Studio 模拟器 |
| `HarmonyOS: Stop Emulator` | Stop a running emulator / 停止运行中的模拟器 |
| `HarmonyOS: Preview Component` | Enhanced component preview / 增强组件预览 |
| `HarmonyOS: View Device Logs` | Stream device logs / 流式查看设备日志 |
| `HarmonyOS: Refresh Devices` | Refresh device list / 刷新设备列表 |
| `HarmonyOS: Install HAP to Device` | Install a .hap file / 安装 .hap 文件 |
| `HarmonyOS: Take Device Screenshot` | Capture device screenshot / 截取设备截图 |
| `HarmonyOS: Format ArkTS File` | Format current file / 格式化当前文件 |
| `HarmonyOS: Organize Imports` | Organize import statements / 整理导入语句 |
| `HarmonyOS: Extract to @Component` | Extract UI to component / 提取 UI 为组件 |
| `HarmonyOS: Extract to @Builder` | Extract UI to builder / 提取为 Builder |
| `HarmonyOS: Extract to $r() Resource` | Extract string to resource / 提取字符串为资源 |
| `HarmonyOS: Manage Dependencies` | Manage oh-package.json5 / 管理依赖 |
| `HarmonyOS: Search HarmonyOS Docs` | Search official docs / 搜索官方文档 |
| `HarmonyOS: Migrate V1 → V2 Decorators` | One-click V1 to V2 decorator migration / 一键 V1→V2 装饰器迁移 |
| `HarmonyOS: Check API Compatibility` | Scan project for API version issues / 扫描项目 API 版本兼容问题 |

## License / 许可证

MIT
