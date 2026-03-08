# HarmonyOS Dev Tools

Lightweight & powerful HarmonyOS / OpenHarmony development toolkit for VS Code.
轻量且强大的 HarmonyOS / OpenHarmony VS Code 开发工具包。

> Build, run, debug, and inspect HarmonyOS apps directly from VS Code — no DevEco Studio required.
> 直接在 VS Code 中构建、运行、调试和检查鸿蒙应用 — 无需 DevEco Studio。

## Features / 功能特性

### Language Support / 语言支持
- **ArkTS syntax highlighting / ArkTS 语法高亮** — for `.ets` files / 适用于 `.ets` 文件
- **55+ code snippets / 55+ 代码片段** — type `comp`, `entry`, `col`, `row`, `btn`, `state`, `compv2`, `local`, `param`, `monitor`, etc. / 输入 `comp`、`entry`、`compv2`、`local`、`param`、`monitor` 等触发
- **Auto-completion / 自动补全** — decorators (`@Component`, `@State`, `@ComponentV2`, `@Local`...), ArkUI components (70+), and lifecycle methods / 装饰器（V1+V2）、ArkUI 组件（70+）、生命周期方法
- **Hover documentation / 悬浮文档** — bilingual docs for 30+ ArkTS decorators (V1 & V2) / 30+ 装饰器中英文悬浮文档（V1 & V2）
- **CodeLens** — showing component references and `@Entry` route info / 显示组件引用计数和 `@Entry` 路由信息
- **Color preview / 颜色预览** — hex colors (`#RRGGBB`, `#AARRGGBB`) and named colors (`Color.Red`) / 十六进制颜色和命名颜色

### Resource Management / 资源管理
- **`$r()` auto-completion / `$r()` 自动补全** — suggests resource keys from `resources/` directory / 从 `resources/` 目录提示资源键名
- **Ctrl+Click navigation / Ctrl+Click 跳转** — jump from `$r('app.string.title')` to the resource definition / 从 `$r('app.string.title')` 跳转到资源定义
- **Resource validation / 资源校验** — diagnostics for missing or invalid resource references / 检测缺失或无效的资源引用

### HarmonyOS NEXT / V2 State Management / V2 状态管理

> **NEW in v0.2.0+** — Full support for HarmonyOS NEXT (API 12+) V2 decorators.
> **v0.2.0+ 新增** — 全面支持 HarmonyOS NEXT（API 12+）V2 装饰器。

- **V2 Decorator support / V2 装饰器支持** — `@ComponentV2`, `@Local`, `@Param`, `@Once`, `@Event`, `@Monitor`, `@Computed`, `@ObservedV2`, `@Trace`, `@Provider`, `@Consumer`
- **V1 → V2 Migration / V1 → V2 迁移** — run `HarmonyOS: Migrate V1 → V2 Decorators` to one-click migrate decorators in the current file / 运行命令一键迁移当前文件中的装饰器
  - `@Component` → `@ComponentV2`, `@State` → `@Local`, `@Prop` → `@Param`, `@Provide` → `@Provider`, `@Consume` → `@Consumer`, `@Watch` → `@Monitor`, `@Observed` → `@ObservedV2`
  - Detects V1/V2 mixing and warns before proceeding / 检测 V1/V2 混用并在执行前警告
- **API Compatibility Check / API 兼容性检查** — run `HarmonyOS: Check API Compatibility` to scan your project for version mismatches / 运行命令扫描项目中的版本兼容问题
  - Validates V2 decorator usage against `compileSdkVersion` / 检查 V2 装饰器使用是否匹配编译 SDK 版本
  - Checks `hvigor-config.json5` `modelVersion` / 检查 hvigor 配置版本
  - Reports V1/V2 mixing in same file / 报告同文件 V1/V2 混用

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

### Component Preview / 组件预览
Run `HarmonyOS: Preview Component` on any `.ets` file to see a simplified preview of the UI layout in a WebView panel. Updates automatically on save.
在任意 `.ets` 文件上运行 `HarmonyOS: Preview Component`，在 WebView 面板中查看 UI 布局的简化预览。保存时自动更新。

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
| `HarmonyOS: Preview Component` | Simplified component preview / 简化组件预览 |
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
