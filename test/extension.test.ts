import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../src/utils/constants';

const detectorActivate = vi.fn(async () => undefined);
const detectorDeactivate = vi.fn(async () => undefined);
const createDeviceStatusBar = vi.fn(() => ({ dispose: () => {} }));
const listConnectedDevices = vi.fn(async () => [
  { id: 'emulator-5554', name: 'emulator-5554', type: 'emulator', status: 'online' as const },
]);
const getConnectedDeviceState = vi.fn(async () => ({
  devices: [
    { id: 'emulator-5554', name: 'emulator-5554', type: 'emulator', status: 'online' as const },
  ],
}));
const promptAndSelectDevice = vi.fn(async () => undefined);
const selectDeviceById = vi.fn(async (_deviceId?: string) => true);
const pickConnectedDevice = vi.fn(async () => ({
  id: 'emulator-5554',
  name: 'emulator-5554',
  type: 'emulator',
  status: 'online' as const,
}));
const getActiveDeviceId = vi.fn(() => 'emulator-5554');
const chooseAutoDevice = vi.fn((devices: any[], preferredId?: string) =>
  devices.find((device) => device.id === preferredId) ?? devices[0],
);
const deviceTreeRefresh = vi.fn(async () => undefined);
const buildHap = vi.fn(async () => undefined);
const cleanBuild = vi.fn(async () => undefined);
const runOnDevice = vi.fn(async () => undefined);
const installHap = vi.fn(async () => undefined);
const viewLogs = vi.fn(async () => undefined);
const openWebViewDevTools = vi.fn(async (_commandArg?: unknown) => undefined);
const previewComponent = vi.fn(async () => undefined);
const formatDocument = vi.fn(async () => undefined);
const organizeImports = vi.fn(async () => undefined);
const extractComponent = vi.fn(async () => undefined);
const extractBuilder = vi.fn(async () => undefined);
const extractString = vi.fn(async () => undefined);
const migrateV1ToV2 = vi.fn(async () => undefined);
const manageDeps = vi.fn(async () => undefined);
const openDocs = vi.fn(async () => undefined);
const openUIInspector = vi.fn(async (_deviceId?: string) => undefined);
const buildAndRun = vi.fn(async (_options?: any) => undefined);
const terminalBuildAndRun = vi.fn(async () => undefined);
const terminalStopApp = vi.fn(async () => undefined);
const migrateBuildProfile = vi.fn(async (_uri?: any) => undefined);
const checkApiCompatibility = vi.fn(async () => undefined);
const openDeviceMirror = vi.fn(async (_deviceId?: string) => undefined);
const launchEmulator = vi.fn(async () => undefined);
const stopEmulator = vi.fn(async () => undefined);
const checkEnvironment = vi.fn(async () => undefined);
const takeDeviceScreenshot = vi.fn(async (_deviceId?: unknown) => undefined);

vi.mock('../src/project/projectDetector', () => ({
  ProjectDetectorModule: class {
    readonly id = 'harmony.projectDetector';
    isActive = false;

    async activate(): Promise<void> {
      this.isActive = true;
      await detectorActivate();
    }

    async deactivate(): Promise<void> {
      this.isActive = false;
      await detectorDeactivate();
    }
  },
  getCurrentProjectInfo: () => ({ rootPath: '/workspace/demo', modules: ['entry'] }),
  getCurrentProjectFileIndex: () => ({
    rootPath: '/workspace/demo',
    modules: ['entry'],
    files: [],
    counts: {},
  }),
}));

vi.mock('../src/project/projectFilesTreeView', () => ({
  ProjectFilesTreeProvider: class {
    dispose(): void {}
  },
}));

vi.mock('../src/resource/resourceTreeView', () => ({
  ResourceTreeProvider: class {
    dispose(): void {}
  },
}));

vi.mock('../src/resource/resourceCompletion', () => ({
  ResourceCompletionProvider: class {
    provideCompletionItems(): any[] {
      return [];
    }
  },
}));

vi.mock('../src/resource/resourceDefinition', () => ({
  ResourceDefinitionProvider: class {
    provideDefinition(): undefined {
      return undefined;
    }
  },
  ResourceDiagnosticProvider: class {
    dispose(): void {}
  },
}));

vi.mock('../src/device/treeView', () => ({
  DeviceTreeProvider: class {
    async refresh(): Promise<void> {
      await deviceTreeRefresh();
    }

    dispose(): void {}
  },
}));

vi.mock('../src/build/taskProvider', () => ({
  HvigorTaskProvider: class {
    static readonly type = 'hvigor';
  },
}));

vi.mock('../src/debug/debugProvider', () => ({
  HarmonyDebugConfigProvider: class {
    static readonly type = 'harmonyos';
  },
  HarmonyDebugAdapterFactory: class {},
}));

vi.mock('../src/language/diagnosticProvider', () => ({
  createDiagnosticProvider: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/language/codeFixProvider', () => ({
  createCodeFixProvider: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/project/projectConfigDiagnostics', () => ({
  createProjectConfigDiagnosticProvider: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/project/projectConfigCodeActions', () => ({
  createProjectConfigCodeActions: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/language/perfLens', () => ({
  createPerfLensProvider: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/language/configHoverProvider', () => ({
  createConfigHoverProvider: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/project/ohpmInsight', () => ({
  createOhpmInsightProvider: vi.fn(() => ({ dispose: () => {} })),
}));

vi.mock('../src/device/devices', () => ({
  createDeviceStatusBar,
  listConnectedDevices,
  getConnectedDeviceState,
  promptAndSelectDevice,
  selectDeviceById,
  pickConnectedDevice,
  getActiveDeviceId,
  chooseAutoDevice,
}));

vi.mock('../src/build/runner', () => ({
  buildHap,
  cleanBuild,
}));

vi.mock('../src/device/manager', () => ({
  runOnDevice,
  installHap,
}));

vi.mock('../src/device/logViewer', () => ({
  viewLogs,
}));

vi.mock('../src/webview/devtools', () => ({
  openWebViewDevTools,
}));

vi.mock('../src/preview/panel', () => ({
  previewComponent,
}));

vi.mock('../src/tools/formatter', () => ({
  formatDocument,
}));

vi.mock('../src/tools/importOrganizer', () => ({
  organizeImports,
}));

vi.mock('../src/tools/codeActions', () => ({
  extractComponent,
  extractBuilder,
  extractString,
  migrateV1ToV2,
}));

vi.mock('../src/project/deps', () => ({
  manageDeps,
}));

vi.mock('../src/tools/docsSearch', () => ({
  openDocs,
}));

vi.mock('../src/debug/inspectorPanel', () => ({
  openUIInspector,
}));

vi.mock('../src/build/buildAndRun', () => ({
  buildAndRun,
}));

vi.mock('../src/build/terminalRunner', () => ({
  terminalBuildAndRun,
  terminalStopApp,
}));

vi.mock('../src/project/buildProfileMigration', () => ({
  migrateBuildProfile,
}));

vi.mock('../src/tools/apiCompatChecker', () => ({
  checkApiCompatibility,
}));

vi.mock('../src/device/mirrorPanel', () => ({
  openDeviceMirror,
}));

vi.mock('../src/device/screenshot', () => ({
  takeDeviceScreenshot,
}));

vi.mock('../src/device/emulatorManager', () => ({
  launchEmulator,
  stopEmulator,
}));

vi.mock('../src/project/checkEnvironment', () => ({
  checkEnvironment,
}));

async function flushImports(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 25));
}

function createExtensionContext(): any {
  return {
    subscriptions: [],
    workspaceState: {},
    globalState: {},
    extensionPath: '/extension',
    extensionUri: undefined,
    storageUri: undefined,
    globalStorageUri: undefined,
    logUri: undefined,
    extensionMode: 1,
    asAbsolutePath: (relativePath: string) => `/extension/${relativePath}`,
  };
}

describe('extension smoke', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    vscode.workspace.workspaceFolders = [
      {
        name: 'demo',
        uri: vscode.Uri.file('/workspace/demo'),
        index: 0,
      },
    ] as any;
  });

  it('should activate and register the full command surface', async () => {
    const vscode = await import('vscode');
    const { activate } = await import('../src/extension');
    const { eventBus } = await import('../src/core/eventBus');
    const context = createExtensionContext();
    context.extensionUri = vscode.Uri.file('/extension');
    context.globalStorageUri = vscode.Uri.file('/extension/storage');
    context.logUri = vscode.Uri.file('/extension/log');
    const api = activate(context);

    await flushImports();

    expect(api.apiVersion).toBe(1);
    expect(detectorActivate).toHaveBeenCalledTimes(1);
    expect(createDeviceStatusBar).toHaveBeenCalledTimes(1);
    expect(await api.getDevices()).toEqual([
      { id: 'emulator-5554', name: 'emulator-5554', type: 'emulator', status: 'online' },
    ]);

    const registeredCommands = new Set((vscode as any).__getRegisteredCommands());
    const missingCommands = Object.values(COMMANDS).filter((command) => !registeredCommands.has(command));
    expect(missingCommands).toEqual([]);

    const received: any[] = [];
    const sub = api.onDeviceChanged((event) => received.push(event));
    eventBus.emit('device:connected', { id: 'device-001', name: 'device-001', type: 'device' });
    eventBus.emit('device:disconnected', { id: 'device-001' });
    sub.dispose();

    expect(received).toEqual([
      { id: 'device-001', name: 'device-001', type: 'device', status: 'online', change: 'connected' },
      { id: 'device-001', status: 'offline', change: 'disconnected' },
    ]);
  });

  it('should route key commands to their feature modules without losing arguments', async () => {
    const vscode = await import('vscode');
    const { activate } = await import('../src/extension');
    const context = createExtensionContext();
    context.extensionUri = vscode.Uri.file('/extension');
    context.globalStorageUri = vscode.Uri.file('/extension/storage');
    context.logUri = vscode.Uri.file('/extension/log');
    activate(context);
    await flushImports();

    await vscode.commands.executeCommand(COMMANDS.SELECT_DEVICE);
    await vscode.commands.executeCommand(COMMANDS.USE_DEVICE, { id: 'device-C' });
    await vscode.commands.executeCommand(COMMANDS.BUILD_AND_RUN);
    await vscode.commands.executeCommand(COMMANDS.OPEN_CONTROL_CENTER);
    await vscode.commands.executeCommand(COMMANDS.UI_INSPECTOR, 'device-A');
    await vscode.commands.executeCommand(COMMANDS.DEVICE_MIRROR, 'device-B');
    await vscode.commands.executeCommand(COMMANDS.OPEN_WEBVIEW_DEVTOOLS, 'device-W');
    await vscode.commands.executeCommand(COMMANDS.TAKE_SCREENSHOT, { id: 'device-D' });
    await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
    await vscode.commands.executeCommand(COMMANDS.VIEW_DEVICES);
    await vscode.commands.executeCommand(COMMANDS.DEBUG_APP);

    expect(promptAndSelectDevice).toHaveBeenCalledTimes(1);
    expect(selectDeviceById).toHaveBeenCalledWith('device-C');
    expect(buildAndRun).toHaveBeenCalledWith({ openInspector: true });
    expect(buildAndRun).toHaveBeenCalledTimes(2);
    expect(openUIInspector).toHaveBeenCalledWith('device-A');
    expect(openDeviceMirror).toHaveBeenCalledWith('device-B');
    expect(openWebViewDevTools).toHaveBeenCalledWith('device-W');
    expect(takeDeviceScreenshot).toHaveBeenCalledWith({ id: 'device-D' });
    expect(checkEnvironment).toHaveBeenCalledTimes(1);
    expect(deviceTreeRefresh).toHaveBeenCalledTimes(1);

    const debugSessions = (vscode as any).__getDebugSessions();
    expect(debugSessions).toHaveLength(1);
    expect(debugSessions[0].config).toMatchObject({
      type: 'harmonyos',
      request: 'launch',
      name: 'Debug HarmonyOS App',
    });
  });

  it('should deactivate the registered module cleanly', async () => {
    const vscode = await import('vscode');
    const { activate, deactivate } = await import('../src/extension');
    const context = createExtensionContext();
    context.extensionUri = vscode.Uri.file('/extension');
    context.globalStorageUri = vscode.Uri.file('/extension/storage');
    context.logUri = vscode.Uri.file('/extension/log');
    activate(context);
    await flushImports();

    await deactivate();

    expect(detectorDeactivate).toHaveBeenCalledTimes(1);
  });

  it('should survive repeated activate/deactivate cycles without leaking registrations', async () => {
    const vscode = await import('vscode');
    const { activate, deactivate } = await import('../src/extension');

    for (let cycle = 0; cycle < 20; cycle += 1) {
      (vscode as any).__reset();
      vscode.workspace.workspaceFolders = [
        {
          name: 'demo',
          uri: vscode.Uri.file('/workspace/demo'),
          index: 0,
        },
      ] as any;

      const context = createExtensionContext();
      context.extensionUri = vscode.Uri.file('/extension');
      context.globalStorageUri = vscode.Uri.file('/extension/storage');
      context.logUri = vscode.Uri.file('/extension/log');

      activate(context);
      await flushImports();

      expect((vscode as any).__getRegisteredCommands().length).toBeGreaterThan(0);

      await deactivate();
      [...context.subscriptions].reverse().forEach((subscription: any) => subscription?.dispose?.());

      expect((vscode as any).__getRegisteredCommands()).toEqual([]);
    }

    expect(detectorActivate).toHaveBeenCalledTimes(20);
    expect(detectorDeactivate).toHaveBeenCalledTimes(20);
  });
});
