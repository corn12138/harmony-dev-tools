# Changelog

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
