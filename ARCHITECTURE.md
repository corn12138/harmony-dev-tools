# HarmonyOS VS Code Extension - Architecture Design v2

## 1. Project Overview

**Name**: `harmony-dev-tools`
**Slogan**: 轻如羽翼，强如利剑 — Lightweight but Powerful
**Purpose**: 为 HarmonyOS 开发者提供 VS Code 中最轻量、最高效的开发体验
**Target**: HarmonyOS NEXT (API 13+), ArkTS/ArkUI 开发

### 设计原则

| 原则 | 说明 |
|------|------|
| **Zero-Cost Abstraction** | 不用的功能不加载，不产生任何运行时开销 |
| **Lazy Everything** | 所有模块按需加载，激活时间 < 50ms |
| **Thin Client** | 插件本身只做胶水层，重计算委托给 LSP / Worker / WASM |
| **Bundle < 500KB** | 核心包体积严格控制，esbuild tree-shaking + 代码分割 |
| **Memory < 30MB** | 运行时内存占用不超过 30MB |

---

## 2. Complete Feature Matrix

### Layer 0 — 零成本特性 (纯声明式，无运行时代码)

这些特性完全通过 `package.json` 声明实现，**零 JS 运行时**，不影响启动速度。

| 特性 | 实现方式 | 体积增加 |
|------|---------|---------|
| `.ets` 文件语言注册 | `contributes.languages` | 0 |
| ArkTS 语法高亮 | TextMate Grammar JSON | ~15KB |
| ArkTS 代码片段 (50+) | `contributes.snippets` JSON | ~8KB |
| JSON5 配置文件 Schema | `contributes.jsonValidation` | ~20KB |
| 文件图标主题 | `contributes.iconThemes` | ~5KB |
| 语言配置 (括号匹配/注释/折叠) | `language-configuration.json` | ~2KB |
| 键盘快捷键 | `contributes.keybindings` | 0 |
| **小计** | | **~50KB** |

#### 2.0.1 ArkTS 语法高亮详情
- 扩展 TypeScript TextMate Grammar（不重写）
- 覆盖全部 ArkTS 装饰器:
  - 组件: `@Component`, `@Entry`, `@CustomDialog`, `@Builder`, `@BuilderParam`
  - 状态: `@State`, `@Prop`, `@Link`, `@Provide`, `@Consume`, `@Watch`
  - 对象: `@Observed`, `@ObjectLink`, `@ObservedV2`, `@Trace`
  - 样式: `@Styles`, `@Extend`, `@AnimatableExtend`
  - 其他: `@Concurrent`, `@Sendable`, `@Reusable`, `@Preview`
- struct 内 build() 方法的 ArkUI DSL 语义着色
- `.ets` 和 `.ts` 文件差异化处理

#### 2.0.2 超级代码片段 (50+)
- **组件**: Column, Row, Stack, Flex, Grid, List, Scroll, Tabs, Swiper, Navigation...
- **页面**: @Entry 页面模板、@CustomDialog 模板
- **状态管理**: @State/@Prop/@Link 绑定模式、AppStorage/LocalStorage
- **生命周期**: aboutToAppear, aboutToDisappear, onPageShow, onBackPress...
- **网络**: http 请求模板、WebSocket 模板
- **数据**: Preferences 持久化、RDB 数据库
- **权限**: 动态权限申请模板
- **动画**: animateTo、transition、共享元素动画
- **路由**: router.pushUrl、router.replaceUrl

#### 2.0.3 JSON5 Schema 智能支持
- `build-profile.json5` — 构建配置，products/modules 定义
- `oh-package.json5` — 包依赖，scripts 定义
- `module.json5` — abilities/extensionAbilities/permissions
- `app.json5` — 应用元信息，bundleName/versionCode
- `mock-config.json5` — Mock 数据配置
- 所有 Schema 带中英文字段描述和默认值提示

---

### Layer 1 — 轻量激活特性 (按需加载，首次使用时激活)

激活条件: `onLanguage:arkts` — 只在打开 `.ets` 文件时激活

| 特性 | 内存开销 | 加载时间 |
|------|---------|---------|
| ArkTS Language Service | ~15MB | ~200ms |
| $r() 资源智能补全 | ~2MB | ~50ms |
| CodeLens (组件引用计数) | ~1MB | ~30ms |
| Inlay Hints (类型/参数提示) | ~1MB | ~20ms |
| Color Decorator (颜色预览) | <1MB | ~10ms |

#### 2.1 ArkTS Language Service (核心)
**技术方案**: 复用 TypeScript Language Server，不引入 Volar.js (减少 ~2MB 依赖)

策略调整: 经过评估，Volar.js 对于纯 ArkTS 场景过重。采用更轻量的方式:
- 通过 `typescript.tsdk` 配置 + 自定义 TS Plugin 方式扩展
- 自动注入 ArkTS Type Definition Files (`.d.ts`) 到项目
- 通过 TS Compiler Plugin 禁用 ArkTS 语法的误报
- API 补全精度与 DevEco Studio 对齐

**提供能力**:
- 智能补全 (ArkUI 组件属性、事件、枚举值)
- 定义跳转 (Go to Definition)
- 悬停文档 (Hover Documentation)
- 签名帮助 (Signature Help)
- 重命名 (Rename Symbol)
- 查找引用 (Find References)
- 代码动作 (Quick Fix)

#### 2.2 $r() 资源智能系统
- **补全**: 输入 `$r('` 自动扫描 resources/ 目录，提供所有资源路径
- **跳转**: Ctrl+Click 从 `$r('app.media.icon')` 跳转到资源文件
- **验证**: Diagnostic 标记不存在的资源引用 (红色波浪线)
- **预览**: 图片资源 hover 时显示缩略图 (Decoration)
- **重命名**: 资源文件重命名时自动更新所有 `$r()` 引用
- **技术**: 文件 Watcher 监听 resources/ 变化，增量更新索引 (不全量扫描)

#### 2.3 CodeLens — 组件洞察
在代码行上方显示轻量信息:
- `@Component struct MyComponent` → `"3 references | 2 files"`
- `@Entry` 页面 → `"Route: pages/Index"`
- `@Builder` 方法 → `"Used 5 times"`
- 点击可跳转到引用/路由配置

#### 2.4 Inlay Hints — 内联提示
- ArkUI 组件属性类型提示: `.width(`: `number | string | Resource`
- 状态装饰器数据流可视化: `@Prop` → `← parent`、`@Link` → `↔ parent`
- 资源引用值预览: `$r('app.string.title')` → `"Hello World"`

#### 2.5 Color Decorator — 颜色可视化
- 识别 ArkTS 中的颜色值: `Color.Red`, `'#FF0000'`, `$r('app.color.primary')`
- 编辑器行内显示色块
- 点击色块打开颜色选择器 (VS Code 内置 API)
- 资源颜色实时解析预览

---

### Layer 2 — 命令触发特性 (用户主动触发时才加载)

这些功能模块**不会自动激活**，仅在用户通过命令面板或按钮触发时才动态加载。

#### 2.6 项目脚手架 (Command: `harmony.createProject`)
- 交互式向导 (QuickPick multi-step):
  - 选择模板: Empty Ability / List App / Tab App / Login App / E-Commerce
  - 配置: bundleName, API 版本, 模块结构
  - 一键生成完整项目结构
- 模板内嵌于插件 (压缩后 ~30KB)

#### 2.7 依赖管理 (Command: `harmony.manageDeps`)
- 可视化 oh-package.json5 依赖
- 搜索 ohpm 仓库 + 一键安装
- 依赖版本检查与更新提示
- `ohpm install` 命令封装

#### 2.8 构建系统集成 (Task Provider)
- 自动检测 hvigorfile.ts，注册 VS Code Tasks
- 支持任务: assembleHap, assembleApp, clean, test
- 构建输出解析 → Problem Matcher (点击错误跳转代码)
- 状态栏构建按钮 (仅在 HarmonyOS 项目中显示)
- 构建缓存感知 (不重复构建未变更模块)

#### 2.9 设备管理面板 (TreeView，按需注册)
- HDC 自动发现 (hdc list targets)
- 设备信息展示: 名称/型号/系统版本/IP
- 右键菜单: 安装 HAP, 卸载, 截屏, 文件管理
- 无线连接支持 (hdc tconn)
- 设备状态实时刷新 (Polling 5s，可配置)

#### 2.10 日志查看器 (Command: `harmony.viewLogs`)
- hilog 输出集成到 VS Code Output Channel
- 日志级别过滤 (Debug/Info/Warn/Error/Fatal)
- 按 TAG / PID 过滤
- 关键字搜索 + 高亮
- 崩溃堆栈点击跳转到源码
- 日志自动滚动 + 暂停

---

### Layer 3 — 高级增值特性 (独立子模块，可选安装)

这些特性以**独立代码分割 chunk** 存在，用户首次使用时异步下载/加载。

#### 2.11 ArkUI 可视化预览 (WebView Panel)
- 基于 WebView 的组件预览
- 解析 @Preview 装饰器的组件
- 支持多设备尺寸切换 (Phone/Tablet/Watch/TV)
- 实时更新 (文件保存时刷新)
- 技术: 将 ArkUI DSL 转译为 HTML/CSS 近似渲染

#### 2.12 调试支持 (Debug Adapter Protocol)
- 自动生成 launch.json 调试配置
- 支持 attach 到设备运行进程
- 断点/单步/变量查看
- 性能轨迹 (CPU/Memory 简要面板)

#### 2.13 代码质量工具
- **格式化**: 注册 DocumentFormattingProvider
  - 基于 Prettier + ArkTS 规则插件
  - 保存时自动格式化 (可配置)
- **Lint**: 集成 CodeLinter 规则
  - 常见错误模式检测
  - @State 使用不当提示
  - 性能反模式警告 (如整数浮点混用)
- **Import 优化**: 自动移除未使用的 import，自动排序

#### 2.14 代码生成与转换
- **TS → ArkTS 转换助手**: 标记需要修改的 TS 代码
- **组件提取**: 选中 UI 代码 → 提取为 @Builder 或 @Component
- **状态提升**: 自动将 @State 提升为 @Prop/@Link 模式
- **国际化**: 提取硬编码字符串 → $r('app.string.xxx')

#### 2.15 文档与学习
- ArkTS API 文档 hover 查看 (从 type defs 提取)
- 装饰器用法速查 (CodeAction: "What is @State?")
- 官方文档快速搜索 (Command Palette)
- 新手引导 (Walkthrough API)

---

## 3. Performance Architecture — 性能极致优化

### 3.1 启动性能

```
┌─────────────────────────────────────────────────────────┐
│                    Extension Host                        │
│                                                          │
│  ┌──────────────┐                                        │
│  │  activate()  │ ← 仅注册声明式 Provider，不执行逻辑      │
│  │   < 50ms     │                                        │
│  └──────┬───────┘                                        │
│         │                                                │
│    onLanguage:arkts (打开 .ets 文件时)                     │
│         │                                                │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Language Svc │  │ Resource Idx │  │  CodeLens    │   │
│  │ (dynamic     │  │ (lazy scan)  │  │  (on-demand) │   │
│  │  import)     │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│    onCommand:harmony.* (用户触发时)                       │
│         │                                                │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Build System │  │ Device Mgr   │  │  Preview     │   │
│  │ (chunk-1)    │  │ (chunk-2)    │  │  (chunk-3)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 代码分割策略

```typescript
// extension.ts — 极简入口，不导入任何重模块
export function activate(context: vscode.ExtensionContext) {
  // Layer 0: 零成本 — 已在 package.json 声明，无需代码

  // Layer 1: 按语言激活 — 动态导入
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('arkts', {
      async provideCompletionItems(doc, pos) {
        const { ArktsCompletionProvider } = await import('./language/completion');
        return ArktsCompletionProvider.provide(doc, pos);
      }
    })
  );

  // Layer 2: 命令触发 — 用户点击时才加载
  context.subscriptions.push(
    vscode.commands.registerCommand('harmony.createProject', async () => {
      const { ProjectWizard } = await import('./project/wizard');
      await new ProjectWizard().run();
    })
  );

  // Layer 3: 完全异步 — 后台预热或首次使用时加载
  // 不在 activate 中注册任何东西
}
```

### 3.3 Bundle 优化

```
┌─────────────────────────────────────────┐
│         esbuild Configuration            │
├─────────────────────────────────────────┤
│ Format:        ESM (tree-shakeable)      │
│ Target:        ES2022 (less polyfill)    │
│ Splitting:     true (code splitting)     │
│ Minify:        true                      │
│ TreeShaking:   true                      │
│ External:      ['vscode'] (not bundled)  │
│ Metafile:      true (size analysis)      │
│                                          │
│ Entry Points:                            │
│   main:     src/extension.ts    (~20KB)  │
│   chunk-1:  src/language/*      (~80KB)  │
│   chunk-2:  src/build/*         (~30KB)  │
│   chunk-3:  src/device/*        (~25KB)  │
│   chunk-4:  src/preview/*       (~40KB)  │
│   chunk-5:  src/debug/*         (~35KB)  │
│                                          │
│ Static Assets:                           │
│   grammars:  syntaxes/          (~15KB)  │
│   schemas:   schemas/           (~20KB)  │
│   snippets:  snippets/          (~8KB)   │
│   icons:     resources/icons/   (~10KB)  │
│   templates: resources/tpl/     (~30KB)  │
│                                          │
│ Total VSIX:              < 400KB         │
└─────────────────────────────────────────┘
```

### 3.4 内存优化策略

| 策略 | 说明 |
|------|------|
| **LRU Cache** | 资源索引、AST 缓存使用 LRU 淘汰，最大 1000 条 |
| **WeakRef** | 对 Document/TextEditor 使用弱引用，避免内存泄漏 |
| **增量更新** | 文件变更时只更新差异部分，不全量重建索引 |
| **Dispose Pattern** | 所有资源严格实现 Disposable，取消订阅/清理定时器 |
| **Worker Offload** | 大文件解析/格式化放到 Worker 线程 |
| **按需扫描** | resources/ 目录仅在需要补全时扫描，扫描结果缓存 |

### 3.5 与竞品性能对比 (目标)

| 指标 | DevEco Studio | ohosvscode/arkTS | **Our Plugin** |
|------|--------------|-----------------|----------------|
| 启动时间 | ~8s (IDE) | ~500ms | **< 50ms** |
| 内存占用 | ~800MB | ~50MB | **< 30MB** |
| 包体积 | ~2GB | ~5MB | **< 500KB** |
| 首次补全延迟 | ~200ms | ~300ms | **< 200ms** |
| 安装后可用 | 需配置 | 即装即用 | **即装即用** |

---

## 4. Technical Architecture — 模块依赖图

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension Host                  │
│                                                              │
│  extension.ts (入口 < 50 行)                                  │
│       │                                                      │
│       ├── Layer 0 (Declarative) ─── package.json             │
│       │    ├── grammars/arkts.tmLanguage.json                │
│       │    ├── snippets/arkts.snippets.json                  │
│       │    ├── schemas/*.schema.json                         │
│       │    └── language-configuration.json                   │
│       │                                                      │
│       ├── Layer 1 (Auto) ─── onLanguage:arkts               │
│       │    ├── language/                                      │
│       │    │    ├── completionProvider.ts    (ArkTS 补全)     │
│       │    │    ├── definitionProvider.ts    (跳转定义)       │
│       │    │    ├── hoverProvider.ts         (悬停文档)       │
│       │    │    ├── codeLensProvider.ts      (组件引用)       │
│       │    │    ├── inlayHintsProvider.ts    (内联提示)       │
│       │    │    └── colorProvider.ts         (颜色装饰)       │
│       │    │                                                  │
│       │    └── resource/                                      │
│       │         ├── resourceIndexer.ts       (资源索引)       │
│       │         ├── resourceCompletion.ts    ($r 补全)        │
│       │         └── resourceDiagnostic.ts    (引用检查)       │
│       │                                                      │
│       ├── Layer 2 (Command) ─── onCommand:harmony.*          │
│       │    ├── project/                                      │
│       │    │    ├── wizard.ts                (创建向导)       │
│       │    │    ├── templates.ts             (模板管理)       │
│       │    │    └── deps.ts                  (依赖管理)       │
│       │    │                                                  │
│       │    ├── build/                                         │
│       │    │    ├── taskProvider.ts           (hvigor 任务)   │
│       │    │    ├── runner.ts                 (构建执行)      │
│       │    │    └── problemMatcher.ts         (错误解析)      │
│       │    │                                                  │
│       │    ├── device/                                        │
│       │    │    ├── hdc.ts                    (HDC 封装)      │
│       │    │    ├── manager.ts                (设备管理)      │
│       │    │    ├── treeView.ts               (设备面板)      │
│       │    │    └── logViewer.ts              (hilog)         │
│       │    │                                                  │
│       │    └── tools/                                         │
│       │         ├── formatter.ts             (代码格式化)     │
│       │         ├── linter.ts                (代码检查)       │
│       │         ├── importOrganizer.ts        (Import 优化)  │
│       │         └── codeActions.ts           (代码操作)       │
│       │                                                      │
│       └── Layer 3 (Async) ─── 首次使用时加载                  │
│            ├── preview/                                       │
│            │    ├── panel.ts                 (预览面板)       │
│            │    └── renderer.ts              (ArkUI→HTML)     │
│            │                                                  │
│            ├── debug/                                         │
│            │    ├── adapter.ts               (DAP 适配)      │
│            │    └── configProvider.ts         (配置生成)      │
│            │                                                  │
│            └── codegen/                                       │
│                 ├── extract.ts               (组件提取)       │
│                 ├── i18n.ts                  (国际化提取)     │
│                 └── converter.ts             (TS→ArkTS)       │
│                                                              │
│  utils/ (共享工具，按需导入)                                   │
│       ├── config.ts          (配置读取)                       │
│       ├── sdkDetector.ts     (SDK 路径检测)                   │
│       ├── cache.ts           (LRU 缓存)                      │
│       ├── fileWatcher.ts     (文件监听)                       │
│       └── logger.ts          (日志输出)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Key Technology Choices (Revised)

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言服务 | **TS Plugin 模式** (非 Volar) | 最轻量，复用已有 TS Server，零额外进程 |
| 语法高亮 | **扩展 TS TextMate Grammar** | 仅增量添加 ArkTS 语法，~15KB |
| 构建/打包 | **esbuild** (非 webpack) | 打包速度 10-100x 快，原生支持 code splitting |
| 格式化 | **Prettier Plugin** (按需加载) | 社区标准，可配置 |
| 测试框架 | **@vscode/test-electron** + **vitest** | 单元测试用 vitest (快)，集成测试用官方框架 |
| 包管理 | **pnpm** | 严格依赖，节省磁盘 |
| 资源解析 | **纯 TS 实现** (非 Rust/WASM) | 对于 JSON5 + 文件扫描，TS 足够快，不需要 WASM 开销 |

### 为什么不用 Volar.js?

| 考量 | Volar.js | TS Plugin 模式 |
|------|---------|---------------|
| 额外依赖 | ~2MB | 0 |
| 额外进程 | 需要 Language Server 进程 | 复用 VS Code 内置 TS Server |
| 功能覆盖 | 适合嵌入式语言 (Vue SFC) | ArkTS 与 TS 差异小，不需要嵌入式语言支持 |
| 启动开销 | ~200ms | ~20ms |

**结论**: ArkTS 本质是 TS 超集，不像 Vue 需要处理 template/script/style 三种语言嵌入。用 TS Plugin 模式足够，且性能更好。

### 为什么不用 WASM?

- 当前场景不涉及 CPU 密集型计算 (如编译器前端)
- JSON5 解析、文件索引用 TS 原生就够快
- WASM 会增加 ~100KB+ 体积 + 额外复杂度
- 如果未来需要 (如格式化器)，再以独立 chunk 方式引入

---

## 6. Activation Events — 精确控制加载时机

```jsonc
{
  "activationEvents": [
    // 仅在打开 .ets 文件时激活 (Layer 1)
    "onLanguage:arkts",

    // 仅在 HarmonyOS 项目中激活 (检测 build-profile.json5)
    "workspaceContains:**/build-profile.json5",

    // Layer 2 & 3: 所有 onCommand 已被 VS Code 自动推断
    // 无需显式声明，commands 在 contributes 中注册即可
  ]
}
```

**关键**: 不使用 `*` (始终激活)，不使用 `onStartupFinished`。

---

## 7. package.json Contributions (Complete)

```jsonc
{
  "name": "harmony-dev-tools",
  "displayName": "HarmonyOS Dev Tools",
  "description": "Lightweight & powerful HarmonyOS development toolkit for VS Code",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Programming Languages", "Snippets", "Linters", "Debuggers"],
  "keywords": ["HarmonyOS", "ArkTS", "ArkUI", "OpenHarmony", "鸿蒙"],

  "activationEvents": [
    "onLanguage:arkts",
    "workspaceContains:**/build-profile.json5"
  ],

  "contributes": {
    "languages": [{
      "id": "arkts",
      "aliases": ["ArkTS", "arkts"],
      "extensions": [".ets"],
      "configuration": "./language-configuration.json",
      "icon": { "light": "./resources/icons/arkts-light.svg", "dark": "./resources/icons/arkts-dark.svg" }
    }],

    "grammars": [{
      "language": "arkts",
      "scopeName": "source.arkts",
      "path": "./syntaxes/arkts.tmLanguage.json",
      "embeddedLanguages": { "meta.embedded.block.typescript": "typescript" }
    }],

    "snippets": [
      { "language": "arkts", "path": "./snippets/arkts.snippets.json" }
    ],

    "jsonValidation": [
      { "fileMatch": "**/build-profile.json5", "url": "./schemas/build-profile.schema.json" },
      { "fileMatch": "**/oh-package.json5", "url": "./schemas/oh-package.schema.json" },
      { "fileMatch": "**/module.json5", "url": "./schemas/module.schema.json" },
      { "fileMatch": "**/AppScope/app.json5", "url": "./schemas/app.schema.json" }
    ],

    "iconThemes": [{
      "id": "arkts-icons",
      "label": "ArkTS File Icons",
      "path": "./resources/icons/icon-theme.json"
    }],

    "commands": [
      { "command": "harmony.createProject", "title": "Create New Project", "category": "HarmonyOS" },
      { "command": "harmony.buildHap", "title": "Build HAP", "category": "HarmonyOS", "icon": "$(play)" },
      { "command": "harmony.runOnDevice", "title": "Run on Device", "category": "HarmonyOS", "icon": "$(debug-start)" },
      { "command": "harmony.clean", "title": "Clean Build", "category": "HarmonyOS" },
      { "command": "harmony.viewDevices", "title": "Refresh Devices", "category": "HarmonyOS", "icon": "$(refresh)" },
      { "command": "harmony.installHap", "title": "Install HAP to Device", "category": "HarmonyOS" },
      { "command": "harmony.viewLogs", "title": "View Device Logs", "category": "HarmonyOS" },
      { "command": "harmony.previewComponent", "title": "Preview Component", "category": "HarmonyOS", "icon": "$(open-preview)" },
      { "command": "harmony.formatDocument", "title": "Format ArkTS File", "category": "HarmonyOS" },
      { "command": "harmony.organizeImports", "title": "Organize Imports", "category": "HarmonyOS" },
      { "command": "harmony.extractComponent", "title": "Extract to @Component", "category": "HarmonyOS" },
      { "command": "harmony.extractBuilder", "title": "Extract to @Builder", "category": "HarmonyOS" },
      { "command": "harmony.extractString", "title": "Extract to $r() Resource", "category": "HarmonyOS" },
      { "command": "harmony.manageDeps", "title": "Manage Dependencies", "category": "HarmonyOS" },
      { "command": "harmony.openDocs", "title": "Search HarmonyOS Docs", "category": "HarmonyOS" }
    ],

    "viewsContainers": {
      "activitybar": [{
        "id": "harmony-explorer",
        "title": "HarmonyOS",
        "icon": "resources/icons/harmony.svg"
      }]
    },

    "views": {
      "harmony-explorer": [
        { "id": "harmony.projectView", "name": "Project", "when": "harmony.isHarmonyProject" },
        { "id": "harmony.deviceView", "name": "Devices", "when": "harmony.isHarmonyProject" },
        { "id": "harmony.resourceView", "name": "Resources", "when": "harmony.isHarmonyProject" }
      ]
    },

    "menus": {
      "editor/context": [
        { "command": "harmony.extractComponent", "when": "editorLangId == arkts", "group": "1_modification" },
        { "command": "harmony.extractBuilder", "when": "editorLangId == arkts", "group": "1_modification" },
        { "command": "harmony.extractString", "when": "editorLangId == arkts", "group": "1_modification" },
        { "command": "harmony.previewComponent", "when": "editorLangId == arkts", "group": "navigation" }
      ],
      "editor/title": [
        { "command": "harmony.buildHap", "when": "harmony.isHarmonyProject", "group": "navigation" },
        { "command": "harmony.runOnDevice", "when": "harmony.isHarmonyProject", "group": "navigation" }
      ],
      "view/title": [
        { "command": "harmony.viewDevices", "when": "view == harmony.deviceView", "group": "navigation" }
      ]
    },

    "configuration": {
      "title": "HarmonyOS Dev Tools",
      "properties": {
        "harmony.sdkPath": {
          "type": "string",
          "default": "",
          "description": "Path to HarmonyOS/OpenHarmony SDK root directory"
        },
        "harmony.hdcPath": {
          "type": "string",
          "default": "",
          "description": "Path to HDC executable (auto-detected if empty)"
        },
        "harmony.autoFormatOnSave": {
          "type": "boolean",
          "default": false,
          "description": "Auto format ArkTS files on save"
        },
        "harmony.enableCodeLens": {
          "type": "boolean",
          "default": true,
          "description": "Show component references and route info as CodeLens"
        },
        "harmony.enableInlayHints": {
          "type": "boolean",
          "default": true,
          "description": "Show inline type hints for ArkUI components"
        },
        "harmony.enableResourceValidation": {
          "type": "boolean",
          "default": true,
          "description": "Validate $r() resource references"
        },
        "harmony.logLevel": {
          "type": "string",
          "enum": ["debug", "info", "warn", "error"],
          "default": "info",
          "description": "Extension log level"
        },
        "harmony.devicePollInterval": {
          "type": "number",
          "default": 5000,
          "minimum": 1000,
          "description": "Device list refresh interval in milliseconds"
        }
      }
    },

    "taskDefinitions": [{
      "type": "hvigor",
      "required": ["task"],
      "properties": {
        "task": { "type": "string", "description": "The hvigor task to run" },
        "module": { "type": "string", "description": "Target module name" }
      }
    }],

    "problemMatchers": [{
      "name": "hvigor",
      "owner": "arkts",
      "fileLocation": ["relative", "${workspaceFolder}"],
      "pattern": {
        "regexp": "^(.+):(\\d+):(\\d+):\\s+(error|warning):\\s+(.+)$",
        "file": 1, "line": 2, "column": 3, "severity": 4, "message": 5
      }
    }],

    "walkthroughs": [{
      "id": "harmony.getStarted",
      "title": "Get Started with HarmonyOS Development",
      "description": "Learn how to develop HarmonyOS apps in VS Code",
      "steps": [
        { "id": "setupSdk", "title": "Configure SDK Path", "description": "Set up your HarmonyOS SDK" },
        { "id": "createProject", "title": "Create Your First Project", "description": "Use the project wizard" },
        { "id": "buildRun", "title": "Build & Run", "description": "Deploy to device or emulator" }
      ]
    }]
  }
}
```

---

## 8. Risk Assessment & Mitigation (Revised)

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|---------|
| ArkTS 语法变更频繁 | 语法高亮/补全失效 | 中 | 语法定义层抽象为数据驱动，快速更新 |
| 缺少官方 LSP | 语言服务精度有限 | 高 | TS Plugin + type defs，与社区共建 |
| HDC 工具不稳定 | 设备管理受限 | 中 | 错误重试 + 超时机制 + 降级提示 |
| SDK 获取困难 | 安装门槛高 | 中 | Walkthrough 引导 + 自动检测 |
| Type Defs 维护成本 | API 更新滞后 | 高 | 脚本自动从 SDK 提取 .d.ts |
| 包体积超标 | 用户体验差 | 低 | CI 中设置体积门禁 (< 500KB) |
| 内存泄漏 | 长时间使用卡顿 | 中 | 严格 Disposable + WeakRef + LRU |

---

## 9. Development Roadmap (Revised)

### v0.1.0 — Foundation (Week 1-2)
- [ ] 项目脚手架 (esbuild + pnpm + TypeScript)
- [ ] ArkTS 语法高亮 (.ets TextMate Grammar)
- [ ] 代码片段 50+ (组件/页面/生命周期/网络/数据)
- [ ] JSON5 Schema 4 套 (build-profile/oh-package/module/app)
- [ ] 文件图标主题
- [ ] 语言配置 (括号/注释/折叠/自动闭合)
- [ ] HarmonyOS 项目检测 + 状态栏

### v0.2.0 — Intelligence (Week 3-4)
- [ ] TS Plugin 模式语言服务
- [ ] ArkTS API 补全 (type definitions 生成)
- [ ] $r() 资源补全 + 跳转 + 验证
- [ ] CodeLens (组件引用/路由)
- [ ] Inlay Hints (类型/数据流)
- [ ] Color Decorator

### v0.3.0 — Toolchain (Week 5-6)
- [ ] hvigor Task Provider + Problem Matcher
- [ ] 项目创建向导 (5 个模板)
- [ ] 设备管理面板 (HDC 集成)
- [ ] hilog 日志查看器
- [ ] 依赖管理可视化

### v0.4.0 — Pro (Week 7-8)
- [ ] 代码格式化 (Prettier Plugin)
- [ ] Lint 规则集成
- [ ] 代码生成 (提取组件/Builder/国际化)
- [ ] ArkUI 预览 (WebView)
- [ ] 调试支持 (DAP)
- [ ] Walkthrough 新手引导

### v1.0.0 — Release
- [ ] 性能基准测试 + 优化
- [ ] 体积审计 (< 500KB)
- [ ] 完整文档
- [ ] Marketplace 发布
- [ ] CI/CD (GitHub Actions)

---

## 10. Competitive Comparison

| 特性 | DevEco Studio | ohosvscode/arkTS | **harmony-dev-tools** |
|------|--------------|-----------------|----------------------|
| 语法高亮 | Full | Full | Full |
| 代码补全 | Full (官方) | Good | Good (TS Plugin) |
| 代码片段 | 少 | 少 | **50+ 丰富模板** |
| $r() 智能 | Full | Good | **Full + 图片预览** |
| CodeLens | No | No | **Yes (引用/路由)** |
| Inlay Hints | No | No | **Yes (类型/数据流)** |
| 颜色预览 | Yes | No | **Yes** |
| JSON5 Schema | Yes | Yes | **Yes + 中英文文档** |
| 构建集成 | Full | Yes (v1.3) | Yes |
| 设备管理 | Full | Yes (v1.3) | Yes |
| UI 预览 | Full | No | **基础预览** |
| 调试 | Full | No | **基础调试** |
| 代码生成 | 少 | No | **Yes (4种)** |
| 格式化 | Yes | Yes (Rust) | Yes (Prettier) |
| Lint | Yes | Yes | Yes |
| 新手引导 | Yes | No | **Yes (Walkthrough)** |
| 启动时间 | ~8s | ~500ms | **< 50ms** |
| 内存占用 | ~800MB | ~50MB | **< 30MB** |
| 包体积 | ~2GB | ~5MB | **< 500KB** |
| 免费/开源 | 免费 | 开源 | **开源** |
| **可扩展性** | 封闭 | 无 | **开放 API + 插件系统** |

---

## 11. Extensibility Architecture — 可扩展性设计

> 核心理念: **Microkernel（微内核）** — 插件自身也是可扩展的平台

### 11.1 整体扩展模型

```
┌──────────────────────────────────────────────────────────────────────┐
│                    harmony-dev-tools (Core)                          │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     Microkernel (微内核)                        │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │  │
│  │  │ EventBus    │  │ Registry     │  │ Extension API       │   │  │
│  │  │ (事件总线)   │  │ (注册中心)    │  │ (对外暴露 API)      │   │  │
│  │  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘   │  │
│  │         │               │                      │              │  │
│  └─────────┼───────────────┼──────────────────────┼──────────────┘  │
│            │               │                      │                  │
│  ┌─────────▼───────────────▼──────────────────────▼──────────────┐  │
│  │                  Internal Modules (内置模块)                    │  │
│  │                                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │  │
│  │  │ Language │ │ Build    │ │ Device   │ │ Resource         │  │  │
│  │  │ Service  │ │ System   │ │ Manager  │ │ Manager          │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              Extension Points (扩展点)                          │  │
│  │                                                                │  │
│  │  ● snippetContributor    — 允许注册自定义代码片段                  │  │
│  │  ● schemaContributor     — 允许注册自定义 JSON Schema             │  │
│  │  ● templateContributor   — 允许注册项目模板                       │  │
│  │  ● lintRuleContributor   — 允许注册自定义 Lint 规则               │  │
│  │  ● deviceAdapter         — 允许适配新的设备连接方式                │  │
│  │  ● buildTaskContributor  — 允许注册自定义构建任务                  │  │
│  │  ● previewRenderer       — 允许注册自定义预览渲染器                │  │
│  │  ● codeActionContributor — 允许注册自定义代码操作                  │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           │  vscode.extensions.getExtension('harmony-dev-tools').exports
                           │
              ┌────────────▼────────────────────────────────────┐
              │          Third-Party Extensions (第三方扩展)       │
              │                                                  │
              │  ┌──────────────┐  ┌─────────────────────────┐   │
              │  │ harmony-     │  │ harmony-                │   │
              │  │ flutter-     │  │ performance-            │   │
              │  │ bridge       │  │ monitor                 │   │
              │  └──────────────┘  └─────────────────────────┘   │
              │                                                  │
              │  ┌──────────────┐  ┌─────────────────────────┐   │
              │  │ harmony-     │  │ harmony-                │   │
              │  │ cloud-       │  │ ai-                     │   │
              │  │ deploy       │  │ assistant               │   │
              │  └──────────────┘  └─────────────────────────┘   │
              └──────────────────────────────────────────────────┘
```

### 11.2 EventBus — 内部事件总线

所有模块之间通过事件解耦，不直接相互引用。新模块只需监听/发射事件即可接入。

```typescript
// src/core/eventBus.ts
import { EventEmitter } from 'vscode';

// ---- 事件类型定义（可扩展的联合类型）----
interface HarmonyEvents {
  // 项目事件
  'project:detected':       { rootPath: string; modules: string[] };
  'project:configChanged':  { file: string; type: string };

  // 构建事件
  'build:started':          { task: string; module?: string };
  'build:completed':        { task: string; success: boolean; duration: number };
  'build:error':            { message: string; file?: string; line?: number };

  // 设备事件
  'device:connected':       { id: string; name: string; type: string };
  'device:disconnected':    { id: string };
  'device:appInstalled':    { deviceId: string; bundleName: string };

  // 资源事件
  'resource:changed':       { type: string; path: string };
  'resource:indexRebuilt':  { count: number };

  // 语言服务事件
  'language:diagnostics':   { file: string; errors: number; warnings: number };
  'language:completion':    { file: string; position: any };

  // 扩展点事件 (第三方可监听)
  'extension:activated':    { id: string };
  'extension:registered':   { point: string; contributor: string };
}

class HarmonyEventBus {
  private emitters = new Map<string, EventEmitter<any>>();

  on<K extends keyof HarmonyEvents>(
    event: K,
    listener: (data: HarmonyEvents[K]) => void
  ): Disposable { /* ... */ }

  emit<K extends keyof HarmonyEvents>(
    event: K,
    data: HarmonyEvents[K]
  ): void { /* ... */ }

  // 支持通配符监听 (如 'build:*')
  onPattern(
    pattern: string,
    listener: (event: string, data: any) => void
  ): Disposable { /* ... */ }
}

export const eventBus = new HarmonyEventBus();
```

**扩展性**: 新增事件类型只需扩展 `HarmonyEvents` interface，编译时类型安全。

### 11.3 Registry — 扩展点注册中心

```typescript
// src/core/registry.ts

// ---- 扩展点接口定义 ----

/** 代码片段贡献者 */
interface SnippetContributor {
  id: string;
  language: string;  // 'arkts' | 'json5' | ...
  snippets: SnippetDefinition[];
}

/** JSON Schema 贡献者 */
interface SchemaContributor {
  id: string;
  filePattern: string;      // e.g. '**/custom-config.json5'
  schema: object | string;  // inline schema or URI
}

/** 项目模板贡献者 */
interface TemplateContributor {
  id: string;
  name: string;
  description: string;
  category: string;            // 'app' | 'module' | 'library'
  generate(targetDir: string, options: Record<string, any>): Promise<void>;
}

/** Lint 规则贡献者 */
interface LintRuleContributor {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  check(document: TextDocument): Diagnostic[];
}

/** 设备适配器 */
interface DeviceAdapter {
  id: string;
  name: string;           // e.g. 'HiSilicon Board', 'QEMU Emulator'
  protocol: string;       // 'hdc' | 'adb' | 'serial' | 'custom'
  discover(): Promise<DeviceInfo[]>;
  install(device: DeviceInfo, hapPath: string): Promise<void>;
  uninstall(device: DeviceInfo, bundleName: string): Promise<void>;
  shell(device: DeviceInfo, command: string): Promise<string>;
}

/** 构建任务贡献者 */
interface BuildTaskContributor {
  id: string;
  taskType: string;
  label: string;
  execute(workspace: string, options: Record<string, any>): Promise<BuildResult>;
}

/** 预览渲染器 */
interface PreviewRenderer {
  id: string;
  name: string;
  supportedComponents: string[];  // ['*'] for all, or specific component names
  render(componentSource: string, context: PreviewContext): Promise<string>;  // returns HTML
}

/** 代码操作贡献者 */
interface CodeActionContributor {
  id: string;
  title: string;
  kind: CodeActionKind;
  applicableWhen(document: TextDocument, range: Range): boolean;
  execute(document: TextDocument, range: Range): Promise<WorkspaceEdit | Command>;
}

// ---- 注册中心 ----

class HarmonyRegistry {
  private contributors = new Map<string, Map<string, any>>();

  /** 注册扩展贡献 */
  register<T>(point: string, contributor: T & { id: string }): Disposable {
    if (!this.contributors.has(point)) {
      this.contributors.set(point, new Map());
    }
    this.contributors.get(point)!.set(contributor.id, contributor);
    eventBus.emit('extension:registered', { point, contributor: contributor.id });

    // 返回 Disposable，允许取消注册
    return { dispose: () => this.contributors.get(point)?.delete(contributor.id) };
  }

  /** 获取某个扩展点的所有贡献 */
  getAll<T>(point: string): T[] {
    return Array.from(this.contributors.get(point)?.values() ?? []);
  }

  /** 获取单个贡献 */
  get<T>(point: string, id: string): T | undefined {
    return this.contributors.get(point)?.get(id);
  }
}

export const registry = new HarmonyRegistry();

// ---- 便捷注册方法 ----
export const ExtensionPoints = {
  SNIPPET:      'harmony.snippets',
  SCHEMA:       'harmony.schemas',
  TEMPLATE:     'harmony.templates',
  LINT_RULE:    'harmony.lintRules',
  DEVICE:       'harmony.devices',
  BUILD_TASK:   'harmony.buildTasks',
  PREVIEW:      'harmony.preview',
  CODE_ACTION:  'harmony.codeActions',
} as const;
```

### 11.4 Extension API — 对外暴露 API

通过 `activate()` 返回值暴露 Public API，其他 VS Code 插件可以通过 `extensionDependencies` 来消费。

```typescript
// src/extension.ts

export function activate(context: vscode.ExtensionContext): HarmonyDevToolsAPI {
  // ... 内部初始化 ...

  // 返回 Public API 供其他插件使用
  return {
    /** API 版本号，用于兼容性检查 */
    apiVersion: 1,

    // ---- 注册扩展 ----
    registerSnippetContributor(contributor: SnippetContributor): Disposable;
    registerSchemaContributor(contributor: SchemaContributor): Disposable;
    registerTemplateContributor(contributor: TemplateContributor): Disposable;
    registerLintRule(rule: LintRuleContributor): Disposable;
    registerDeviceAdapter(adapter: DeviceAdapter): Disposable;
    registerBuildTask(task: BuildTaskContributor): Disposable;
    registerPreviewRenderer(renderer: PreviewRenderer): Disposable;
    registerCodeAction(action: CodeActionContributor): Disposable;

    // ---- 查询能力 ----
    getProjectInfo(): ProjectInfo | undefined;
    getDevices(): Promise<DeviceInfo[]>;
    getResourceIndex(): ResourceIndex;

    // ---- 事件订阅 ----
    onBuildStarted: Event<BuildEvent>;
    onBuildCompleted: Event<BuildEvent>;
    onDeviceChanged: Event<DeviceEvent>;
    onProjectDetected: Event<ProjectInfo>;

    // ---- 命令执行 ----
    buildHap(module?: string): Promise<BuildResult>;
    installHap(deviceId: string, hapPath: string): Promise<void>;
    runOnDevice(deviceId: string): Promise<void>;
  };
}

// ---- 类型定义单独发 npm 包 ----
// @harmony-dev-tools/api — 其他插件只需安装类型包
```

**第三方插件使用示例**:

```typescript
// 另一个 VS Code 插件中
import type { HarmonyDevToolsAPI } from '@harmony-dev-tools/api';

export async function activate(context: vscode.ExtensionContext) {
  const harmonyExt = vscode.extensions.getExtension<HarmonyDevToolsAPI>('publisher.harmony-dev-tools');
  if (!harmonyExt) return;

  const api = harmonyExt.isActive ? harmonyExt.exports : await harmonyExt.activate();

  // 注册自定义项目模板
  api.registerTemplateContributor({
    id: 'my-ecommerce-template',
    name: 'E-Commerce App',
    description: 'Full-featured shopping app template',
    category: 'app',
    async generate(targetDir, options) {
      // 生成项目文件...
    }
  });

  // 监听构建事件
  api.onBuildCompleted(event => {
    if (event.success) {
      // 自动部署到云端...
    }
  });
}
```

### 11.5 Configuration-Driven — 配置驱动扩展

很多行为通过配置文件外置，无需改代码即可扩展。

```
harmonyPlugins/
├── config/
│   ├── decorators.json          # ArkTS 装饰器定义 (可热更新)
│   ├── components.json          # ArkUI 组件元数据 (属性/事件/枚举)
│   ├── lint-rules.json          # Lint 规则集 (可覆盖/追加)
│   └── api-versions/            # 按 API 版本隔离的 type defs
│       ├── api12/
│       ├── api13/
│       └── api14/               # 新 API 只需加目录
```

```jsonc
// config/decorators.json — 数据驱动，新增装饰器无需改代码
{
  "decorators": [
    {
      "name": "@Component",
      "target": "struct",
      "description": "Declares a custom component",
      "params": [],
      "category": "component"
    },
    {
      "name": "@State",
      "target": "property",
      "description": "Declares component-level reactive state",
      "params": [],
      "category": "state",
      "dataFlow": "local",
      "inlayHint": "state"
    },
    {
      "name": "@Prop",
      "target": "property",
      "description": "One-way data binding from parent",
      "params": [],
      "category": "state",
      "dataFlow": "← parent",
      "inlayHint": "← parent"
    }
    // ... 新增装饰器只需在此追加 JSON，零代码修改
  ]
}
```

```jsonc
// config/components.json — ArkUI 组件元数据
{
  "components": {
    "Text": {
      "description": "Text display component",
      "params": [{ "name": "content", "type": "string | Resource" }],
      "attributes": [
        { "name": "fontSize", "type": "number | string | Resource", "default": "16fp" },
        { "name": "fontColor", "type": "ResourceColor", "default": "#000000" },
        { "name": "fontWeight", "type": "FontWeight | number | string", "enum": ["Lighter", "Normal", "Regular", "Medium", "Bold", "Bolder"] }
      ],
      "events": [
        { "name": "onClick", "params": "(event: ClickEvent) => void" }
      ],
      "snippet": "Text($1)\n  .fontSize($2)\n  .fontColor($3)"
    }
    // ... 新增组件只需在此追加
  }
}
```

### 11.6 Module Interface Contract — 模块接口契约

每个内部模块实现统一的生命周期接口，便于热插拔：

```typescript
// src/core/module.ts

interface HarmonyModule {
  /** 模块唯一标识 */
  readonly id: string;

  /** 模块依赖 (其他模块 ID) */
  readonly dependencies?: string[];

  /** 激活模块 (延迟调用，首次需要时) */
  activate(context: ModuleContext): Promise<void>;

  /** 停用模块 (清理资源) */
  deactivate(): Promise<void>;

  /** 模块是否已激活 */
  readonly isActive: boolean;
}

interface ModuleContext {
  /** 插件上下文 */
  extensionContext: vscode.ExtensionContext;
  /** 事件总线 */
  eventBus: HarmonyEventBus;
  /** 注册中心 */
  registry: HarmonyRegistry;
  /** 日志器 */
  logger: Logger;
  /** 配置读取 */
  config: ConfigReader;
}

// ---- 模块管理器 ----
class ModuleManager {
  private modules = new Map<string, HarmonyModule>();
  private activated = new Set<string>();

  register(module: HarmonyModule): void { /* ... */ }

  /** 按需激活，自动处理依赖顺序 */
  async activate(moduleId: string): Promise<void> {
    if (this.activated.has(moduleId)) return;
    const mod = this.modules.get(moduleId);
    if (!mod) throw new Error(`Module ${moduleId} not found`);

    // 先激活依赖
    for (const dep of mod.dependencies ?? []) {
      await this.activate(dep);
    }

    await mod.activate(this.createContext());
    this.activated.add(moduleId);
  }

  /** 安全停用，反向依赖顺序 */
  async deactivateAll(): Promise<void> { /* ... */ }
}
```

**示例 — 添加一个全新模块无需修改现有代码**:

```typescript
// src/modules/performance/index.ts — 假设未来新增性能分析模块

export class PerformanceModule implements HarmonyModule {
  readonly id = 'harmony.performance';
  readonly dependencies = ['harmony.device'];  // 依赖设备模块
  isActive = false;

  async activate(ctx: ModuleContext): Promise<void> {
    // 监听设备连接事件
    ctx.eventBus.on('device:connected', async (device) => {
      // 自动开始性能采集...
    });

    // 注册命令
    vscode.commands.registerCommand('harmony.profileCPU', () => { /* ... */ });

    this.isActive = true;
  }

  async deactivate(): Promise<void> {
    this.isActive = false;
  }
}

// 在 extension.ts 中只需一行:
// moduleManager.register(new PerformanceModule());
```

### 11.7 Type Definition Versioning — API 版本管理

```typescript
// src/core/apiVersion.ts

/** 支持多 API 版本的 type defs 管理 */
class ApiVersionManager {
  private versions = new Map<number, string>();  // version → defs path

  /** 注册新 API 版本的 type definitions */
  register(version: number, defsPath: string): void {
    this.versions.set(version, defsPath);
  }

  /** 根据项目 build-profile.json5 中的 compileSdkVersion 选择对应 defs */
  getDefsForProject(projectRoot: string): string {
    const version = this.detectApiVersion(projectRoot);
    return this.versions.get(version) ?? this.versions.get(this.latestVersion)!;
  }

  /** 第三方可注册自定义 API 版本 (如 OpenHarmony 分支) */
  registerCustomApi(name: string, version: number, defsPath: string): Disposable {
    // ...
  }
}
```

### 11.8 Future Expansion Roadmap — 未来扩展路线

```
                          v0.x (Current)
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                    ▼          ▼          ▼
              ArkTS 语言    构建工具    设备管理
              服务         集成
                    │          │          │
                    └──────────┼──────────┘
                               │
                          v1.x (扩展)
                               │
          ┌────────┬───────────┼───────────┬────────┐
          │        │           │           │        │
          ▼        ▼           ▼           ▼        ▼
     Cloud      Multi-     Performance   AI       Cross-
     Deploy     Platform   Profiler      Code     Platform
     (云部署)   (多端适配)  (性能分析)    Assist   (跨平台)
                                        (AI辅助)
          │        │           │           │        │
          └────────┴───────────┼───────────┴────────┘
                               │
                          v2.x (生态)
                               │
     ┌──────────┬──────────────┼──────────────┬──────────┐
     │          │              │              │          │
     ▼          ▼              ▼              ▼          ▼
  Plugin     Theme         Component      Test       CI/CD
  Market     Designer      Library        Runner     Pipeline
  (插件市场)  (主题设计器)   (组件库浏览)   (测试运行)  (持续集成)
```

| 阶段 | 扩展方向 | 通过哪个扩展点接入 |
|------|---------|-----------------|
| v1.1 | **Cloud Deploy** — 华为云 AppGallery 一键发布 | `BuildTaskContributor` |
| v1.2 | **Multi-Platform** — Phone/Tablet/Watch/TV 多端预览 | `PreviewRenderer` |
| v1.3 | **Performance** — CPU/Memory/FPS 实时监控面板 | `HarmonyModule` + `DeviceAdapter` |
| v1.4 | **AI Assistant** — ArkTS 代码建议/错误修复/注释生成 | `CodeActionContributor` |
| v1.5 | **Cross-Platform** — 与 React Native/Flutter 互操作 | `DeviceAdapter` + `BuildTaskContributor` |
| v2.0 | **Plugin Marketplace** — 社区插件共享平台 | `Registry` + npm |
| v2.1 | **Theme Designer** — 可视化主题配置 | `PreviewRenderer` |
| v2.2 | **Component Library** — ArkUI 组件库浏览器 | `SnippetContributor` + `PreviewRenderer` |
| v2.3 | **Test Runner** — 单元测试/UI 测试集成 | `BuildTaskContributor` |
| v2.4 | **CI/CD** — GitHub Actions/GitLab CI 配置生成 | `TemplateContributor` |

### 11.9 Backward Compatibility Strategy — 向后兼容策略

```typescript
// API 版本化，保证不破坏现有消费者

export interface HarmonyDevToolsAPI {
  /** 始终递增的版本号，消费者可检查 */
  readonly apiVersion: number;  // 1, 2, 3...

  // v1 API — 永远保留
  registerSnippetContributor(contributor: SnippetContributor): Disposable;
  registerDeviceAdapter(adapter: DeviceAdapter): Disposable;
  // ...

  // v2 API — 新增，不影响 v1
  // registerTestRunner?(runner: TestRunner): Disposable;  // 可选方法
}

// 消费者侧兼容检查:
const api = harmonyExt.exports;
if (api.apiVersion >= 2 && api.registerTestRunner) {
  api.registerTestRunner(myTestRunner);
}
```

**原则**:
- API 只增不删，废弃的方法标记 `@deprecated` 但保留至少 2 个大版本
- 新增方法用可选属性 (`?`)，不破坏旧类型
- 每个大版本发布独立的 `@harmony-dev-tools/api` 类型包
- Extension Points 的 interface 只增字段（新字段设为 optional）

### 11.10 Summary — 可扩展性设计总结

| 扩展维度 | 机制 | 谁来扩展 | 需改代码吗 |
|---------|------|---------|-----------|
| 新装饰器支持 | `config/decorators.json` | 维护者 | 否，改 JSON |
| 新组件支持 | `config/components.json` | 维护者 | 否，改 JSON |
| 新 API 版本 | `config/api-versions/` 目录 | 维护者 | 否，加目录 |
| 新 Lint 规则 | `LintRuleContributor` | 第三方插件 | 否，调 API |
| 新项目模板 | `TemplateContributor` | 第三方插件 | 否，调 API |
| 新设备类型 | `DeviceAdapter` | 第三方插件 | 否，调 API |
| 新构建任务 | `BuildTaskContributor` | 第三方插件 | 否，调 API |
| 新预览方式 | `PreviewRenderer` | 第三方插件 | 否，调 API |
| 新代码操作 | `CodeActionContributor` | 第三方插件 | 否，调 API |
| 全新功能模块 | `HarmonyModule` 接口 | 核心团队 | 加一个文件 |
| 模块间通信 | `EventBus` | 任何模块 | 否，监听事件 |
| 外部插件集成 | `Extension API exports` | 任何 VS Code 插件 | 否，调 API |
