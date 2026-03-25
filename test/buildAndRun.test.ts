import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../src/utils/constants';

const mockExec = vi.fn();
const mockFindBuiltHapFiles = vi.fn();
const mockReadBundleName = vi.fn();
const mockReadEntryAbility = vi.fn();
const mockExecHdc = vi.fn();
const mockGetConnectedDeviceState = vi.fn();
const mockChooseAutoDevice = vi.fn();
const mockPickConnectedDevice = vi.fn();
const mockSetActiveDeviceId = vi.fn();
const mockResolveSigningProfileInfo = vi.fn();
const mockSyncAppBundleNameToSigningProfile = vi.fn();
const mockResolveAssembleHapPreflight = vi.fn();

vi.mock('child_process', () => ({
  exec: mockExec,
}));

vi.mock('../src/utils/projectMetadata', () => ({
  findBuiltHapFiles: mockFindBuiltHapFiles,
  readBundleName: mockReadBundleName,
  readEntryAbility: mockReadEntryAbility,
}));

vi.mock('../src/utils/hdc', () => ({
  buildHdcTargetArgs: (deviceId?: string) => (deviceId ? ['-t', deviceId] : []),
  execHdc: mockExecHdc,
}));

vi.mock('../src/device/devices', () => ({
  getConnectedDeviceState: mockGetConnectedDeviceState,
  chooseAutoDevice: mockChooseAutoDevice,
  pickConnectedDevice: mockPickConnectedDevice,
  setActiveDeviceId: mockSetActiveDeviceId,
}));

vi.mock('../src/project/signingProfile', () => ({
  resolveSigningProfileInfo: mockResolveSigningProfileInfo,
  syncAppBundleNameToSigningProfile: mockSyncAppBundleNameToSigningProfile,
}));

vi.mock('../src/build/preflight', () => ({
  resolveAssembleHapPreflight: mockResolveAssembleHapPreflight,
}));

describe('buildAndRun', () => {
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

    mockExec.mockImplementation((_command: string, _options: any, callback: (error: unknown, stdout: string, stderr: string) => void) => {
      callback(null, 'BUILD OK', '');
      return { kill: vi.fn() };
    });
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: './hvigorw assembleHap --no-daemon',
        source: 'project',
        executablePath: '/workspace/demo/hvigorw',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw',
          exists: true,
          missingRuntimePaths: [],
          warnings: [],
        },
        warnings: [],
      },
      warnings: [],
    });
    mockFindBuiltHapFiles.mockResolvedValue([{ fsPath: '/workspace/demo/entry/build/default/outputs/default/app.hap' }]);
    mockReadBundleName.mockResolvedValue('com.example.myapplication');
    mockReadEntryAbility.mockResolvedValue('EntryAbility');
    mockChooseAutoDevice.mockImplementation((devices: any[], preferredId?: string) =>
      devices.find((device) => device.id === preferredId) ?? (devices.length === 1 ? devices[0] : undefined),
    );
    mockResolveSigningProfileInfo.mockResolvedValue(undefined);
    mockSyncAppBundleNameToSigningProfile.mockResolvedValue(undefined);
  });

  it('shows Launch Emulator & Run when no devices are online', async () => {
    const vscode = await import('vscode');
    mockGetConnectedDeviceState.mockResolvedValue({ devices: [] });
    const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Launch Emulator & Run' as any);

    const { buildAndRun } = await import('../src/build/buildAndRun');
    const result = await buildAndRun({ openInspector: true });

    expect(warningSpy).toHaveBeenCalledWith(
      'No HarmonyOS devices connected. Launch an emulator, connect a Wi-Fi device, or fix the environment before running the app.',
      'Connect Wi-Fi Device',
      'Launch Emulator & Run',
      'Select Device',
      'Check Environment',
    );
    expect((vscode as any).__getExecutedCommands()).toContainEqual({
      command: COMMANDS.LAUNCH_EMULATOR_AND_RUN,
      args: [],
    });
    expect(mockExec).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      stage: 'device',
    });
  });

  it('offers copyable local signing recovery steps when preflight finds reusable signing materials', async () => {
    const vscode = await import('vscode');
    mockGetConnectedDeviceState.mockResolvedValue({
      devices: [
        { id: 'usb-001', name: 'usb-001', type: 'device', status: 'online' },
      ],
    });
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: './hvigorw assembleHap --no-daemon',
        source: 'project',
        executablePath: '/workspace/demo/hvigorw',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw',
          exists: true,
          missingRuntimePaths: [],
          warnings: [],
        },
        warnings: [],
      },
      blockingMessage: 'broken signing',
      warnings: ['本机已发现可用签名材料: auto_ohos_123_com.demo.app'],
      signingRecoveryHint: {
        message: '检测到当前机器上有可用的本地签名材料，可直接复用到 build-profile.json5。',
        steps: ['replace profile', 'replace storeFile', 'replace certpath'],
        copyText: 'profile: "/tmp/local/profile.p7b"',
      },
    });
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue('Copy Signing Paths' as any);
    const clipboardSpy = vi.spyOn(vscode.env.clipboard, 'writeText');

    const { buildAndRun } = await import('../src/build/buildAndRun');
    const result = await buildAndRun({ postLaunchAction: 'none' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith(
      'broken signing',
      'Copy Signing Paths',
      'Open build-profile.json5',
      'Check Environment',
      'Open Build Log',
    );
    expect(clipboardSpy).toHaveBeenCalledWith('profile: "/tmp/local/profile.p7b"');
    expect(result).toMatchObject({
      ok: false,
      stage: 'build',
      message: 'broken signing',
    });
  });

  it('does not fall through to another online device when preferredDeviceId is missing', async () => {
    const vscode = await import('vscode');
    mockGetConnectedDeviceState.mockResolvedValue({
      devices: [
        { id: 'usb-001', name: 'usb-001', type: 'device', status: 'online' },
      ],
    });
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);

    const { buildAndRun } = await import('../src/build/buildAndRun');
    const result = await buildAndRun({ preferredDeviceId: '127.0.0.1:5555', postLaunchAction: 'none' });

    expect(errorSpy).toHaveBeenCalledWith('Target device is no longer online: 127.0.0.1:5555');
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockExecHdc).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      stage: 'device',
      message: 'Target device is no longer online: 127.0.0.1:5555',
    });
  });

  it('retries install once for an emulator target before launching the app', async () => {
    mockGetConnectedDeviceState.mockResolvedValue({
      devices: [
        { id: '127.0.0.1:5555', name: 'Mate 70 Pro', type: 'emulator', status: 'online' },
      ],
    });
    mockExecHdc
      .mockRejectedValueOnce(new Error('device warming up'))
      .mockResolvedValueOnce({ stdout: 'install ok', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'launch ok', stderr: '' });

    const { buildAndRun } = await import('../src/build/buildAndRun');
    const result = await buildAndRun({ postLaunchAction: 'none' });

    expect(mockSetActiveDeviceId).toHaveBeenCalledWith('127.0.0.1:5555');
    expect(mockExecHdc).toHaveBeenNthCalledWith(
      1,
      ['-t', '127.0.0.1:5555', 'install', '/workspace/demo/entry/build/default/outputs/default/app.hap'],
      { timeout: 30_000 },
    );
    expect(mockExecHdc).toHaveBeenNthCalledWith(
      2,
      ['-t', '127.0.0.1:5555', 'install', '/workspace/demo/entry/build/default/outputs/default/app.hap'],
      { timeout: 30_000 },
    );
    expect(mockExecHdc).toHaveBeenNthCalledWith(
      3,
      ['-t', '127.0.0.1:5555', 'shell', "aa start -a 'EntryAbility' -b 'com.example.myapplication'"],
      { timeout: 10_000 },
    );
    expect(result).toMatchObject({
      ok: true,
      stage: 'completed',
      deviceId: '127.0.0.1:5555',
      hapPath: '/workspace/demo/entry/build/default/outputs/default/app.hap',
    });
  });
});
