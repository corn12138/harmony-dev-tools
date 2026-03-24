# Changelog

## [Unreleased]

## [0.7.0] - 2026-03-24

> Summary: HarmonyOS 6 ecosystem alignment, Cangjie language support, and comprehensive stress testing.
> 摘要：对齐 HarmonyOS 6 生态、新增仓颉语言支持、全覆盖极限压测。

### Added
- **Cangjie (仓颉) Language Support**:
  - TextMate grammar for `.cj` files with syntax highlighting for 60+ keywords, built-in types, annotations, string interpolation, and nested block comments
  - Language configuration with bracket matching, auto-closing pairs, comment toggling, and indentation rules
  - 17 code snippets: `main`, `func`, `class`, `struct`, `enum`, `interface`, `match`, `let`, `var`, `spawn`, `for`, `while`, `trycatch`, `import`, `println`, `extend`, `prop`
- **HarmonyOS 6 (API 20) Metadata**:
  - 9 new components: `Repeat`, `RepeatItem`, `UIExtensionComponent`, `EmbeddedUIExtensionComponent`, `FoldSplitContainer`, `MediaCachedImage`, `ScrollBar`, `ExpandableTitle`
  - `@Track` decorator for V1 fine-grained state tracking (API 12+)
- **Page-Level Scaffolding Snippets**:
  - `listpage` — full list page with Navigation + Refresh + ForEach
  - `detailpage` — detail page with NavDestination + Scroll layout
  - `loginpage` — login page with form, validation, and submit logic
  - `emptystate` — empty state placeholder component
  - `fileio` — sandbox-safe file I/O using Core File Kit
  - `navdest` — NavDestination route target
  - `symbolglyph`, `mediacachedimg`, `foldsplit`, `track` — HarmonyOS 6 component snippets
- **Diagnostic Rules**:
  - `DEPRECATED_ROUTER`: detects `import router from '@ohos.router'` and all `router.*()` calls, suggests Navigation + NavPathStack migration
  - `SANDBOX_HARDCODED_PATH`: detects hardcoded `/data/storage/`, `/data/el1/`, `/data/el2/`, `/storage/` paths, suggests `getContext().filesDir`
  - Quick Fix for both rules: one-click open official HarmonyOS documentation
- **172 New Stress Tests** (total 821):
  - `stressBoundary.test.ts` (131 tests): diagnostic boundary (empty files, 10K lines, Unicode), router/sandbox path exhaustive coverage, metadata API boundary, snippet integrity, Cangjie grammar/config validation
  - `stressExtended.test.ts` (41 tests): CodeFix diagnostic details, completion provider new entries, ArkTS grammar, cross-cutting multi-rule combinations, 10K-line performance benchmark, metadata caching, snippet isolation, Cangjie regex robustness

### Changed
- Component metadata expanded from 90 to 99 entries (API 12–20 coverage)
- Snippet count increased from 70+ to 80+ (ArkTS) + 17 (Cangjie)
- ROADMAP updated to reflect completed v0.7.0 objectives

## [0.6.15] - 2026-03-21
- Fixed a critical bug in project config diagnostics where `return` was used instead of `continue`, causing all remaining workspace folders' diagnostics to be silently discarded when one snapshot was stale.
- Added circular-dependency detection in `ModuleManager.activate()` to prevent infinite recursion and stack overflow when modules reference each other.
- Fixed a process-reference race condition in the log viewer where a rapidly restarted `hilog` stream could orphan the old process and lose the reference to the new one.
- Hardened `quoteShellArg` on Windows to escape `%`, `^`, `&`, `|`, `<`, `>`, `!` and `"` characters, closing a command-injection vector in shell argument quoting.
- Shell-escaped `bundleName` and `abilityName` parameters in `aa start` commands across `manager.ts`, `buildAndRun.ts`, and `terminalRunner.ts` to prevent command injection from malformed project metadata.
- Fixed `emulatorManager` process-singleton overwrite by killing any running emulator before spawning a new one, and added early exit on user cancellation or unexpected process crash.
- Rewrote `EventBus.onPattern()` to capture events from emitters created after the pattern subscription, fixing a functional gap where wildcard listeners missed future event channels.
- Fixed `colorProvider` hex-color regex to strictly match 6 or 8 hex digits, preventing silent misparse of 7-digit hex values; added word-boundary checks for named colors like `Color.Grey` to avoid false matches on `Color.Greyish`.
- Fixed `codeLensProvider` column-number calculations to use raw (untrimmed) lines, so `Find References` and `@Builder` usage lenses now jump to the correct column; relaxed `@Component` / `@Entry` regex to match decorator-with-parameters syntax.
- Fixed a memory leak in `Logger` where the `onDidChangeConfiguration` listener was never disposed; added runtime validation so an invalid `logLevel` setting falls back to `'info'` instead of silently dropping all log output.
- Added `dispose()` to the public API object so the internal `deviceChangedEmitter` and its two event subscriptions are properly cleaned up on extension deactivation.
- Wrapped `takeDeviceScreenshot` and `mirrorPanel` message handlers in `try/catch` to prevent unhandled promise rejections from crashing the extension when a device disconnects mid-operation.
- Reset the `ResourceIndexer` singleton reference on `dispose()`, so a subsequent `getResourceIndexer()` call returns a fresh, functional instance instead of a stale one with dead file watchers.
- Rewrote `extractBuildBlocks` (diagnosticProvider) and `extractBlock` (perfLens) to track string literals, line comments, and block comments when counting braces, preventing `Text("{")` patterns from breaking build-block boundary detection.
- Added block-comment state tracking in `checkStrictTypes` so multi-line `/* */` comments containing `: any` or `ForEach` no longer trigger false diagnostics.
- Added `response.on('error', reject)` to the WebView targets HTTP helper to prevent unhandled stream errors when a connection drops mid-transfer.
- Added 49 new test cases across 3 new test files (`core.test.ts`, `shellAndLogger.test.ts`, `colorAndCodeLens.test.ts`) covering EventBus pattern matching, ModuleManager circular dependencies, Registry lifecycle, shell quoting on both platforms, Logger level filtering, hex/named color parsing, and CodeLens column accuracy.

## [0.6.14] - 2026-03-20
- Removed the static `setWebDebuggingAccess(true)` hard gate from the WebView DevTools command, so valid running targets can still be discovered through runtime ArkWeb sockets even when code scanning misses the enablement call.
- Narrowed `WithTheme({ colorMode: ... })` dark-resource diagnostics to skip light-only overrides, eliminating a false warning for valid `ThemeColorMode.LIGHT` usage.
- Recomputed tracked ArkTS dark-theme diagnostics after `dark.json` or `resources/dark/...` changes, so stale Problems entries now clear across all affected files instead of only the active editor.
- Added regression coverage for the runtime WebView DevTools fallback path, light-only `WithTheme` color modes, and workspace-wide dark-resource diagnostic refresh.

## [0.6.13] - 2026-03-20
- Hardened direct ArkWeb page opening against malformed `devtoolsFrontendUrl` and `webSocketDebuggerUrl` payloads, so bad DevTools target data no longer breaks the one-click inspect flow.
- Rewrote absolute DevTools frontend URLs back to the current USB or wireless endpoint host before opening them, preventing direct-open actions from jumping to stale or unreachable hosts.
- Normalized IPv6 addresses with zone suffixes such as `%wlan0` during wireless device-address discovery, fixing a parsing edge case that could misread the interface and drop the prefix length.
- Expanded WebView regression coverage with long multiline `Web({ ... src: ... })` blocks, malformed target payloads, title-only false positives, exact-vs-parent route preference, and IPv6 zone-suffix parsing.

## [0.6.12] - 2026-03-19
- Added project-aware ArkWeb DevTools page picking by extracting URL hints from `Web({ src: ... })` and `loadUrl(...)` calls in ArkTS files, so the extension can open the most likely page directly instead of making the user guess.
- Prioritized URL hints from the currently focused ArkTS file, making one-click WebView inspection more likely to land on the page the developer is actively editing.
- Tightened automatic page opening so same-host targets no longer auto-open on hostname-only matches; ambiguous cases now fall back to the explicit page picker for safer multi-page behavior.
- Added regression coverage for URL-hint extraction, nested route matching, and hostname-only non-matches in the WebView target selector.

## [0.6.11] - 2026-03-19
- Added DevTools target discovery on top of the existing WebView one-click workflow, so the extension now queries the inspectable page list after USB forwarding or wireless endpoint detection.
- When only one meaningful ArkWeb page is found, the extension can open that detected page directly; when multiple pages are found, it now offers an explicit page picker instead of forcing the user to guess inside Chrome inspect.
- Added frontend-URL host rewriting and direct tests for `devtoolsFrontendUrl` parsing, so forwarded USB endpoints and wireless IPv4/IPv6 endpoints resolve to the correct current host instead of stale target hosts.

## [0.6.10] - 2026-03-19
- Extended API 20+ wireless ArkWeb DevTools assistance from IPv4-only probing to dual-stack probing, so the extension can now discover and prefer usable device IPv6 addresses when IPv4 is unavailable.
- Added IPv6-aware target formatting for Chrome inspect guidance, using bracketed host syntax for copied debug targets like `[ipv6]:port`.
- Expanded wireless-debug parser coverage with IPv6 address discovery, IPv6 host/device subnet matching, and address-family preference tests while keeping existing IPv4 behavior intact.

## [0.6.9] - 2026-03-19
- Improved API 20+ wireless ArkWeb DevTools guidance by probing device IPv4 addresses over HDC, preferring the address that matches the developer machine subnet, and surfacing the exact `device-ip:port` target to add in Chrome inspect.
- Wireless WebView DevTools now opens `chrome://inspect/#devices` immediately, so the user flow matches the USB one-click workflow more closely.
- Added direct parser tests for device IPv4 discovery from common `ip addr` / `ifconfig` outputs, plus host-subnet matching coverage for the wireless debug target picker.

## [0.6.8] - 2026-03-19
- Added project-level permission diagnostics that align `module.json5 -> requestPermissions` with `requestPermissionsFromUser()` calls in Ability files, including undeclared permissions, missing `reason`, and `usedScene.abilities` mismatches.
- Added warnings for duplicate `requestPermissions` entries, unknown `usedScene.abilities` references, and missing `$string:` resources used by permission `reason`.
- Added `Open WebView DevTools`, a one-click ArkWeb workflow that detects `setWebDebuggingAccess(true)`, checks `ohos.permission.INTERNET`, discovers the active `webview_devtools_remote_*` socket, prepares USB `hdc fport`, and opens `chrome://inspect/#devices`.
- Added project-aware WebView DevTools guidance so API 20+ wireless `setWebDebuggingAccess(true, port)` setups are recognized and routed to the right Chrome inspect flow instead of the USB socket flow.
- Added lightweight project diagnostics for WebView DevTools readiness when a module uses `Web(...)` but does not enable `setWebDebuggingAccess(true)` or does not declare `ohos.permission.INTERNET`.
- Added official docs shortcuts for the HarmonyOS permission request guide, the latest `module.json5` configuration reference, and ArkWeb WebView DevTools debugging guidance.

## [0.6.7] - 2026-03-19
- Reduced project-config diagnostic flicker by replacing `collection.clear()` refreshes with per-workspace snapshots, and by refreshing only the affected workspace folder for document-driven updates.
- Prevented overlapping HDC status-bar polls from piling up when `hdc list targets` is slow, so the active-device indicator no longer races stale results back onto the UI.
- Expanded `WithTheme({ colorMode: ... })` dark-mode resource checks to recognize both `dark.json` and `resources/dark/...` qualifier directories, matching the official dark/light adaptation docs more closely.
- Fixed an infinite-loop bug in the `WithTheme` color-mode parser caused by a non-global regex `exec` loop, and added direct parser regression tests.

## [0.6.6] - 2026-03-19
- Added theme-related guidance for `ThemeControl.setDefaultTheme` and `onWillApplyTheme`, including docs shortcuts, snippets, and V2 compatibility warnings below API 16.
- Added a focused diagnostic when `ThemeControl.setDefaultTheme()` is called inside `build()`, with a quick link back to the official ThemeControl docs.
- Added an info-level hint when a `CustomTheme` class is instantiated but does not override `colors`, to help explain “theme changed but UI did not” cases without breaking older projects.
- Added a project-aware warning when `WithTheme({ colorMode: ... })` is used without any `dark.json` resources, matching the official dark-mode setup guidance while caching the resource check for editor performance.

## [0.6.5] - 2026-03-18
- Aligned performance hints with current ArkUI docs by recognizing `Repeat` as a positive list-rendering strategy alongside `LazyForEach`, while keeping existing `ForEach` compatibility and quick fixes intact.
- Updated `@ComponentV2` metadata and lifecycle completion docs to reflect `freezeWhenInactive`, `@ReusableV2`, and `onWillApplyTheme` support notes from newer state-management documentation.
- Expanded the docs quick picker with official links for `Repeat`, component freezing, and the latest state-management V1/V2 overview.
- Added `@ReusableV2` metadata with API 18 compatibility tracking, hover/completion coverage, and constant-table support so newer reuse patterns are recognized without breaking older projects.
- Added `repeatv2` and `reusablev2` snippets, plus a `Repeat` docs quick fix next to the existing `ForEach → LazyForEach` action.
- Added a compatibility diagnostic for the official `@ReusableV2` restriction inside `Repeat.template`, with quick links back to the `Repeat` and `@ReusableV2` docs instead of forcing code rewrites.
- Added `WithTheme` as a first-class ArkUI container in metadata, completion, docs search, and snippets, so theme skinning flows are easier to discover directly inside VS Code.
- Added a lightweight compatibility warning when `WithTheme` is used inside `@ComponentV2` files targeting API lower than 16, matching the newer state-management guidance without breaking older V1 projects.

## [0.6.4] - 2026-03-14

> Summary: this is a stabilization patch for the new quick-action UX.
> 摘要：这是针对新快捷操作体验的一次稳定性补丁。

- Fixed the startup registration race behind `No view is registered with id: harmony.quickActionsView` by waiting for `harmony.isHarmonyProject` context setup before the extension registers Harmony views.
- Added a regression test to keep project detection from finishing before `setContext` completes.

## [0.6.3] - 2026-03-14

> Summary: this release removes a lot of `Command Palette` hunting and brings the main HarmonyOS workflow into visible VS Code UI.
> 摘要：这一版重点是减少对命令面板搜索的依赖，把鸿蒙开发最常用的操作直接放到 VS Code 可见界面里。

- Added a `Quick Actions` sidebar so high-frequency HarmonyOS actions are grouped in one always-visible panel instead of relying on `Command Palette` search.
- Added a `HarmonyOS` status-bar control center that opens the main run, device, inspect, and setup actions from one quick pick.
- Added device-tree context actions for selecting the active device, opening mirror, inspecting UI, streaming logs, taking screenshots, and launching or stopping emulators.
- Improved device discoverability by showing the active target directly inside the device tree and reusing that target across mirror, logs, screenshot, and inspector workflows.

## [0.6.2] - 2026-03-14
- Added real signing-profile bundleName parsing from `build-profile.json5 -> signingConfigs[].material.profile (.p7b)`, plus pre-build diagnostics and one-click sync for `app.json5` when the signing profile bundleName does not match.
- Improved `Build & Run` failure reporting so hvigor signing/configuration errors surface as concise, actionable messages instead of a truncated shell command dump.
- Improved device UX when HDC is unavailable: the status bar now shows `HDC Offline`, device commands explain HDC server failures instead of pretending no devices exist, and environment checks probe live `hdc list targets`.

## [0.6.1] - 2026-03-14

> Summary: this cycle focused on easier onboarding, safer project migration, and lower-friction device workflows.
> 摘要：这一轮重点是更容易上手、更安全的工程迁移，以及更顺手的设备工作流。

### Added
- **Project config diagnostics**:
  - Added targeted diagnostics for legacy `build-profile.json5` migration gaps such as missing `targetSdkVersion` and `buildModeSet`
  - Added startup-chain validation for `module.json5`, `main_pages.json`, `EntryAbility.loadContent()`, and `@Entry` page decorators
  - Added `routerMap` / `route_map.json` / Navigation named-route validation, including `buildFunction` and NavPathStack route-name checks
  - Added Quick Fix support for migrating legacy `build-profile.json5` content and inserting missing `@Entry`

### Fixed
- **Extension details readability**:
  - Reworked README top sections so first-time users can find setup steps and main workflows faster
  - Renamed command and view labels in the manifest to make the VS Code “Features” tab clearer
  - Added a concise summary at the top of the changelog for faster scanning
- **build-profile migration correctness**:
  - Migrates missing `targetSdkVersion` per product instead of only touching the first product
  - Avoids corrupting `modules` when `products` is empty
- **Device and emulator target selection**:
  - Device Mirror, UI Inspector, screenshots, and hilog now prompt for or retain the intended target device
  - Added an active-device status bar so run, mirror, screenshot, and inspector actions reuse one shared target device
  - Mirror and Inspector now follow active-device switches instead of silently keeping stale panel targets
  - Emulator launch waits for a newly appeared emulator HDC target instead of treating any connected device as success
  - Device tree passes concrete device IDs into mirror actions
  - `Refresh Device List` now registers immediately during activation instead of waiting on the device tree import timing
  - Emulator discovery now falls back to the DevEco emulator CLI list when legacy instance directories are absent
  - Emulator launch now uses DevEco's `-hvd` argument instead of the incompatible Android-style `-avd`
- **Project config diagnostic performance**:
  - Full startup-chain rescans no longer run on every `.ets` keystroke; `.ets` changes are revalidated on save
  - Added refresh-version guarding to reduce stale diagnostic writes during overlapping scans
- **Cross-platform screenshot temp paths**:
  - Device screenshots now use the host OS temp directory instead of hardcoded `/tmp`
- **Plugin activation smoke coverage**:
  - Added extension-host smoke tests for activation, command registration, debug launch wiring, and module deactivation

## [0.6.0] - 2026-03-14

### Added
- **HarmonyOS 5.x/6.x SDK alignment**:
  - Added modern SDK parsing for `targetSdkVersion`, `compileSdkVersion`, `compatibleSdkVersion`
  - Recognizes release strings like `6.0.0(20)` and `6.0.2(22)`
  - Updated project templates, config hover docs, and schemas for the newer build-profile / oh-package conventions
- **Environment check command** (`checkEnvironment.ts`):
  - Detects HarmonyOS Command Line Tools such as `sdkmgr`, `ohpm`, and `codelinter`
  - Surfaces official entry points for downloads, release notes, and the knowledge map
- **Project and resource sidebars**:
  - Added a resource tree view for strings, colors, media, and profiles
  - Added project file indexing APIs and a project files tree view
- **Shared command helpers**:
  - Added reusable utilities for HarmonyOS SDK parsing, hvigor command generation, JSON5 field extraction, workspace selection, project metadata lookup, and HDC command execution/terminal rendering
- **New unit tests** for Harmony SDK parsing, JSON5 helpers, hvigor helpers, HDC helpers, and project file indexing

### Fixed
- **Cold-start resource validation/definition bug**:
  - `$r()` diagnostics and definition lookup now initialize the resource index before first use
  - Resource completion no longer rebuilds the resource index on every trigger
- **Cross-platform build/run inconsistencies**:
  - Unified hvigor command construction across tasks, build/run, and terminal workflows
  - Improved device-side HDC invocation with a shared helper instead of ad-hoc shell string concatenation
- **JSON5 parsing regressions**:
  - Build, run, debug, and project detection now read unquoted JSON5 keys like `bundleName`, `type`, and `mainElement`
- **Manifest/API mismatches**:
  - Implemented the previously declared `harmony.resourceView`
  - Removed the unused `harmony.enableInlayHints` setting
  - Public API `getDevices()` and `onDeviceChanged` now return meaningful data
- **Multi-workspace targeting**:
  - Core flows now prefer the active editor’s workspace instead of blindly using the first folder
- **Packaging blocker**:
  - Added `@vscode/vsce` as a dev dependency so `pnpm package` works in a clean environment

### Changed
- `buildAndRun.ts`, `terminalRunner.ts`, `debugProvider.ts`, `device/manager.ts`, `uiInspector.ts`, `emulatorManager.ts`, and `logViewer.ts` now rely on shared HDC helpers
- `apiCompatChecker.ts` and `diagnosticProvider.ts` now use the newer HarmonyOS SDK detection path
- `extension.ts` now registers cached resource providers and the new resource tree view

## [0.5.0] - 2026-03-12

### Added
- **OHPM Dependency Management** (`deps.ts`) — full dependency management UI:
  - View all outdated dependencies with current / latest version comparison
  - One-click update single dependency or batch update all outdated deps
  - Add new dependency from known OHPM packages list or custom input
  - Run `ohpm install` directly from command palette
- **Component & Decorator Metadata System** (`config/components.json`, `config/decorators.json`, `metadata.ts`):
  - 98 ArkUI components with category, minApi, previewSupported, bilingual docs, docUrl
  - 30 ArkTS decorators with stateModel (v1/v2/common), migration hints, docUrl
  - Singleton loader with in-memory caching for zero-cost repeated access
  - Consumed by completionProvider, hoverProvider, diagnosticProvider, apiCompatChecker, docsSearch, arkuiRenderer
- **Enhanced Documentation Search** (`docsSearch.ts`) — now powered by metadata:
  - Decorators grouped by state model (V1 / V2 / Common)
  - Components grouped by category (Layout / Basic / Media / Canvas / Menu)
  - API level tags on every item
  - Fallback to Huawei developer site search for unlisted keywords
- **ArkUI Preview — unsupported component badges**:
  - Components with `previewSupported: false` now render a clear warning badge
  - Shows component name, "Preview unsupported" label, and Chinese description

### Fixed
- **Critical packaging bug**: `config/` directory was excluded from VSIX by `.vscodeignore`, causing runtime crash when metadata was loaded
- **Critical path resolution bug**: `metadata.ts` used `'..', '..'` from `dist/` — off by one level, could never find `config/` in production
- **Test failure**: Badge component test expected `ark-unknown` but Badge is now registered in `components.json` with `previewSupported: false`; updated test to match new unsupported-preview rendering behavior

### Changed
- `completionProvider.ts` — now reads decorators and components from metadata JSON instead of hardcoded arrays
- `hoverProvider.ts` — decorator hover docs now sourced from metadata with docUrl links
- `diagnosticProvider.ts` — API level checks driven by metadata, V1/V2 detection uses metadata stateModel
- `apiCompatChecker.ts` — decorator and component compat checks driven by metadata
- `arkuiRenderer.ts` — preview support check uses component metadata `previewSupported` flag

## [0.4.0] - 2026-03-10

### Added — Developer Experience Enhancement / 开发者体验增强

- **Real-time ArkTS Diagnostics** (`diagnosticProvider.ts`) — instant error detection without compilation:
  - `any` / `unknown` type usage → Error with Quick Fix to replace with concrete type
  - `as any` forced cast → Error with Quick Fix to remove
  - Implicit `any` (function params without type annotation) → Warning with Quick Fix
  - `@State` on complex objects (Array, Map, custom class) → Warning: shallow observation trap, suggests `@ObservedV2 + @Trace`
  - V1/V2 decorator mixing in same file → Error
  - `@Link` inside `@ComponentV2` → Error, suggests `@Param + @Event`
  - `ForEach` usage → Info, suggests `LazyForEach` for large lists
  - Heavy computation in `build()` → Warning: detects `fetch()`, `setTimeout`, `setInterval`, `console.log`, `JSON.parse`, `await`, imperative loops
- **Quick Fix Provider** (`codeFixProvider.ts`) — CodeActionProvider with auto-fix for all 9 diagnostic rules:
  - Replace `any`/`unknown` with string, number, boolean, object, or Record
  - Remove `as any` cast
  - Add `: string` type annotation to untyped parameters
  - `@State` → `@Trace` (deep observation)
  - `@Link` → `@Param` (V2 compatible)
  - `ForEach` → `LazyForEach` (performance)
  - V1/V2 mixing → triggers full V1→V2 migration command
- **Performance Insight CodeLens** (`perfLens.ts`) — inline performance hints:
  - `build()` methods: component count, nesting depth, ForEach/LazyForEach strategy
  - `ForEach`/`LazyForEach` lines: rendering strategy explanation and tips
  - `struct` definitions: state variable count with warning when > 10
- **Config File Hover Documentation** (`configHoverProvider.ts`) — bilingual (中/EN) docs on hover:
  - `build-profile.json5`: compileSdkVersion, products, modules, signingConfigs, etc.
  - `module.json5`: type, deviceTypes, pages, abilities, requestPermissions, etc.
  - `app.json5`: bundleName, versionCode, versionName, icon, label, etc.
  - `oh-package.json5`: dependencies, devDependencies, dynamicDependencies, etc.
  - 40+ configuration keys across 4 file types
- **OHPM Dependency Insight** (`ohpmInsight.ts`) — dependency management intelligence:
  - Outdated version detection for 10+ popular OHPM packages (@ohos/axios, @ohos/lottie, @ohos/hypium, etc.)
  - CodeLens on each dependency showing package description and latest version
  - Problems panel integration — outdated deps appear as diagnostics
  - Automatic analysis on workspace open and oh-package.json5 save
- **New configuration options**: `harmony.enableDiagnostics`, `harmony.enablePerfLens`, `harmony.enableOhpmInsight`
- **83 new unit tests** (total 417) covering diagnostics (39 tests), perf lens (14), config hover (11), OHPM insight (19)

### Changed
- `extension.ts` — added Layer 1.8 (DX Enhancement) with lazy-loaded diagnostic, quick fix, perf lens, config hover, and OHPM insight providers
- `package.json` — version bumped to 0.4.0, added 3 new configuration properties
- V1/V2 mixing detection now uses regex word-boundary matching to avoid `@Component`/`@ComponentV2` false positives

## [0.3.0] - 2026-03-10

### Added
- **Device Mirror Panel** — mirror your device/emulator screen inside VS Code:
  - Live screenshot streaming via HDC at configurable 1-5 FPS
  - Full touch interaction: click, swipe, long-press with coordinate mapping
  - Navigation key bar: Home, Back, Recent Apps, Volume Up/Down, Power
  - Auto device detection — selects the first connected device
  - No-device fallback — friendly "connect a device" message
  - Frame dedup guard — prevents concurrent screenshot requests from stacking
  - FPS counter and device resolution display in status bar
- **Emulator Manager** — manage DevEco Studio emulators from VS Code:
  - Auto-detect emulator images across macOS, Windows, and Linux
  - Find emulator executable from known DevEco Studio install paths
  - Launch/stop emulators with progress notification and cancellation support
  - Auto-opens Device Mirror when emulator comes online via HDC
  - Manual executable selection fallback when auto-detection fails
- **Enhanced TreeView** — Devices & Emulators sidebar:
  - Two-section tree: "Devices" (physical) and "Emulators" (detected images)
  - Running/stopped status icons for emulators
  - Click device → opens Device Mirror; click stopped emulator → launches it
- **Enhanced ArkUI Previewer** — significantly upgraded component preview:
  - Full AST parser for ArkTS `build()` methods → recursive ArkNode tree
  - 15+ layout containers: Column, Row, Stack, Grid, List, Flex, Scroll, Tabs, Navigation, RelativeContainer
  - 20+ leaf components: Text, Button, Image, TextInput, TextArea, Toggle, Slider, Progress, Search, Checkbox, Radio, Rating, Divider, Blank, etc.
  - CSS style mapping: width, height, padding, margin, backgroundColor, borderRadius, fontSize, fontColor, fontWeight, opacity, justifyContent, alignItems, layoutWeight, columnsTemplate, gap
  - ArkUI enum mapping: Color.Red→#FF0000, FlexAlign.Center→center, FontWeight.Bold→bold
  - Unit conversion: vp→px, fp→px, numeric→px
  - 4 device frames: Phone (360×780), Tablet (600×400), Watch (192×192), Car (720×360)
  - Hover-to-inspect component type labels
  - Auto-refresh on save and when switching active .ets files
  - @ComponentV2 struct detection
- **New commands**: `Open Device Mirror`, `Launch Emulator`, `Stop Emulator`
- **46 new unit tests** (total 334) covering ArkUI renderer, coordinate mapping, gesture detection, frame rate control, emulator detection

### Changed
- `uiInspector.ts` — extracted shared functions: `sendTouchInput`, `sendSwipeInput`, `sendKeyEvent`, `sendLongPress` (reused by both UI Inspector and Device Mirror)
- `captureScreenshot()` — added JPEG format option for smaller/faster transfers
- Preview panel — fixed duplicate event listener registration, now properly disposes listeners
- `emulatorManager` — all `hdc` calls now use `resolveHdcPath()` instead of hardcoded `'hdc'`
- `startEmulatorProcess` — properly awaits `withProgress`, supports cancellation token

## [0.2.4] - 2026-03-10

### Added
- **API 13/14 Support** — full compatibility with HarmonyOS 5.0.1 (API 13) and 5.0.2 (API 14):
  - New decorators: `@Require` (API 13+), `@Type` (API 14+)
  - New components: `IsolatedComponent`, `NodeAdapter`, `EmbeddedComponent`, `Chip`, `ChipGroup`, `SegmentButton` (API 13+), `EffectComponent`, `MarqueeV2` (API 14+)
  - New APIs: `makeObserved`, `UIContext.getPromptAction`, `UIContext.getOverlayManager` (API 14+)
- **Deprecated API Detection** — scans `.ets` files for deprecated APIs and suggests modern replacements:
  - `animateTo` → `UIContext.animateTo()`
  - `@ohos.router` → `Navigation + NavPathStack`
  - `@ohos.fileio` → `@ohos.file.fs`
  - `router.pushUrl/replaceUrl/back` → `NavPathStack`
  - 15+ deprecated module/function patterns detected
- **Upgraded API Compatibility Checker** — now checks API 12/13/14 feature usage against `compileSdkVersion`:
  - Per-API-level feature detection (decorators, components, APIs)
  - Line-number reporting for each issue
  - Upgrade suggestions when targeting older API levels
  - `modelVersion` outdated warning for API 14+ projects
- **15+ New Code Snippets**:
  - `require` — `@Require @Param` (API 13+)
  - `type` — `@Type` decorator (API 14+)
  - `makeobs` — `UIUtils.makeObserved()` (API 14+)
  - `sendable` — `@Sendable` class
  - `persistv2` — `PersistenceV2` state management
  - `navstack` — `Navigation + NavPathStack` routing
  - `uianimate` — `UIContext.animateTo()` (modern animation)
  - `drag` — drag-and-drop events (API 14+)
  - `chip` — `Chip` component (API 13+)
  - `segment` — `SegmentButton` (API 13+)
  - `once` — `@Once @Param` (V2)
  - `repeat` — `Repeat` type-safe loop (API 12+)
- **New Lifecycle Completions**: `aboutToReuse`, `aboutToRecycle`, `onWillApplyTheme`
- **Hover Documentation** for `@Require` (API 13+) and `@Type` (API 14+)
- **JSON Schema Updates**:
  - `build-profile.json5`: `buildOption.strictMode`, `useNormalizedOHMUrl` (API 14+), array `srcPath`
  - `module.json5`: `routerMap` (API 12+), `launchType`, `orientation`, `default` device type
  - `oh-package.json5`: `overrides` (API 13+), `overrideDependencyMap` (API 14+)
  - `hvigor-config.json5`: `modelVersion` examples updated to include `5.0.1`, `5.0.2`
- **258 Unit Tests** — comprehensive test suite covering constants, completions, hover, snippets, schemas, and API compatibility checker

### Changed
- Decorator list expanded to 30+ (added `@Require`, `@Type`)
- ArkUI component completions expanded to 85+ (from 70+)
- Snippet count increased to 70+ (from 55+)
- API compatibility checker now reports line numbers for each issue

## [0.2.2] - 2026-03-08

### Added
- **HDC Auto-Detection** — automatically finds HDC executable across platforms:
  - Scans well-known SDK paths: macOS (`~/Library/OpenHarmony/Sdk`, DevEco Studio), Windows (`%LOCALAPPDATA%\OpenHarmony\Sdk`, `C:\DevEcoStudio`), Linux (`~/OpenHarmony/Sdk`)
  - Prefers highest SDK version when multiple are installed
  - Caches result for the session (no repeated filesystem scans)
  - Falls back to interactive dialog: "Browse for HDC" or "Open Settings"
- Users no longer need to manually configure `harmony.hdcPath` in most cases

## [0.2.1] - 2026-03-08

### Added
- **V1 → V2 Migration Tool** (`HarmonyOS: Migrate V1 → V2 Decorators`):
  - One-click migration: @Component→@ComponentV2, @State→@Local, @Prop→@Param, etc.
  - V1/V2 mixing detection with user confirmation
  - TODO comments for manual review where needed (@ObjectLink→@Param)
- **API Compatibility Checker** (`HarmonyOS: Check API Compatibility`):
  - Scans project for API version mismatches
  - Detects V2 decorator usage against compileSdkVersion
  - Validates hvigor-config.json5 modelVersion
  - Reports V1/V2 mixing in same file
  - Results output to "HarmonyOS Compatibility" channel
- **Operation Manual** (`docs/操作手册.md`):
  - Comprehensive user guide for all 23 commands
  - V2 migration walkthrough and API compat check guide
  - Keyboard shortcuts and troubleshooting

### Changed
- Both new commands added to right-click context menu for .ets files

## [0.2.0] - 2026-03-08

### Added
- **V2 State Management decorators** (API 12+ / HarmonyOS NEXT):
  - @ComponentV2, @Local, @Param, @Once, @Event, @Monitor, @Computed
  - @ObservedV2, @Trace, @Provider, @Consumer
  - Bilingual hover documentation (English + Chinese) for all V1 and V2 decorators
- **15+ new code snippets** for V2:
  - `entryv2` — @Entry + @ComponentV2 page template
  - `compv2` — @ComponentV2 struct
  - `local` / `param` / `event` / `monitor` / `computed` — V2 state decorators
  - `observedv2` — @ObservedV2 + @Trace class
  - `providerv2` — @Provider/@Consumer pattern
  - `appstoragev2` — AppStorageV2 global state
  - `v2migrate` — V1 to V2 migration reference
  - `waterflow` / `relative` / `web` / `xcomp` — new ArkUI components
- **30+ new ArkUI components** in auto-completion:
  - GridRow, GridCol, ListItemGroup, FolderStack, CheckboxGroup
  - RichEditor, XComponent, Canvas, Shape drawing components
  - Menu/MenuItem, CalendarPicker, SymbolGlyph, NodeContainer, etc.
- **hvigor-config.json5 schema validation** — modelVersion, execution, dependencies
- **HarmonyOS NEXT / Cangjie** keywords for marketplace discoverability

### Changed
- Decorator hover docs now bilingual (English + Chinese)
- ArkUI component list expanded from 40 to 70+ components

## [0.1.1] - 2026-03-08

### Changed
- README bilingual documentation (English + Chinese / 中英文对照文档)

## [0.1.0] - 2026-03-08

### Added
- ArkTS language support (.ets files) with syntax highlighting, snippets, and TextMate grammar
- 40+ code snippets for ArkUI components, decorators, and common patterns
- Auto-completion for ArkTS decorators, ArkUI components, and lifecycle methods
- Hover documentation for 19 ArkTS decorators
- CodeLens showing component references and route info
- Color preview for hex colors and HarmonyOS named colors
- `$r()` resource reference completion, Ctrl+Click navigation, and validation diagnostics
- JSON Schema validation for build-profile.json5, oh-package.json5, module.json5, app.json5
- Project creation wizard with 4 templates (Empty, List, Tabs, Login)
- HarmonyOS project auto-detection via build-profile.json5
- Device management TreeView with auto-polling
- Build HAP / Clean via hvigor task provider
- **Build & Run (Terminal)** - one-click build, install, and launch with visible output
- **Build & Run on Device** - background workflow with progress notification
- **Debug App on Device** - HDC port forwarding + CDP debugger attach
- **UI Inspector** - WebView panel with device screenshot, component tree, and property inspection
- **Live Mode** - auto-refresh UI Inspector every 2 seconds
- Component preview with simplified ArkUI rendering
- Device log viewer (hdc hilog streaming)
- Screenshot capture from connected device
- Code actions: Extract to @Component, Extract to @Builder, Extract to $r() resource
- Microkernel architecture with EventBus, Registry, and Module system
- Public API for third-party extension integration
