import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveAssembleHapPreflight = vi.fn();
const mockResolveHdcPath = vi.fn(async () => '/mock/hdc');
const mockReadBundleName = vi.fn(async () => 'com.demo.app');
const mockReadEntryAbility = vi.fn(async () => 'EntryAbility');
const mockEnsureConnectedDevice = vi.fn(async () => ({
  id: 'emulator-5554',
  name: 'emulator-5554',
  type: 'emulator' as const,
  status: 'online' as const,
}));

vi.mock('../src/build/preflight', () => ({
  resolveAssembleHapPreflight: mockResolveAssembleHapPreflight,
}));

vi.mock('../src/utils/config', () => ({
  resolveHdcPath: mockResolveHdcPath,
}));

vi.mock('../src/utils/projectMetadata', () => ({
  readBundleName: mockReadBundleName,
  readEntryAbility: mockReadEntryAbility,
}));

vi.mock('../src/device/devices', () => ({
  ensureConnectedDevice: mockEnsureConnectedDevice,
}));

vi.mock('../src/utils/hdc', () => ({
  buildHdcTargetArgs: (deviceId: string) => ['-t', deviceId],
  buildHdcTerminalCommand: (hdc: string, args: string[]) => [hdc, ...args].join(' '),
  rawTerminalArg: (value: string) => value,
}));

describe('terminal build runner hvigor fallback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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

  it('sends the resolved external hvigor command to the integrated terminal', async () => {
    const vscode = await import('vscode');
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: "'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' assembleHap --no-daemon",
        executablePath: '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw',
        source: 'external',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw',
          exists: true,
          missingRuntimePaths: ['/workspace/demo/hvigor/hvigor-wrapper.js'],
          warnings: [],
        },
        warnings: ['broken local wrapper'],
      },
      warnings: ['broken local wrapper'],
    });

    const { terminalBuildAndRun } = await import('../src/build/terminalRunner');
    await terminalBuildAndRun();

    const terminals = (vscode as any).__getCreatedTerminals();
    expect(terminals).toHaveLength(1);
    const command = terminals[0].sentText[0].text;
    expect(command).toContain("'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' assembleHap --no-daemon");
    expect(command).toContain('/mock/hdc -t emulator-5554 install "$HAP_FILE"');
    expect(command).toContain('/mock/hdc -t emulator-5554 shell aa start -a EntryAbility -b com.demo.app');
  });

  it('shows a preflight error and does not create a terminal when no hvigor is available', async () => {
    const vscode = await import('vscode');
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: 'chmod +x ./hvigorw 2>/dev/null && ./hvigorw assembleHap --no-daemon',
        executablePath: undefined,
        source: 'project',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw',
          exists: false,
          missingRuntimePaths: [],
          warnings: [],
        },
        warnings: [],
      },
      warnings: [],
      blockingMessage: 'broken signing',
    });

    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage');
    const { terminalBuildAndRun } = await import('../src/build/terminalRunner');
    await terminalBuildAndRun();

    expect(errorSpy).toHaveBeenCalledWith('broken signing');
    expect((vscode as any).__getCreatedTerminals()).toHaveLength(0);
  });
});
