# HarmonyOS Dev Tools

Lightweight & powerful HarmonyOS / OpenHarmony development toolkit for VS Code.

> Build, run, debug, and inspect HarmonyOS apps directly from VS Code — no DevEco Studio required.

## Features

### Language Support
- **ArkTS syntax highlighting** for `.ets` files
- **40+ code snippets** — type `comp`, `entry`, `col`, `row`, `btn`, `state`, etc.
- **Auto-completion** for decorators (`@Component`, `@State`, `@Link`...), ArkUI components (40+), and lifecycle methods
- **Hover documentation** for all ArkTS decorators
- **CodeLens** showing component references and `@Entry` route info
- **Color preview** for hex colors (`#RRGGBB`, `#AARRGGBB`) and named colors (`Color.Red`)

### Resource Management
- **`$r()` auto-completion** — suggests resource keys from `resources/` directory
- **Ctrl+Click navigation** — jump from `$r('app.string.title')` to the resource definition
- **Resource validation** — diagnostics for missing or invalid resource references

### JSON Schema Validation
- `build-profile.json5` — build configuration
- `oh-package.json5` — package dependencies
- `module.json5` — module configuration
- `app.json5` — application metadata

### Build & Run

#### Build & Run (Terminal)
Run `HarmonyOS: Build & Run (Terminal)` from the Command Palette (`Cmd+Shift+P`).

Executes in VS Code's integrated terminal with full output:
```
[1/4] Building HAP...        -> ./hvigorw assembleHap
[2/4] Locating HAP output... -> finds .hap file
[3/4] Installing to device...-> hdc install
[4/4] Launching app...       -> hdc shell aa start
```

#### Build & Run on Device
Run `HarmonyOS: Build & Run on Device` — same workflow but runs in background with progress notification, then auto-opens the UI Inspector.

#### Other Build Commands
- `HarmonyOS: Build HAP` — build only
- `HarmonyOS: Clean Build` — clean build cache
- `HarmonyOS: Stop App on Device` — force-stop the running app

### Debugging

#### Debug App on Device
Run `HarmonyOS: Debug App on Device` or add to `launch.json`:
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

This will:
1. Set up HDC port forwarding (`hdc fport`)
2. Launch the app in debug mode (`aa start -D`)
3. Attach VS Code's debugger via Chrome DevTools Protocol

#### UI Inspector
Run `HarmonyOS: Open UI Inspector` to open a WebView panel with:
- **Device screenshot** — live view of the running app
- **Component tree** — hierarchical view of ArkUI components
- **Property panel** — bounds, attributes, and layout info for selected component
- **Go to Source** — click to jump to the component's `.ets` source code
- **Live mode** — click "Live" button to auto-refresh every 2 seconds

#### Device Log Viewer
Run `HarmonyOS: View Device Logs` to stream `hdc hilog` output to VS Code's Output panel.

### Device Management
- **Device TreeView** — sidebar panel showing connected devices with auto-refresh
- `HarmonyOS: Refresh Devices` — manually refresh device list
- `HarmonyOS: Install HAP to Device` — select and install a .hap file
- `HarmonyOS: Take Device Screenshot` — capture and save device screenshot

### Project Tools
- **Project creation wizard** — `HarmonyOS: Create New Project` with 4 templates (Empty, List, Tabs, Login)
- **Code actions** — right-click menu:
  - Extract to `@Component` — extract selected UI code to a new component
  - Extract to `@Builder` — extract to a `@Builder` method
  - Extract to `$r()` — extract hardcoded strings to resource references
- `HarmonyOS: Organize Imports`
- `HarmonyOS: Format ArkTS File`
- `HarmonyOS: Manage Dependencies`
- `HarmonyOS: Search HarmonyOS Docs`

### Component Preview
Run `HarmonyOS: Preview Component` on any `.ets` file to see a simplified preview of the UI layout in a WebView panel. Updates automatically on save.

## Requirements

- **HDC** (HarmonyOS Device Connector) in PATH, or configure `harmony.hdcPath` in settings
- **hvigorw** — the project must contain `hvigorw` script in the root directory (standard HarmonyOS project)
- A connected HarmonyOS device or emulator for build/run/debug features

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `harmony.sdkPath` | `""` | Path to HarmonyOS SDK root |
| `harmony.hdcPath` | `""` | Path to HDC executable (auto-detected if empty) |
| `harmony.enableCodeLens` | `true` | Show component references as CodeLens |
| `harmony.enableResourceValidation` | `true` | Validate `$r()` references |
| `harmony.autoFormatOnSave` | `false` | Auto-format ArkTS files on save |
| `harmony.devicePollInterval` | `5000` | Device list refresh interval (ms) |
| `harmony.logLevel` | `"info"` | Extension log level |

## Quick Start

1. Install the extension from VS Code Marketplace
2. Open a HarmonyOS project folder (must contain `build-profile.json5`)
3. The extension activates automatically — you'll see "HarmonyOS" in the status bar
4. Connect a device via USB or start an emulator
5. Press `Cmd+Shift+P` and run `HarmonyOS: Build & Run (Terminal)`

## Architecture

Built with a microkernel architecture for minimal footprint:
- **4-layer lazy loading** — features load only when needed
- **~73KB production bundle** — ultra-lightweight
- **EventBus + Registry** — extensible plugin system
- **Public API** — third-party extensions can integrate via the exported API

## All Commands

| Command | Description |
|---------|-------------|
| `HarmonyOS: Create New Project` | Project creation wizard |
| `HarmonyOS: Build HAP` | Build the HAP package |
| `HarmonyOS: Clean Build` | Clean build cache |
| `HarmonyOS: Build & Run (Terminal)` | Build, install, and launch in terminal |
| `HarmonyOS: Build & Run on Device` | Build, install, launch + open UI Inspector |
| `HarmonyOS: Run on Device` | Install and run existing HAP |
| `HarmonyOS: Debug App on Device` | Launch with debugger attached |
| `HarmonyOS: Stop App on Device` | Force-stop the running app |
| `HarmonyOS: Open UI Inspector` | Device UI hierarchy viewer |
| `HarmonyOS: Preview Component` | Simplified component preview |
| `HarmonyOS: View Device Logs` | Stream device logs |
| `HarmonyOS: Refresh Devices` | Refresh device list |
| `HarmonyOS: Install HAP to Device` | Install a .hap file |
| `HarmonyOS: Take Device Screenshot` | Capture device screenshot |
| `HarmonyOS: Format ArkTS File` | Format current file |
| `HarmonyOS: Organize Imports` | Organize import statements |
| `HarmonyOS: Extract to @Component` | Extract UI to component |
| `HarmonyOS: Extract to @Builder` | Extract UI to builder |
| `HarmonyOS: Extract to $r() Resource` | Extract string to resource |
| `HarmonyOS: Manage Dependencies` | Manage oh-package.json5 |
| `HarmonyOS: Search HarmonyOS Docs` | Search official docs |

## License

MIT
