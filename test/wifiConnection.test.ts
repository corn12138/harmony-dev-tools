import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecHdc = vi.fn<(...args: any[]) => Promise<any>>();
const mockListHdcTargets = vi.fn<(...args: any[]) => Promise<string[]>>();
const mockSetActiveDeviceId = vi.fn<(deviceId?: string) => void>();

vi.mock('../src/utils/hdc', () => ({
  execHdc: mockExecHdc,
  listHdcTargets: mockListHdcTargets,
}));

vi.mock('../src/device/devices', () => ({
  setActiveDeviceId: mockSetActiveDeviceId,
}));

describe('wifiConnection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    await vscode.workspace.getConfiguration('harmony').update('wifiDefaultPort', 5555, true);
    mockExecHdc.mockResolvedValue({ stdout: '', stderr: '' });
    mockListHdcTargets.mockResolvedValue(['192.168.1.88:5555']);
  });

  it('normalizes a host without port to the default HDC Wi-Fi port', async () => {
    const { normalizeWifiDeviceTarget } = await import('../src/device/wifiConnection');
    expect(normalizeWifiDeviceTarget('192.168.1.88')).toBe('192.168.1.88:5555');
  });

  it('uses the configured Wi-Fi default port when no explicit port is provided', async () => {
    const vscode = await import('vscode');
    await vscode.workspace.getConfiguration('harmony').update('wifiDefaultPort', 22345, true);

    const { normalizeWifiDeviceTarget } = await import('../src/device/wifiConnection');
    expect(normalizeWifiDeviceTarget('192.168.1.88')).toBe('192.168.1.88:22345');
    expect(normalizeWifiDeviceTarget('fe80::1')).toBe('[fe80::1]:22345');
  });

  it('runs hdc tconn, activates the target, and offers next actions', async () => {
    const vscode = await import('vscode');
    vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValueOnce('Build & Run' as any);

    const { connectWifiDevice } = await import('../src/device/wifiConnection');
    await connectWifiDevice('192.168.1.88');

    expect(mockExecHdc).toHaveBeenCalledWith(['tconn', '192.168.1.88:5555'], { timeout: 10_000 });
    expect(mockSetActiveDeviceId).toHaveBeenCalledWith('192.168.1.88:5555');
    expect((vscode as any).__getExecutedCommands()).toContainEqual({
      command: 'harmony.buildAndRun',
      args: [],
    });
  });

  it('prefills the input box with the last successful Wi-Fi target', async () => {
    const vscode = await import('vscode');
    const inputSpy = vi.spyOn(vscode.window, 'showInputBox');
    const rememberedState: Record<string, unknown> = {};

    const { connectWifiDevice, initializeWifiConnectionStorage } = await import('../src/device/wifiConnection');
    initializeWifiConnectionStorage(rememberedState);

    inputSpy.mockResolvedValueOnce('192.168.1.88:5555');
    await connectWifiDevice();
    expect(rememberedState['harmony.lastSuccessfulWifiTarget']).toBe('192.168.1.88:5555');

    inputSpy.mockResolvedValueOnce(undefined);
    await connectWifiDevice();
    expect(inputSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      value: '192.168.1.88:5555',
    }));
  });

  it('treats an already-known HDC target as connected even if tconn exits with an error', async () => {
    mockExecHdc.mockRejectedValueOnce(new Error('target already connected'));
    mockListHdcTargets.mockResolvedValue(['192.168.1.88:5555']);

    const { connectWifiDevice } = await import('../src/device/wifiConnection');
    const result = await connectWifiDevice('192.168.1.88:5555');

    expect(result).toBe('192.168.1.88:5555');
    expect(mockSetActiveDeviceId).toHaveBeenCalledWith('192.168.1.88:5555');
  });
});
