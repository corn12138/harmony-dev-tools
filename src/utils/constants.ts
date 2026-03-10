export const EXTENSION_ID = 'harmony-dev-tools';
export const LANGUAGE_ID = 'arkts';
export const ETS_EXTENSION = '.ets';

export const CONFIG_FILES = {
  BUILD_PROFILE: 'build-profile.json5',
  OH_PACKAGE: 'oh-package.json5',
  MODULE_JSON: 'module.json5',
  APP_JSON: 'app.json5',
} as const;

export const COMMANDS = {
  CREATE_PROJECT: 'harmony.createProject',
  BUILD_HAP: 'harmony.buildHap',
  RUN_ON_DEVICE: 'harmony.runOnDevice',
  CLEAN: 'harmony.clean',
  VIEW_DEVICES: 'harmony.viewDevices',
  INSTALL_HAP: 'harmony.installHap',
  VIEW_LOGS: 'harmony.viewLogs',
  PREVIEW_COMPONENT: 'harmony.previewComponent',
  FORMAT_DOCUMENT: 'harmony.formatDocument',
  ORGANIZE_IMPORTS: 'harmony.organizeImports',
  EXTRACT_COMPONENT: 'harmony.extractComponent',
  EXTRACT_BUILDER: 'harmony.extractBuilder',
  EXTRACT_STRING: 'harmony.extractString',
  MANAGE_DEPS: 'harmony.manageDeps',
  OPEN_DOCS: 'harmony.openDocs',
  UI_INSPECTOR: 'harmony.uiInspector',
  TAKE_SCREENSHOT: 'harmony.takeScreenshot',
  BUILD_AND_RUN: 'harmony.buildAndRun',
  TERMINAL_BUILD_RUN: 'harmony.terminalBuildAndRun',
  STOP_APP: 'harmony.stopApp',
  DEBUG_APP: 'harmony.debugApp',
  MIGRATE_V1_TO_V2: 'harmony.migrateV1ToV2',
  CHECK_API_COMPAT: 'harmony.checkApiCompat',
  DEVICE_MIRROR: 'harmony.openDeviceMirror',
  LAUNCH_EMULATOR: 'harmony.launchEmulator',
  STOP_EMULATOR: 'harmony.stopEmulator',
} as const;

export const CONTEXT_KEYS = {
  IS_HARMONY_PROJECT: 'harmony.isHarmonyProject',
} as const;

export const ARKTS_DECORATORS = [
  // Component V1
  '@Component', '@Entry', '@CustomDialog', '@Builder', '@BuilderParam', '@Reusable', '@Preview',
  // State management V1
  '@State', '@Prop', '@Link', '@Provide', '@Consume', '@Watch',
  '@Observed', '@ObjectLink',
  // Component V2 (API 12+)
  '@ComponentV2', '@ObservedV2', '@Trace', '@Local', '@Param', '@Once', '@Event',
  '@Monitor', '@Computed', '@Provider', '@Consumer',
  // Style
  '@Styles', '@Extend', '@AnimatableExtend',
  // Concurrency (API 12+, enhanced in API 14)
  '@Concurrent', '@Sendable',
  // Ability
  '@Ability',
  // API 13+ new decorators
  '@Require',
  // API 14+ new decorators
  '@Type',
] as const;

export const API_VERSIONS = {
  API_12: 12,
  API_13: 13,
  API_14: 14,
} as const;

export const DEPRECATED_APIS: Array<{
  name: string;
  replacement: string;
  sinceApi: number;
  kind: 'function' | 'module' | 'decorator';
}> = [
  { name: 'animateTo', replacement: 'UIContext.animateTo()', sinceApi: 11, kind: 'function' },
  { name: "from '@ohos.router'", replacement: "@ohos.arkui.UIContext router (Navigation)", sinceApi: 12, kind: 'module' },
  { name: "from '@ohos.promptAction'", replacement: "@ohos.arkui.UIContext promptAction", sinceApi: 12, kind: 'module' },
  { name: "from '@ohos.mediaquery'", replacement: "@ohos.arkui.UIContext mediaQuery", sinceApi: 12, kind: 'module' },
  { name: "from '@ohos.animator'", replacement: "@ohos.arkui.UIContext animator", sinceApi: 12, kind: 'module' },
  { name: "from '@ohos.fileio'", replacement: "@ohos.file.fs", sinceApi: 11, kind: 'module' },
  { name: "from '@ohos.notification'", replacement: "@ohos.notificationManager", sinceApi: 11, kind: 'module' },
  { name: "from '@ohos.bundle'", replacement: "@ohos.bundle.bundleManager", sinceApi: 11, kind: 'module' },
  { name: "from '@ohos.data.rdb'", replacement: "@ohos.data.relationalStore", sinceApi: 11, kind: 'module' },
  { name: "from '@ohos.multimedia.camera'", replacement: "@ohos.multimedia.camera (new API)", sinceApi: 11, kind: 'module' },
  { name: "from '@ohos.contact'", replacement: "@ohos.contact (new API)", sinceApi: 12, kind: 'module' },
  { name: "AlertDialog.show", replacement: "UIContext.showAlertDialog() or promptAction", sinceApi: 12, kind: 'function' },
  { name: "router.pushUrl", replacement: "Navigation + NavPathStack", sinceApi: 12, kind: 'function' },
  { name: "router.replaceUrl", replacement: "Navigation + NavPathStack", sinceApi: 12, kind: 'function' },
  { name: "router.back", replacement: "Navigation + NavPathStack.pop()", sinceApi: 12, kind: 'function' },
];
