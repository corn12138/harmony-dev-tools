# HarmonyOS Dev Tools — 项目总结 / Project Summary

## 详细文档 / Documentation Index

| 文档 / Document | 内容 / Content |
|----------------|---------------|
| [docs/设计理念.md](docs/设计理念.md) | 项目背景、设计目标、核心决策、技术取舍 |
| [docs/架构设计.md](docs/架构设计.md) | 整体架构图、微内核详解、模块详解、数据流、时序图 |
| [docs/开发指南.md](docs/开发指南.md) | 环境搭建、开发工作流、添加新功能、代码规范 |
| [docs/部署发布.md](docs/部署发布.md) | 打包流程、发布到 Marketplace、GitHub 推送、完整发版流程 |
| [docs/错误排查.md](docs/错误排查.md) | 13 个常见错误的原因和解决方案、快速诊断流程图 |
| [docs/扩展规划.md](docs/扩展规划.md) | 短期/中期/长期规划、8 个扩展点使用指南、贡献指南 |
| [docs/操作手册.md](docs/操作手册.md) | 全部 23 个命令操作指南、V2 迁移、API 兼容性检查 |
| [docs/2026-03-对齐结论.md](docs/2026-03-对齐结论.md) | 2026-03 社区痛点、官方文档信号、已落地调整 |

---

## 项目信息 / Project Info

| 项目 / Item | 详情 / Details |
|-------------|---------------|
| 名称 / Name | HarmonyOS Dev Tools |
| 版本 / Version | 0.2.1 |
| 包大小 / Package Size | ~130 KB |
| GitHub | https://github.com/corn12138/harmony-dev-tools |
| Marketplace Publisher | corn12138 |
| 许可证 / License | MIT |

---

## 一、遇到的错误及解决方案 / Errors & Solutions

### 1. `zsh: command not found: hvigorw`

- **原因 / Cause**：`hvigorw` 是鸿蒙项目根目录下的本地脚本，不是全局命令。hvigorw is a local project script, not a global command.
- **解决 / Solution**：`hvigorw` → `./hvigorw`，使用相对路径执行。Use relative path to execute.
- **涉及文件 / Files**：`src/build/runner.ts`, `src/build/buildAndRun.ts`, `src/build/terminalRunner.ts`

### 2. `SyntaxError: Invalid or unexpected token`

- **原因 / Cause**：`hvigorw` 是 shell 脚本（以 `#` 开头），不是 Node.js 文件，不能用 `node` 执行。hvigorw is a shell script (starts with `#`), not a Node.js file.
- **解决 / Solution**：去掉 `node` 前缀，直接执行 `./hvigorw`。Remove `node` prefix.

### 3. `zsh: permission denied: ./hvigorw`

- **原因 / Cause**：脚本没有可执行权限。The script lacks execute permission.
- **解决 / Solution**：在构建命令前加 `chmod +x ./hvigorw 2>/dev/null;`。Prepend chmod before build command.
- **涉及文件 / Files**：`src/build/terminalRunner.ts`

### 4. ArkTS 编译 85 个错误 / 85 ArkTS Compilation Errors

- **原因 / Cause**：用户项目代码本身的编译错误，不是插件问题。Errors in user's project code, not the plugin.
- **结论 / Conclusion**：插件功能正常，成功调起了 hvigorw 构建流程。Plugin works correctly — it successfully invoked the hvigorw build process.

### 5. Azure DevOps 无法访问 PAT / Cannot Access PAT

- **原因 / Cause**：`dev.azure.com` 重定向到 `portal.azure.com`（Azure 门户），且未创建 DevOps 组织。Redirected to Azure Portal, DevOps organization not created.
- **解决 / Solution**：通过 `https://aex.dev.azure.com` 进入，先创建组织。最终选择网页上传 VSIX 方式发布。Access via `aex.dev.azure.com`, create org first. Eventually chose web upload method.

---

## 二、项目架构 / Project Architecture

```
harmonyPlugins/
├── src/                        # TypeScript 源码 / Source code
│   ├── extension.ts            # 入口，4 层懒加载注册 / Entry, 4-layer lazy loading
│   ├── core/                   # 微内核 / Microkernel
│   │   ├── eventBus.ts         #   事件总线 / EventBus
│   │   ├── registry.ts         #   注册表 / Service Registry
│   │   ├── module.ts           #   模块管理 / Module Manager
│   │   └── api.ts              #   公共 API / Public API
│   ├── build/                  # 构建运行 / Build & Run
│   │   ├── terminalRunner.ts   #   终端构建运行 / Terminal build & run
│   │   ├── buildAndRun.ts      #   后台构建运行 / Background build & run
│   │   ├── runner.ts           #   HAP 安装运行 / HAP install & run
│   │   └── taskProvider.ts     #   VS Code Task / Task provider
│   ├── debug/                  # 调试 / Debug
│   │   ├── debugProvider.ts    #   调试适配器 / Debug adapter (CDP)
│   │   ├── inspectorPanel.ts   #   UI 检查器 / UI Inspector WebView
│   │   └── uiInspector.ts      #   组件树解析 / Component tree parser
│   ├── device/                 # 设备管理 / Device Management
│   │   ├── manager.ts          #   HDC 设备管理 / HDC device manager
│   │   ├── treeView.ts         #   设备树视图 / Device TreeView
│   │   └── logViewer.ts        #   日志查看器 / Log viewer (hilog)
│   ├── language/               # 语言支持 / Language Support
│   │   ├── completionProvider.ts  # 自动补全 / Auto-completion
│   │   ├── hoverProvider.ts       # 悬浮文档 / Hover documentation
│   │   ├── codeLensProvider.ts    # CodeLens
│   │   └── colorProvider.ts       # 颜色预览 / Color preview
│   ├── resource/               # 资源管理 / Resource Management
│   │   ├── resourceCompletion.ts  # $r() 补全 / $r() completion
│   │   ├── resourceDefinition.ts  # $r() 跳转 / $r() go-to-definition
│   │   └── resourceIndexer.ts     # 资源索引 / Resource indexer
│   ├── project/                # 项目工具 / Project Tools
│   │   ├── wizard.ts           #   创建向导 / Creation wizard
│   │   ├── templates.ts        #   4 种模板 / 4 templates
│   │   ├── deps.ts             #   依赖管理 / Dependency management
│   │   └── projectDetector.ts  #   项目检测 / Project detection
│   ├── preview/                # 组件预览 / Component Preview
│   │   └── panel.ts            #   预览面板 / Preview panel
│   ├── tools/                  # 代码工具 / Code Tools
│   │   ├── codeActions.ts      #   代码操作 / Code actions
│   │   ├── formatter.ts        #   格式化 / Formatter
│   │   ├── importOrganizer.ts  #   导入整理 / Import organizer
│   │   └── docsSearch.ts       #   文档搜索 / Docs search
│   └── utils/                  # 工具类 / Utilities
│       ├── constants.ts        #   常量定义 / Constants
│       ├── config.ts           #   配置管理 / Config management
│       └── logger.ts           #   日志管理 / Logger
├── package.json                # 扩展清单 / Extension manifest
├── tsconfig.json               # TypeScript 配置
├── syntaxes/arkts.tmLanguage.json  # TextMate 语法 / Grammar
├── snippets/arkts.snippets.json    # 40+ 代码片段 / Snippets
├── schemas/                    # JSON Schema 校验文件
├── resources/icons/            # 图标资源 / Icon assets
├── README.md                   # 中英文文档 / Bilingual docs
├── CHANGELOG.md                # 版本记录 / Changelog
├── LICENSE                     # MIT 许可证
├── .gitignore                  # Git 忽略规则
└── .vscodeignore               # VSIX 打包忽略规则
```

### 微内核架构 / Microkernel Architecture

```
┌─────────────────────────────────────────────────┐
│                  extension.ts                    │
│            4-layer lazy loading                  │
├─────────────────────────────────────────────────┤
│  Layer 0 (立即)     │ EventBus, Registry, Logger │
│  Layer 1 (立即)     │ Language, Resource, Schema  │
│  Layer 1.5 (立即)   │ Debug Provider              │
│  Layer 2 (延迟 2s)  │ Device, Task Provider       │
│  Layer 3 (按需)     │ Build, Preview, Tools       │
├─────────────────────────────────────────────────┤
│              Core (微内核)                       │
│  EventBus ←→ Registry ←→ ModuleManager          │
└─────────────────────────────────────────────────┘
```

---

## 三、构建流程 / Build Process

### 1. 安装依赖 / Install Dependencies

```bash
pnpm install
```

### 2. 开发模式 / Development

```bash
# 监听文件变化，自动编译 / Watch mode
pnpm run watch

# VS Code 中按 F5 启动调试 / Press F5 in VS Code to debug
# 会打开 Extension Development Host 窗口
```

### 3. 生产构建 / Production Build

```bash
# esbuild 打包，输出 ~73KB / Bundle with esbuild
pnpm run build
```

### 4. 打包 VSIX / Package VSIX

```bash
npx @vscode/vsce package --no-dependencies
# 输出 / Output: harmony-dev-tools-x.x.x.vsix
```

---

## 四、发布到 Marketplace / Publish to Marketplace

### 方式一：网页上传（推荐）/ Web Upload (Recommended)

```
1. 打开 https://marketplace.visualstudio.com/manage
   Open Marketplace management page

2. 登录微软账号
   Sign in with Microsoft account

3. 如果没有 Publisher，先创建：
   If no Publisher exists, create one:
   → Create publisher
   → Name: 显示名称 (display name)
   → ID: 唯一标识，需与 package.json 中 "publisher" 字段一致
        Unique ID, must match "publisher" field in package.json

4. 首次发布 / First publish:
   → + New extension → Visual Studio Code
   → 上传 .vsix 文件 / Upload .vsix file
   → 等待验证 Verifying → 通过后自动上线

5. 更新版本 / Update version:
   → 修改 package.json 中 "version" 字段 (必须递增)
   → 更新 CHANGELOG.md
   → 重新打包: npx @vscode/vsce package --no-dependencies
   → Marketplace 管理页 → 插件旁 ... → Update → 上传新 VSIX
```

### 方式二：命令行发布 / CLI Publish

```
1. 创建 Azure DevOps 组织 / Create Azure DevOps Organization:
   → 打开 https://aex.dev.azure.com
   → 登录并创建组织

2. 创建 Personal Access Token (PAT):
   → User settings → Personal access tokens → + New Token
   → Name: vsce
   → Organization: All accessible organizations
   → Expiration: 365 days
   → Scopes: Show all scopes → Marketplace → Manage
   → Create → 立刻复制 Token（只显示一次！）
     Copy token immediately (shown only once!)

3. 登录并发布 / Login & publish:
   npx @vscode/vsce login corn12138
   # 输入 PAT / Enter PAT when prompted
   npx @vscode/vsce publish

   # 或一步完成 / Or in one step:
   npx @vscode/vsce publish --pat <YOUR_TOKEN>
```

---

## 五、推送到 GitHub / Push to GitHub

```bash
# 1. 在 GitHub 上创建仓库（不勾选 README/LICENSE/.gitignore）
#    Create repo on GitHub (don't add README/LICENSE/.gitignore)

# 2. 初始化本地仓库 / Initialize local repo
git init
git branch -m main

# 3. 添加远程仓库 / Add remote
git remote add origin https://github.com/<username>/<repo>.git

# 4. 提交并推送 / Commit & push
git add -A
git commit -m "feat: initial release of HarmonyOS Dev Tools v0.1.0"
git push -u origin main
```

---

## 六、关键配置说明 / Key Configuration

### package.json 核心字段 / Core Fields

| 字段 / Field | 作用 / Purpose |
|-------------|---------------|
| `publisher` | 必须与 Marketplace Publisher ID 一致 / Must match Marketplace Publisher ID |
| `version` | 每次发布必须递增 / Must increment on each publish |
| `engines.vscode` | 最低支持的 VS Code 版本 / Minimum VS Code version |
| `activationEvents` | 插件激活条件 / Extension activation triggers |
| `contributes.commands` | 注册的 21 个命令 / 21 registered commands |
| `contributes.debuggers` | 调试器配置 type: `harmonyos` / Debugger config |

### .vscodeignore — VSIX 打包排除 / Package Exclusion

```
src/           # 源码不打包，只打包 dist/ / Source excluded, only dist/ included
node_modules/  # 依赖不打包（--no-dependencies）/ Dependencies excluded
*.vsix         # 已有包不打包 / Existing packages excluded
.vscode/       # IDE 配置不打包 / IDE config excluded
```

### .gitignore — Git 忽略 / Git Exclusion

```
node_modules/  # 依赖目录 / Dependencies
dist/          # 构建输出 / Build output
*.vsix         # 打包文件 / Package files
```

---

## 七、用户安装使用 / User Installation & Usage

```
1. VS Code 中搜索 "HarmonyOS Dev Tools" 安装
   Search "HarmonyOS Dev Tools" in VS Code Extensions

2. 打开鸿蒙项目（含 build-profile.json5）
   Open a HarmonyOS project (must contain build-profile.json5)

3. 插件自动激活，状态栏显示 "HarmonyOS"
   Extension activates automatically, status bar shows "HarmonyOS"

4. Cmd+Shift+P → 输入 "HarmonyOS" 查看所有 21 个命令
   Cmd+Shift+P → Type "HarmonyOS" to see all 21 commands

5. 连接设备 → Build & Run (Terminal) 一键构建运行
   Connect device → Build & Run (Terminal) for one-click build & run
```

### 核心工作流 / Core Workflows

```
构建运行 / Build & Run:
  Cmd+Shift+P → HarmonyOS: Build & Run (Terminal)
  → chmod +x ./hvigorw
  → ./hvigorw assembleHap --no-daemon
  → 查找 .hap 文件 / Find .hap file
  → hdc install -r xxx.hap
  → hdc shell aa start -a EntryAbility -b com.example.app

调试 / Debug:
  Cmd+Shift+P → HarmonyOS: Debug App on Device
  → hdc fport tcp:9230 tcp:9230
  → hdc shell aa start -D -a EntryAbility -b com.example.app
  → 通过 CDP 协议连接调试器 / Attach debugger via CDP

UI 检查 / UI Inspect:
  Cmd+Shift+P → HarmonyOS: Open UI Inspector
  → 设备截图 + 组件树 + 属性面板
  → Device screenshot + Component tree + Property panel
  → 支持 Live 模式每 2 秒自动刷新
  → Live mode auto-refresh every 2 seconds
```
