import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../src/utils/constants';

const mockListHdcTargets = vi.fn();
const mockPromptHdcConfiguration = vi.fn();

class MockHdcCommandError extends Error {
  constructor(
    message: string,
    public readonly kind: string = 'connect-failed',
    public readonly binary: string = 'hdc',
    public readonly args: string[] = ['list', 'targets'],
  ) {
    super(message);
  }
}

vi.mock('../src/utils/config', () => ({
  promptHdcConfiguration: mockPromptHdcConfiguration,
}));

vi.mock('../src/utils/hdc', () => ({
  HdcCommandError: MockHdcCommandError,
  coerceHdcCommandError: (error: unknown) => error,
  describeHdcCommandError: (error: Error) => error.message,
  listHdcTargets: mockListHdcTargets,
}));

describe('device selection prompts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    mockListHdcTargets.mockResolvedValue([]);
  });

  it('promptAndSelectDevice does not block when no devices are available', async () => {
    const vscode = await import('vscode');
    const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockImplementation(
      () => new Promise(() => {}),
    );
    const { promptAndSelectDevice } = await import('../src/device/devices');

    const result = await Promise.race([
      promptAndSelectDevice().then(() => 'resolved'),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 25)),
    ]);

    expect(result).toBe('resolved');
    expect(warningSpy).toHaveBeenCalledWith(
      'No HarmonyOS devices connected. Connect a device via USB, Wi-Fi, or start an emulator.',
      'Connect Wi-Fi Device',
      'Check Environment',
    );
  });

  it('ensureConnectedDevice still waits for no-device actions and forwards Wi-Fi connect', async () => {
    const vscode = await import('vscode');
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Connect Wi-Fi Device' as any);
    vscode.commands.registerCommand(COMMANDS.CONNECT_WIFI_DEVICE, () => undefined);

    const { ensureConnectedDevice } = await import('../src/device/devices');
    const device = await ensureConnectedDevice();

    expect(device).toBeUndefined();
    expect((vscode as any).__getExecutedCommands()).toContainEqual({
      command: COMMANDS.CONNECT_WIFI_DEVICE,
      args: [],
    });
  });
});
