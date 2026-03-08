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
} as const;

export const CONTEXT_KEYS = {
  IS_HARMONY_PROJECT: 'harmony.isHarmonyProject',
} as const;

export const ARKTS_DECORATORS = [
  // Component
  '@Component', '@Entry', '@CustomDialog', '@Builder', '@BuilderParam', '@Reusable', '@Preview',
  // State management
  '@State', '@Prop', '@Link', '@Provide', '@Consume', '@Watch',
  '@Observed', '@ObjectLink', '@ObservedV2', '@Trace',
  // Style
  '@Styles', '@Extend', '@AnimatableExtend',
  // Concurrency
  '@Concurrent', '@Sendable',
] as const;
