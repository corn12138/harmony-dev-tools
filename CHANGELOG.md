# Changelog

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
