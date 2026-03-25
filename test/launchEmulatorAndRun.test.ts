import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnsureEmulatorTarget = vi.fn();
const mockBuildAndRun = vi.fn();

vi.mock('../src/device/emulatorManager', () => ({
  ensureEmulatorTarget: mockEnsureEmulatorTarget,
}));

vi.mock('../src/build/buildAndRun', () => ({
  buildAndRun: mockBuildAndRun,
}));

describe('launchEmulatorAndRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an emulator-stage failure when no target becomes ready', async () => {
    mockEnsureEmulatorTarget.mockResolvedValue(undefined);

    const { launchEmulatorAndRun } = await import('../src/device/launchEmulatorAndRun');
    const result = await launchEmulatorAndRun('Mate 70 Pro');

    expect(result).toEqual({
      ok: false,
      stage: 'emulator',
      message: 'Emulator "Mate 70 Pro" was not ready for launch.',
    });
    expect(mockBuildAndRun).not.toHaveBeenCalled();
  });

  it('preserves emulator metadata on a successful build and run result', async () => {
    mockEnsureEmulatorTarget.mockResolvedValue({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: true,
    });
    mockBuildAndRun.mockResolvedValue({
      ok: true,
      stage: 'completed',
      message: 'App is running on device. UI Inspector opened.',
      deviceId: '127.0.0.1:5555',
      hapPath: '/workspace/demo/app.hap',
    });

    const { launchEmulatorAndRun } = await import('../src/device/launchEmulatorAndRun');
    const result = await launchEmulatorAndRun('Mate 70 Pro');

    expect(mockBuildAndRun).toHaveBeenCalledWith({
      preferredDeviceId: '127.0.0.1:5555',
      postLaunchAction: 'inspector',
    });
    expect(result).toEqual({
      ok: true,
      stage: 'completed',
      message: 'App is running on device. UI Inspector opened.',
      deviceId: '127.0.0.1:5555',
      hapPath: '/workspace/demo/app.hap',
      emulatorName: 'Mate 70 Pro',
      launchedNow: true,
    });
  });
});
