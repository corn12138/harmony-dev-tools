import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../src/utils/constants';

vi.mock('../src/device/devices', () => ({
  getConnectedDeviceState: vi.fn(async () => ({
    devices: [
      { id: 'emulator-5554', name: 'emulator-5554', type: 'emulator', status: 'online' as const },
    ],
  })),
  getActiveDeviceId: vi.fn(() => 'emulator-5554'),
  chooseAutoDevice: vi.fn((devices: any[], preferredId?: string) =>
    devices.find((device) => device.id === preferredId) ?? devices[0],
  ),
}));

describe('control center', () => {
  beforeEach(async () => {
    const vscode = await import('vscode');
    (vscode as any).__reset();
  });

  it('dispatches the selected quick action command', async () => {
    const vscode = await import('vscode');
    const buildAndRun = vi.fn(async () => undefined);
    vscode.commands.registerCommand(COMMANDS.BUILD_AND_RUN, buildAndRun);

    const { openControlCenter } = await import('../src/home/controlCenter');
    await openControlCenter();

    expect(buildAndRun).toHaveBeenCalledTimes(1);
  });
});
