import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveHdcPath = vi.fn<() => Promise<string>>();
const mockListHdcTargets = vi.fn<() => Promise<string[]>>();
const mockExecHdc = vi.fn<() => Promise<{ stdout: string; stderr: string }>>();
const mockCoerceHdcCommandError = vi.fn((error: unknown) => error);
const mockDescribeHdcCommandError = vi.fn((error: unknown) => error instanceof Error ? error.message : String(error));

vi.mock('../src/utils/config', () => ({
  resolveHdcPath: mockResolveHdcPath,
}));

vi.mock('../src/utils/hdc', () => ({
  buildHdcTargetArgs: (deviceId?: string) => deviceId ? ['-t', deviceId] : [],
  listHdcTargets: mockListHdcTargets,
  execHdc: mockExecHdc,
  coerceHdcCommandError: mockCoerceHdcCommandError,
  describeHdcCommandError: mockDescribeHdcCommandError,
}));

describe('probeHdcEnvironment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveHdcPath.mockResolvedValue('/mock/hdc');
  });

  it('marks online targets whose shell is still unavailable', async () => {
    mockListHdcTargets.mockResolvedValue(['127.0.0.1:5555', '192.168.0.2:8710']);
    mockExecHdc
      .mockResolvedValueOnce({ stdout: '/', stderr: '' })
      .mockRejectedValueOnce(new Error('shell probe timeout'));

    const { probeHdcEnvironment } = await import('../src/utils/hdcProbe');
    const result = await probeHdcEnvironment();

    expect(result.ok).toBe(true);
    expect(result.targets).toEqual(['127.0.0.1:5555', '192.168.0.2:8710']);
    expect(result.targetProbes).toEqual([
      {
        deviceId: '127.0.0.1:5555',
        shellReady: true,
      },
      {
        deviceId: '192.168.0.2:8710',
        shellReady: false,
        error: expect.any(Error),
        message: 'shell probe timeout',
      },
    ]);
  });

  it('returns a machine-level failure when list targets cannot be reached', async () => {
    const listError = new Error('Connect server failed');
    mockListHdcTargets.mockRejectedValue(listError);

    const { probeHdcEnvironment } = await import('../src/utils/hdcProbe');
    const result = await probeHdcEnvironment();

    expect(result.ok).toBe(false);
    expect(result.hdcPath).toBe('/mock/hdc');
    expect(result.error).toBe(listError);
    expect(result.targets).toEqual([]);
    expect(result.targetProbes).toEqual([]);
  });
});
