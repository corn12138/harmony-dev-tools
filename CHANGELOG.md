# Changelog

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
