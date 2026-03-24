# HarmonyOS Dev Tools

Build, run, debug, inspect, and validate HarmonyOS / OpenHarmony apps directly in VS Code.
直接在 VS Code 里完成 HarmonyOS / OpenHarmony 应用的编写、构建、运行、调试、诊断与设备联调。

> Core goal / 核心目标：hide HDC, hvigor, config migration, and device-targeting complexity behind a simpler VS Code workflow.
> 把 HDC、hvigor、配置迁移、多设备选择这些复杂度收进插件里，让用户尽量只关心“选设备、点运行、看结果”。

## What's New in v0.7.0 / v0.7.0 新变化

`v0.7.0` aligns the extension with HarmonyOS 6 (API 20/22), adds Cangjie language support, and introduces comprehensive stress testing.
`v0.7.0` 对齐 HarmonyOS 6 (API 20/22) 生态、新增仓颉语言支持、极限压测全覆盖。

- **Cangjie (仓颉) language support / 仓颉语言支持**
  - TextMate syntax highlighting for `.cj` files — 60+ keywords, built-in types, annotations, string interpolation, nested block comments
  - 17 code snippets: `main`, `func`, `class`, `struct`, `enum`, `interface`, `match`, `let`, `var`, `spawn`, `for`, `while`, `trycatch`, `import`, `println`, `extend`, `prop`
  - `.cj` 文件语法高亮（60+ 关键字、内置类型、注解、字符串插值、嵌套注释）+ 17 代码片段
- **HarmonyOS 6 metadata / HarmonyOS 6 元数据**
  - 9 new components (Repeat, FoldSplitContainer, MediaCachedImage, etc.) + `@Track` decorator
  - 新增 9 个组件（Repeat、FoldSplitContainer、MediaCachedImage 等）+ `@Track` 装饰器
- **Page-level scaffolding snippets / 页面级骨架片段**
  - `listpage`, `detailpage`, `loginpage`, `emptystate`, `fileio`, `navdest`, and more
  - 列表页、详情页、登录页、空状态、文件 I/O 等一整页骨架片段
- **New diagnostic rules / 新诊断规则**
  - `@ohos.router` deprecation detection → suggests Navigation + NavPathStack migration
  - Hardcoded sandbox path detection (`/data/storage/`, `/storage/`) → suggests `getContext().filesDir`
  - Quick Fix: one-click open official HarmonyOS documentation
  - `@ohos.router` 废弃检测 → 建议迁移到 Navigation + NavPathStack
  - 硬编码沙盒路径检测 → 建议使用 `getContext().filesDir`
- **Test coverage / 测试覆盖** — 172 new stress tests (649 → 821 total, +26.5%)
  补充了 172 条极限压测（649 → 821，+26.5%）

## How to Use v0.7.0 / v0.7.0 怎么用

### Fastest workflow / 最快上手方式

1. Open the `HarmonyOS` sidebar and start from `Quick Actions`.
   打开 `HarmonyOS` 侧边栏，从 `Quick Actions` 开始。
2. Click `Check SDK / HDC Environment`.
   先点 `Check SDK / HDC Environment`。
3. Click the status-bar `HarmonyOS` button, or click the active-device button to choose a target.
   再点状态栏里的 `HarmonyOS` 按钮，或者点当前设备按钮来选目标设备。
4. If your page contains `Web(...)`, click `Open WebView DevTools` from `Quick Actions` or the device tree.
   如果页面里用了 `Web(...)`，直接在 `Quick Actions` 或设备树里点 `Open WebView DevTools`。
5. For API 20+ wireless debugging, the extension will try to detect the device IP automatically, preferring IPv4 but falling back to IPv6 when needed, and open `chrome://inspect/#devices` for you.
   对 API 20+ 无线调试，插件会尽量自动探测设备 IP，优先用 IPv4，必要时回退到 IPv6，并直接帮你打开 `chrome://inspect/#devices`。
6. If the current ArkTS file contains `Web({ src: ... })` or `loadUrl(...)`, keep that file focused before you click `Open WebView DevTools`; the extension will use those URL hints to guess the right page first.
   如果当前 ArkTS 文件里有 `Web({ src: ... })` 或 `loadUrl(...)`，在点击 `Open WebView DevTools` 前保持这个文件处于焦点状态；插件会优先拿这些 URL 线索去猜正确页面。
7. If a single matching WebView page is detected, you can open it directly; if the hint is ambiguous, or the runtime target payload is incomplete, the extension will safely fall back instead of opening the wrong page.
   如果只检测到一个匹配的 WebView 页面，你可以直接打开它；如果线索不够明确，或者运行时返回的目标信息不完整，插件会安全回退，而不是打开错误页面。
8. If you are building a themed page, type `withtheme` or `themecontrol`, or search `WithTheme` / `ThemeControl` in docs/completion.
   如果你要做主题换肤页面，直接输入 `withtheme` 或 `themecontrol`，或者在补全/文档搜索里找 `WithTheme` / `ThemeControl`。
9. If you switch local color mode, make sure the project has either `dark.json` or `resources/dark/...` resources.
   如果你要切局部深浅色，记得工程里要有 `dark.json` 或 `resources/dark/...` 深色资源。
10. Click `Build, Install & Run`.
   然后点 `Build, Install & Run`。
11. For device-specific work, right-click the device node in `Connected Devices`.
   如果要看日志、镜像、截图、UI Inspector，就在 `Connected Devices` 里右键对应设备。

## Start Here / 先从这里开始

### 1-Minute Onboarding / 1 分钟上手

1. Run `HarmonyOS: Check SDK / HDC Environment` to confirm SDK, HDC, and project prerequisites.
   先运行 `HarmonyOS: Check SDK / HDC Environment`，确认 SDK、HDC 和工程前置条件都正常。
2. Open a HarmonyOS project that contains `build-profile.json5`.
   打开包含 `build-profile.json5` 的鸿蒙工程。
3. Connect a device or start an emulator, then click the active-device status bar item or run `HarmonyOS: Select Active Device`.
   连接真机或启动模拟器，然后点击状态栏当前设备，或执行 `HarmonyOS: Select Active Device`。
4. Use `Quick Actions` to run `Build, Install & Run`.
   在 `Quick Actions` 里直接点 `Build, Install & Run`。

### Best Entry Points / 最常用入口

| Entry / 入口 | Use it when / 什么时候用 | What you get / 你会得到什么 |
|--------------|--------------------------|------------------------------|
| **Quick Actions / 快捷操作栏** | You want the main HarmonyOS workflow without searching commands / 想直接进入主流程，不想搜命令 | Build, run, debug, mirror, logs, screenshot, and environment check in one place / 构建、运行、调试、镜像、日志、截图、环境检查都在一个地方 |
| **Status bar `HarmonyOS` / 状态栏 `HarmonyOS`** | You want a small control center that is always visible / 想要一个常驻的小控制中心 | One click opens the main HarmonyOS action picker / 一点打开主操作选择器 |
| **Status bar active device / 状态栏当前设备** | You want one shared target device for run, mirror, screenshot, logs, and inspector / 想让运行、镜像、截图、日志、Inspector 共用一个目标设备 | Click once to switch the active device used by the extension / 一次切换，整套命令共用 |
| **Connected Devices / 设备列表** | You want to act on one exact device / 想针对某一台设备直接操作 | Right-click for mirror, inspector, logs, screenshot, and set-active-device / 右键直接镜像、Inspector、日志、截图、设为当前设备 |
| **HarmonyOS sidebar / HarmonyOS 侧边栏** | You want to browse project files, resources, and devices / 想看项目文件、资源和设备 | `Quick Actions`、`Project Files`、`Connected Devices`、`App Resources` four focused views / 四个聚焦视图 |
| **Command Palette / 命令面板** | You need a less common action / 需要低频命令时 | Still available, but no longer the main path / 仍然可用，但不再是主路径 |
| **Right-click in ArkTS / ArkTS 右键菜单** | You are editing UI code and want fast refactors / 编辑 UI 代码时想快速重构 | Extract `@Component`, `@Builder`, `$r()`, and migration actions / 提取组件、Builder、资源和迁移动作 |

### Recommended First Workflow / 推荐第一次先走这条链路

1. Open `HarmonyOS` sidebar → `Quick Actions`
2. `Check SDK / HDC Environment`
3. `Select Active Device`
4. `Build, Install & Run`
5. Right-click the device in `Connected Devices` → `Inspect Running UI` or `Open Device Mirror`

## Features / 功能特性

### Language Support / 语言支持
- **ArkTS syntax highlighting / ArkTS 语法高亮** — for `.ets` files / 适用于 `.ets` 文件
- **Cangjie syntax highlighting / 仓颉语法高亮** — for `.cj` files with 60+ keywords, built-in types, annotations / 适用于 `.cj` 文件，60+ 关键字、内置类型、注解
- **80+ ArkTS code snippets / 80+ ArkTS 代码片段** — type `comp`, `entry`, `listpage`, `detailpage`, `loginpage`, `fileio`, `navstack`, etc. / 输入前缀触发
- **17 Cangjie code snippets / 17 仓颉代码片段** — type `main`, `func`, `class`, `struct`, `enum`, `match`, `spawn`, etc. / 输入前缀触发
- **Auto-completion / 自动补全** — decorators (V1+V2+API 13/14/18/20, including `@Track`), ArkUI components (99, including `Repeat`, `FoldSplitContainer`, `MediaCachedImage`), and lifecycle methods / 装饰器（含 `@Track`）、ArkUI 组件（99 个，含 `Repeat`、`FoldSplitContainer`、`MediaCachedImage`）、生命周期方法
- **Hover documentation / 悬浮文档** — bilingual docs for 30+ ArkTS decorators (V1, V2, API 13+, API 14+, API 18+) / 30+ 装饰器中英文悬浮文档
- **CodeLens** — showing component references and `@Entry` route info / 显示组件引用计数和 `@Entry` 路由信息
- **Color preview / 颜色预览** — hex colors (`#RRGGBB`, `#AARRGGBB`) and named colors (`Color.Red`) / 十六进制颜色和命名颜色

### Resource Management / 资源管理
- **`$r()` auto-completion / `$r()` 自动补全** — suggests resource keys from `resources/` directory / 从 `resources/` 目录提示资源键名
- **Ctrl+Click navigation / Ctrl+Click 跳转** — jump from `$r('app.string.title')` to the resource definition / 从 `$r('app.string.title')` 跳转到资源定义
- **Resource validation / 资源校验** — diagnostics for missing or invalid resource references / 检测缺失或无效的资源引用

### HarmonyOS NEXT / V2 State Management / V2 状态管理

> ArkUI language features currently cover API 12-20 decorators/components plus current `Repeat` / `WithTheme` / `FoldSplitContainer` / `MediaCachedImage` guidance.
> 工程配置识别已补齐新版 HarmonyOS 5.x / 6.x `targetSdkVersion`、`buildModeSet`、`oh-package modelVersion` 写法。

- **V2 Decorator support / V2 装饰器支持** — `@ComponentV2`, `@Local`, `@Param`, `@Once`, `@Event`, `@Monitor`, `@Computed`, `@ObservedV2`, `@Trace`, `@Provider`, `@Consumer`
- **API 13+ Decorators / API 13+ 装饰器** — `@Require` (required parameter enforcement)
- **API 14+ Decorators / API 14+ 装饰器** — `@Type` (PersistenceV2 type annotation)
- **API 14+ APIs** — `makeObserved()`, enhanced drag-and-drop events, `EffectComponent`
- **V1 → V2 Migration / V1 → V2 迁移** — run `HarmonyOS: Migrate V1 → V2 Decorators` to one-click migrate decorators in the current file / 运行命令一键迁移当前文件中的装饰器
  - `@Component` → `@ComponentV2`, `@State` → `@Local`, `@Prop` → `@Param`, `@Provide` → `@Provider`, `@Consume` → `@Consumer`, `@Watch` → `@Monitor`, `@Observed` → `@ObservedV2`
  - Detects V1/V2 mixing and warns before proceeding / 检测 V1/V2 混用并在执行前警告
- **API Compatibility Check / API 兼容性检查** — run `HarmonyOS: Check API / SDK Compatibility` to scan your project for version mismatches / 运行命令扫描项目中的版本兼容问题
  - Recognizes modern `targetSdkVersion` (e.g. `6.0.0(20)` / `6.0.2(22)`) and legacy `compileSdkVersion` / 同时识别新版 `targetSdkVersion` 和旧版 `compileSdkVersion`
  - Validates feature usage against currently covered API 12/13/14 metadata / 基于当前已覆盖的 API 12/13/14 特性库做兼容性检查
  - **Deprecated API detection / 废弃 API 检测** — detects 15+ deprecated modules and functions with migration suggestions / 检测 15+ 废弃模块和函数并给出迁移建议
  - Line-number reporting for each issue / 每个问题报告行号
  - Upgrade suggestions / 升级建议
  - Checks `hvigor-config.json5` `modelVersion` format / 检查 hvigor 配置版本格式
  - Reports V1/V2 mixing in same file / 报告同文件 V1/V2 混用

### Real-time Diagnostics / 实时诊断 (v0.4.0+)

> **NEW** — Catch errors instantly without waiting 20+ minutes for DevEco compilation.
> **新功能** — 无需等待 DevEco 20+ 分钟编译，即时捕获错误。

- **ArkTS strict type checking / ArkTS 严格类型检查** — detects `any`, `unknown`, `as any`, implicit `any` in function parameters / 检测 `any`、`unknown`、`as any`、函数参数隐式 `any`
- **State management trap detection / 状态管理陷阱检测** — warns when `@State` is used with complex objects (shallow observation), detects V1/V2 mixing, flags `@Link` in `@ComponentV2` / 当 `@State` 用于复杂对象时警告（浅观察），检测 V1/V2 混用，标记 `@Link` 在 `@ComponentV2` 中
- **Performance anti-pattern detection / 性能反模式检测** — flags `ForEach` (suggest `LazyForEach`), detects `fetch()`, `setTimeout`, `console.log`, `JSON.parse`, `await` inside `build()` / 标记 `ForEach`（建议 `LazyForEach`），检测 `build()` 中的网络请求、定时器、日志输出等
- **`@ohos.router` deprecation detection / `@ohos.router` 废弃检测** _(v0.7.0)_ — detects `import router from '@ohos.router'` and all `router.*()` calls, suggests Navigation + NavPathStack / 检测 `@ohos.router` 导入和所有 `router.*()` 调用，建议使用 Navigation + NavPathStack
- **Sandbox path anti-pattern detection / 沙盒路径反模式检测** _(v0.7.0)_ — detects hardcoded `/data/storage/`, `/data/el1/`, `/data/el2/`, `/storage/` paths, suggests `getContext().filesDir` / 检测硬编码的沙盒路径，建议使用 `getContext().filesDir`
- **Quick Fix / 快速修复** — auto-fix suggestions for all diagnostics: replace `any` with concrete types, `@State` → `@ObservedV2 + @Trace`, `@Link` → `@Param`, `ForEach` → `LazyForEach`, trigger V1→V2 migration, open deprecated router/sandbox docs / 所有诊断的自动修复建议

### Performance Insight CodeLens / 性能洞察 CodeLens (v0.4.0+)

- **`build()` analysis / `build()` 分析** — shows component count, nesting depth, and rendering strategy / 显示组件数量、嵌套深度和渲染策略
- **ForEach/LazyForEach tips / ForEach/LazyForEach 提示** — inline CodeLens explaining rendering strategy and performance implications / 内联 CodeLens 说明渲染策略和性能影响
- **State variable count / 状态变量计数** — shows state variable count per struct with warning for > 10 / 每个 struct 的状态变量计数，超过 10 个时警告

### Config File Intelligence / 配置文件智能 (v0.4.0+)

- **Hover documentation / 悬浮文档** — bilingual (中/EN) docs when hovering over keys in `build-profile.json5`, `module.json5`, `app.json5`, `oh-package.json5` / 悬浮在配置文件键名上时显示中英文文档
- **Modern HarmonyOS config awareness / 新版鸿蒙配置感知** — understands `targetSdkVersion`, `buildModeSet`, and `oh-package.json5` `modelVersion` / 识别 `targetSdkVersion`、`buildModeSet`、`oh-package.json5` `modelVersion`
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

#### Build, Install & Run in Terminal / 终端构建安装运行
Run `HarmonyOS: Build, Install & Run in Terminal` from the Command Palette (`Cmd+Shift+P`).
从命令面板（`Cmd+Shift+P`）运行 `HarmonyOS: Build, Install & Run in Terminal`。

Executes in VS Code's integrated terminal with full output:
在 VS Code 集成终端中执行，完整输出：
```
[1/4] Building HAP...        -> ./hvigorw assembleHap    (构建 HAP 包)
[2/4] Locating HAP output... -> finds .hap file          (查找 HAP 文件)
[3/4] Installing to device...-> hdc install              (安装到设备)
[4/4] Launching app...       -> hdc shell aa start       (启动应用)
```

#### One-Click Build, Install & Run / 一键构建安装运行
Run `HarmonyOS: One-Click Build, Install & Run` — same workflow but runs in background with progress notification, then auto-opens the UI Inspector.
运行 `HarmonyOS: One-Click Build, Install & Run` — 同样的流程但在后台运行，显示进度通知，完成后自动打开 UI Inspector。

#### Other Build Commands / 其他构建命令
- `HarmonyOS: Build HAP Package` — build only / 仅构建
- `HarmonyOS: Clean Build` — clean build cache / 清理构建缓存
- `HarmonyOS: Stop Running App on Device` — force-stop the running app / 强制停止运行中的应用

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
Run `HarmonyOS: Inspect Running UI` to open a WebView panel with:
运行 `HarmonyOS: Inspect Running UI` 打开 WebView 面板，包含：
- **Device screenshot / 设备截图** — live view of the running app / 运行中应用的实时画面
- **Component tree / 组件树** — hierarchical view of ArkUI components / ArkUI 组件的层级视图
- **Property panel / 属性面板** — bounds, attributes, and layout info for selected component / 选中组件的边界、属性和布局信息
- **Go to Source / 跳转源码** — click to jump to the component's `.ets` source code / 点击跳转到组件的 `.ets` 源代码
- **Live mode / 实时模式** — click "Live" button to auto-refresh every 2 seconds / 点击"Live"按钮每 2 秒自动刷新

#### Device Log Viewer / 设备日志查看器
Run `HarmonyOS: Open Device Logs (hilog)` to stream `hdc hilog` output to VS Code's Output panel.
运行 `HarmonyOS: Open Device Logs (hilog)` 将 `hdc hilog` 输出流式传输到 VS Code 的 Output 面板。

### Device Management / 设备管理
- **Active device status bar / 当前设备状态栏** — one shared target device for run, mirror, screenshot, logs, and inspector / 一套命令共享同一个当前设备
- **Device TreeView / 设备树视图** — sidebar panel showing connected devices with auto-refresh / 侧边栏面板显示已连接设备，自动刷新
- `HarmonyOS: Refresh Device List` — manually refresh device list / 手动刷新设备列表
- `HarmonyOS: Select Active Device` — switch the default device used by the extension / 切换扩展默认使用的设备
- `HarmonyOS: Install HAP to Device` — select and install a .hap file / 选择并安装 .hap 文件
- `HarmonyOS: Capture Device Screenshot` — capture and save device screenshot / 截取并保存设备截图

### Project Tools / 项目工具
- **Project creation wizard / 项目创建向导** — `HarmonyOS: Create HarmonyOS Project` with 4 templates (Empty, List, Tabs, Login) / 4 种模板（空白、列表、标签页、登录）
- **Modern starter config / 新版起步工程配置** — generated templates use current-style `targetSdkVersion`, `buildModeSet`, and `oh-package modelVersion` / 新建模板默认输出新版构建配置写法
- **Code actions / 代码操作** — right-click menu / 右键菜单：
  - Extract to `@Component` — extract selected UI code to a new component / 提取选中 UI 代码为新组件
  - Extract to `@Builder` — extract to a `@Builder` method / 提取为 `@Builder` 方法
  - Extract to `$r()` — extract hardcoded strings to resource references / 提取硬编码字符串为资源引用
- `HarmonyOS: Migrate V1 → V2 Decorators` — one-click decorator migration (also in right-click menu) / 一键装饰器迁移（右键菜单可用）
- `HarmonyOS: Check API / SDK Compatibility` — scan project for API version mismatches / 扫描项目 API 版本兼容问题
- `HarmonyOS: Organize Imports` — organize import statements / 整理导入语句
- `HarmonyOS: Format ArkTS File` — format current file / 格式化当前文件
- `HarmonyOS: Upgrade Legacy build-profile` — upgrade older build-profile content to the modern structure / 升级旧版 build-profile 到新版结构
- `HarmonyOS: Manage OHPM Dependencies` — manage oh-package.json5 / 管理依赖
- `HarmonyOS: Open HarmonyOS Docs Search` — search official docs / 搜索官方文档

### Device Mirror / 设备镜像 (v0.3.0+)

> **NEW** — Mirror your device screen inside VS Code with full touch interaction.
> **新功能** — 在 VS Code 中镜像设备屏幕，支持完整触控交互。

- **Live screen streaming / 实时屏幕流** — HDC screenshot polling at 1-5 FPS / 基于 HDC 截图轮询，1-5 FPS 可调
- **Touch forwarding / 触控转发** — click, swipe, long-press directly on the WebView canvas / 在 WebView 画布上直接点击、滑动、长按
- **Key bar / 按键栏** — Home, Back, Recent, Volume, Power buttons / Home、返回、最近任务、音量、电源按键
- **Active device aware / 跟随当前设备** — reuses the current device selected in the status bar, with explicit switching when needed / 默认复用状态栏中选定的当前设备，需要时再切换
- **No-device fallback / 无设备提示** — friendly message when no device is connected / 无设备连接时友好提示

### Emulator Manager / 模拟器管理 (v0.3.0+)

- **Auto-detect emulators / 自动检测模拟器** — scans DevEco Studio emulator directories (macOS/Windows/Linux) / 扫描 DevEco Studio 模拟器目录
- **TreeView integration / 树视图集成** — Devices & Emulators sections in sidebar / 侧边栏设备和模拟器分组显示
- **Launch / Stop / 启动/停止** — start emulators from VS Code, auto-opens Device Mirror when online / 从 VS Code 启动模拟器，上线后自动打开设备镜像
- **Status monitoring / 状态监控** — running/stopped status with live icons / 运行/停止状态实时图标

### Component Preview / 组件预览 (Enhanced v0.3.0+)

Run `HarmonyOS: Preview ArkUI Component` on any `.ets` file to see a live preview of the UI layout.
在任意 `.ets` 文件上运行 `HarmonyOS: Preview ArkUI Component`，查看 UI 布局的实时预览。

- **15+ layout containers / 15+ 布局容器** — Column, Row, Stack, Grid, List, Flex, Scroll, Tabs, Navigation, RelativeContainer, etc.
- **20+ leaf components / 20+ 叶子组件** — Text, Button, Image, TextInput, TextArea, Toggle, Slider, Progress, Search, Checkbox, Radio, Rating, etc.
- **Style property rendering / 样式属性渲染** — width, height, padding, margin, backgroundColor, borderRadius, fontSize, fontColor, opacity, justifyContent, alignItems, layoutWeight, etc.
- **Nested rendering / 嵌套渲染** — correct recursive AST-based rendering / 基于 AST 递归的正确嵌套渲染
- **4 device frames / 4 种设备框架** — Phone, Tablet, Watch, Car / 手机、平板、手表、车机
- **Auto-refresh on save / 保存自动刷新** — preview updates when switching files / 切换文件时预览自动更新
- **Hover inspect / 悬浮检查** — hover to see component type labels / 悬浮查看组件类型标签

## 解决哪些社区痛点 / What Pain Points We Address

针对鸿蒙开发社区常见吐槽，本插件重点缓解以下问题：

| 社区痛点 | 本插件能力 |
|----------|------------|
| **编译慢、等 20+ 分钟才见报错** | 实时诊断：不依赖 DevEco 全量编译，即时报 any/状态/性能问题 |
| **环境配置繁琐、不知道缺啥** | `HarmonyOS: Check SDK / HDC Environment` 一键检查 SDK/HDC/Command Line Tools/工程，并给出官方文档入口 |
| **查 API/文档效率低** | 装饰器与配置键悬浮文档、`Open HarmonyOS Docs Search` 内置官方快捷入口、API 兼容性检查与废弃 API 提示 |
| **新旧构建配置切换容易踩坑** | 同时识别 `targetSdkVersion` / `compileSdkVersion`，并补齐 `buildModeSet`、`oh-package modelVersion` 文档与模板 |
| **V1/V2 混用、状态管理难上手** | V1/V2 混用诊断、一键迁移 V1→V2、状态陷阱与 Quick Fix |
| **配置文件看不懂** | build-profile / module / app / oh-package 键名悬浮中英文说明 |
| **不想装 DevEco、习惯 VS Code** | 构建/运行/调试/设备镜像/预览均在 VS Code 内完成，无需启动 DevEco |

详细规划与优先级见 [docs/ROADMAP-社区痛点与规划.md](docs/ROADMAP-社区痛点与规划.md)。

---

## Requirements / 环境要求

- **HDC** (HarmonyOS Device Connector) in PATH, or configure `harmony.hdcPath` in settings / HDC 在 PATH 中，或在设置中配置 `harmony.hdcPath`
- **HarmonyOS Command Line Tools** recommended (`sdkmgr`, `ohpm`, `codelinter`) / 推荐安装鸿蒙命令行工具
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
| `harmony.enableProjectConfigDiagnostics` | `true` | Validate build-profile migration, startup chain, and Navigation routes / 校验 build-profile 迁移、启动链路与 Navigation 路由 |
| `harmony.enablePerfLens` | `true` | Show performance insight CodeLens / 显示性能洞察 CodeLens |
| `harmony.enableOhpmInsight` | `true` | Show OHPM dependency insights / 显示 OHPM 依赖洞察 |

## Quick Start / 快速开始

1. Install the extension from VS Code Marketplace / 从 VS Code 插件市场安装本扩展
2. Open a HarmonyOS project folder (must contain `build-profile.json5`) / 打开鸿蒙项目文件夹（需包含 `build-profile.json5`）
3. Run `HarmonyOS: Check SDK / HDC Environment` once after install / 安装后先运行一次 `HarmonyOS: Check SDK / HDC Environment`
4. Connect a device via USB or start an emulator, then use the status bar or `HarmonyOS: Select Active Device` / 通过 USB 连接设备或启动模拟器，然后用状态栏或 `HarmonyOS: Select Active Device` 选择当前设备
5. Press `Cmd+Shift+P` and run `HarmonyOS: Build, Install & Run in Terminal` / 按 `Cmd+Shift+P` 运行 `HarmonyOS: Build, Install & Run in Terminal`

## Architecture / 架构

Built with a microkernel architecture for minimal footprint:
采用微内核架构，极致轻量：
- **4-layer lazy loading / 4 层懒加载** — features load only when needed / 功能按需加载
- **Lazy-loaded extension bundle / 按需加载扩展包** — keeps startup overhead low / 保持较低启动开销
- **EventBus + Registry / 事件总线 + 注册表** — extensible plugin system / 可扩展的插件系统
- **Public API / 公共 API** — third-party extensions can integrate via the exported API / 第三方扩展可通过导出的 API 集成
- **470+ unit tests / 470+ 个单元测试** — comprehensive test coverage / 全面的测试覆盖

## All Commands / 所有命令

| Command / 命令 | Description / 说明 |
|---------|-------------|
| `HarmonyOS: Create HarmonyOS Project` | Project creation wizard / 项目创建向导 |
| `HarmonyOS: Build HAP Package` | Build the HAP package / 构建 HAP 包 |
| `HarmonyOS: Clean Build` | Clean build cache / 清理构建缓存 |
| `HarmonyOS: Build, Install & Run in Terminal` | Build, install, and launch in terminal / 在终端中构建、安装并启动 |
| `HarmonyOS: One-Click Build, Install & Run` | Build, install, launch + open UI Inspector / 构建、安装、启动 + 打开 UI 检查器 |
| `HarmonyOS: Run Built App on Device` | Install and run an existing built HAP / 安装并运行已有构建产物 |
| `HarmonyOS: Debug App on Device` | Launch with debugger attached / 附加调试器启动 |
| `HarmonyOS: Stop Running App on Device` | Force-stop the running app / 强制停止运行中的应用 |
| `HarmonyOS: Inspect Running UI` | Device UI hierarchy viewer / 设备 UI 层级查看器 |
| `HarmonyOS: Open Device Mirror` | Mirror device screen with touch interaction / 镜像设备屏幕，支持触控交互 |
| `HarmonyOS: Start Emulator` | Launch a DevEco Studio emulator / 启动 DevEco Studio 模拟器 |
| `HarmonyOS: Stop Emulator` | Stop a running emulator / 停止运行中的模拟器 |
| `HarmonyOS: Preview ArkUI Component` | Enhanced component preview / 增强组件预览 |
| `HarmonyOS: Open Device Logs (hilog)` | Stream device logs / 流式查看设备日志 |
| `HarmonyOS: Refresh Device List` | Refresh device list / 刷新设备列表 |
| `HarmonyOS: Select Active Device` | Select the default device used by the extension / 选择扩展默认使用的设备 |
| `HarmonyOS: Install HAP to Device` | Install a .hap file / 安装 .hap 文件 |
| `HarmonyOS: Capture Device Screenshot` | Capture device screenshot / 截取设备截图 |
| `HarmonyOS: Format ArkTS File` | Format current file / 格式化当前文件 |
| `HarmonyOS: Organize Imports` | Organize import statements / 整理导入语句 |
| `HarmonyOS: Extract to @Component` | Extract UI to component / 提取 UI 为组件 |
| `HarmonyOS: Extract to @Builder` | Extract UI to builder / 提取为 Builder |
| `HarmonyOS: Extract to $r() Resource` | Extract string to resource / 提取字符串为资源 |
| `HarmonyOS: Manage OHPM Dependencies` | Manage oh-package.json5 / 管理依赖 |
| `HarmonyOS: Open HarmonyOS Docs Search` | Search official docs / 搜索官方文档 |
| `HarmonyOS: Migrate V1 → V2 Decorators` | One-click V1 to V2 decorator migration / 一键 V1→V2 装饰器迁移 |
| `HarmonyOS: Upgrade Legacy build-profile` | Upgrade older build-profile.json5 content to the modern structure / 升级旧版 build-profile.json5 到新版结构 |
| `HarmonyOS: Check API / SDK Compatibility` | Scan project for API and SDK version issues / 扫描项目 API 与 SDK 兼容问题 |
| `HarmonyOS: Check SDK / HDC Environment` | Check SDK / HDC / project setup and show doc links / 检查开发环境并输出文档链接 |

## License / 许可证

MIT
