import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockListHdcTargets = vi.fn();
const mockExecHdc = vi.fn();
const mockResolveEmulatorPath = vi.fn();
const mockGetDevEcoStudioSearchPaths = vi.fn();
const mockGetEmulatorSearchPaths = vi.fn();
const mockGetSdkPath = vi.fn();
const mockGetSdkSearchPaths = vi.fn();
const mockGetEmulatorSearchDirs = vi.fn();
const mockGetEmulatorDeployedRoots = vi.fn();
const mockGetEmulatorImageRootCandidates = vi.fn();
const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
const mockSetActiveDeviceId = vi.fn();

vi.mock('../src/utils/hdc', () => ({
  buildHdcTargetArgs: (deviceId?: string) => (deviceId ? ['-t', deviceId] : []),
  execHdc: mockExecHdc,
  listHdcTargets: mockListHdcTargets,
}));

vi.mock('../src/utils/config', () => ({
  getDevEcoStudioSearchPaths: mockGetDevEcoStudioSearchPaths,
  getEmulatorSearchPaths: mockGetEmulatorSearchPaths,
  getSdkPath: mockGetSdkPath,
  getSdkSearchPaths: mockGetSdkSearchPaths,
  resolveEmulatorPath: mockResolveEmulatorPath,
}));

vi.mock('../src/utils/toolPaths', () => ({
  getEmulatorSearchDirs: mockGetEmulatorSearchDirs,
  getEmulatorDeployedRoots: mockGetEmulatorDeployedRoots,
  getEmulatorImageRootCandidates: mockGetEmulatorImageRootCandidates,
}));

vi.mock('../src/device/devices', () => ({
  setActiveDeviceId: mockSetActiveDeviceId,
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  execFile: mockExecFile,
}));

function createFakeProcess(): EventEmitter & {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    kill: ReturnType<typeof vi.fn>;
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    child.emit('exit', null);
    return true;
  });
  return child;
}

function createEmulatorImage(root: string, name: string): string {
  const emulatorDir = path.join(root, name);
  fs.mkdirSync(emulatorDir, { recursive: true });
  fs.writeFileSync(
    path.join(emulatorDir, 'config.ini'),
    [
      'hw.cpu.arch=x86_64',
      `instancePath=${emulatorDir}`,
      'imageSubPath=system-image/HarmonyOS-6.0.0/phone_all_arm/',
    ].join('\n'),
    'utf8',
  );
  return emulatorDir;
}

function writeEmulatorBridgePort(root: string, name: string, port: number): void {
  fs.writeFileSync(
    path.join(root, name, 'qemu.log'),
    `2026-03-25 I [express_bridge.c(bridge_socket_listen:115)] listen bridge socket port ${port}\n`,
    'utf8',
  );
}

describe('emulatorManager', () => {
  let tempHome: string;
  let emulatorRoot: string;
  let sdkRoot: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;
  let previousLocalAppData: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useRealTimers();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-emulator-manager-home-'));
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    process.env.LOCALAPPDATA = path.join(tempHome, 'AppData', 'Local');

    emulatorRoot = path.join(tempHome, '.Huawei', 'Emulator', 'deployed');
    sdkRoot = path.join(tempHome, 'Library', 'Huawei', 'Sdk');
    fs.mkdirSync(path.join(sdkRoot, 'system-image', 'HarmonyOS-6.0.0', 'phone_all_arm'), { recursive: true });
    createEmulatorImage(emulatorRoot, 'Mate 70 Pro');
    await vscode.workspace.getConfiguration('harmony').update('sdkPath', sdkRoot, true);
    mockGetEmulatorSearchDirs.mockReturnValue([emulatorRoot]);
    mockGetEmulatorDeployedRoots.mockReturnValue([emulatorRoot]);
    mockGetEmulatorImageRootCandidates.mockReturnValue([sdkRoot]);
    mockGetDevEcoStudioSearchPaths.mockReturnValue([]);
    mockGetEmulatorSearchPaths.mockReturnValue([]);
    mockGetSdkPath.mockReturnValue(sdkRoot);
    mockGetSdkSearchPaths.mockReturnValue([]);
    mockResolveEmulatorPath.mockResolvedValue('/mock/emulator');
    mockExecFile.mockImplementation((_file: string, _args: string[], _options: any, callback: (error: unknown, stdout: string, stderr: string) => void) => {
      callback(null, 'Mate 70 Pro\n', '');
    });
    mockSpawn.mockImplementation(() => createFakeProcess());
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.HOME = previousHome;
    process.env.USERPROFILE = previousUserProfile;
    process.env.LOCALAPPDATA = previousLocalAppData;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('reuses an already running emulator target and makes it active', async () => {
    mockListHdcTargets.mockResolvedValue(['127.0.0.1:5555']);
    mockExecHdc.mockResolvedValue({ stdout: '/', stderr: '' });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const result = await ensureEmulatorTarget({ waitForShellReady: true });

    expect(result).toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: false,
    });
    expect(mockExecHdc).toHaveBeenCalledWith(['-t', '127.0.0.1:5555', 'shell', 'pwd'], { timeout: 5000 });
    expect(mockSetActiveDeviceId).toHaveBeenCalledWith('127.0.0.1:5555');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('reuses a shell-ready hinted target before attempting a fresh emulator launch', async () => {
    writeEmulatorBridgePort(emulatorRoot, 'Mate 70 Pro', 5555);
    mockListHdcTargets.mockResolvedValue([]);
    mockExecHdc.mockResolvedValue({ stdout: '/\n', stderr: '' });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const result = await ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    expect(result).toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: false,
    });
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockSetActiveDeviceId).toHaveBeenCalledWith('127.0.0.1:5555');
  });

  it('launches an offline emulator and waits until HDC and shell are ready', async () => {
    mockListHdcTargets
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['127.0.0.1:5555']);
    mockExecHdc.mockResolvedValue({ stdout: '/', stderr: '' });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const result = await ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    expect(result).toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: true,
    });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      '/mock/emulator',
      [
        '-hvd',
        'Mate 70 Pro',
        '-path',
        emulatorRoot,
        '-imageRoot',
        sdkRoot,
      ],
      expect.objectContaining({
        shell: false,
      }),
    );
    expect(mockExecHdc).toHaveBeenCalledWith(['-t', '127.0.0.1:5555', 'shell', 'pwd'], { timeout: 5000 });
    expect(mockSetActiveDeviceId).toHaveBeenCalledWith('127.0.0.1:5555');
  });

  it('fails when shell never becomes ready even though the emulator is online in HDC', async () => {
    vi.useFakeTimers();
    const vscode = await import('vscode');
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    mockListHdcTargets.mockResolvedValue(['127.0.0.1:5555']);
    mockExecHdc.mockRejectedValue(new Error('shell unavailable'));

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const resultPromise = ensureEmulatorTarget({ waitForShellReady: true });
    await vi.advanceTimersByTimeAsync(46_000);

    await expect(resultPromise).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Emulator "Mate 70 Pro" is online in HDC, but shell did not become ready within 45 seconds.',
    );
  });

  it('reuses the same in-flight orchestration when triggered concurrently', async () => {
    vi.useFakeTimers();
    mockListHdcTargets
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['127.0.0.1:5555']);
    mockExecHdc.mockResolvedValue({ stdout: '/', stderr: '' });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const first = ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });
    const second = ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    await vi.advanceTimersByTimeAsync(5_000);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
  });

  it('reuses the named emulator target when multiple emulator targets are already online', async () => {
    mockListHdcTargets.mockResolvedValue(['127.0.0.1:5555', '127.0.0.1:5557']);
    mockExecHdc.mockImplementation(async (args: string[]) => {
      if (args.includes('const.product.model')) {
        return { stdout: args[1] === '127.0.0.1:5557' ? 'Mate 70 Pro\n' : 'nova 15 Pro\n', stderr: '' };
      }
      if (args.includes('pwd')) {
        return { stdout: '/\n', stderr: '' };
      }
      throw new Error(`unexpected hdc args: ${args.join(' ')}`);
    });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const result = await ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    expect(result).toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5557',
      launchedNow: false,
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('surfaces CLI launch diagnostics when the emulator exits before appearing in HDC', async () => {
    vi.useRealTimers();
    const vscode = await import('vscode');
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    mockSpawn.mockImplementation(() => {
      const child = createFakeProcess();
      setTimeout(() => {
        child.stderr.emit('data', Buffer.from('Unable to start the emulator\nsysmon request failed with error: sysmond service not found\n'));
        child.emit('exit', 1);
      }, 10);
      return child;
    });
    mockListHdcTargets.mockResolvedValue([]);

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const resultPromise = ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    await new Promise((resolve) => setTimeout(resolve, 2200));

    await expect(resultPromise).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Emulator "Mate 70 Pro" failed before it appeared in HDC (exit code 1).',
      'Check Environment',
      'Open Emulator Log',
    );
  }, 10_000);

  it('reuses an already-running emulator when the CLI says it already exists', async () => {
    vi.useRealTimers();
    const vscode = await import('vscode');
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    mockSpawn.mockImplementation(() => {
      const child = createFakeProcess();
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('The emulator already exists\n'));
        child.emit('exit', 1);
      }, 10);
      return child;
    });
    mockListHdcTargets
      .mockResolvedValueOnce([])
      .mockResolvedValue(['127.0.0.1:5555']);
    mockExecHdc.mockImplementation(async (args: string[]) => {
      if (args.includes('const.product.model')) {
        return { stdout: 'Mate 70 Pro\n', stderr: '' };
      }
      if (args.includes('pwd')) {
        return { stdout: '/\n', stderr: '' };
      }
      throw new Error(`unexpected hdc args: ${args.join(' ')}`);
    });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const resultPromise = ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    await new Promise((resolve) => setTimeout(resolve, 4200));

    await expect(resultPromise).resolves.toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: false,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  }, 10_000);

  it('reuses an already-running emulator via its bridge port when HDC exposes only a generic model name', async () => {
    vi.useRealTimers();
    const vscode = await import('vscode');
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    writeEmulatorBridgePort(emulatorRoot, 'Mate 70 Pro', 5555);
    mockSpawn.mockImplementation(() => {
      const child = createFakeProcess();
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('The emulator already exists\n'));
        child.emit('exit', 1);
      }, 10);
      return child;
    });
    mockListHdcTargets
      .mockResolvedValueOnce([])
      .mockResolvedValue(['127.0.0.1:5555', '127.0.0.1:5557']);
    mockExecHdc.mockImplementation(async (args: string[]) => {
      if (args.includes('const.product.model')) {
        return { stdout: 'emulator\n', stderr: '' };
      }
      if (args.includes('pwd')) {
        return { stdout: '/\n', stderr: '' };
      }
      throw new Error(`unexpected hdc args: ${args.join(' ')}`);
    });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const resultPromise = ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    await new Promise((resolve) => setTimeout(resolve, 4200));

    await expect(resultPromise).resolves.toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: false,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  }, 10_000);

  it('waits for late stdout flushes before treating an already-running emulator as a hard failure', async () => {
    vi.useRealTimers();
    const vscode = await import('vscode');
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    writeEmulatorBridgePort(emulatorRoot, 'Mate 70 Pro', 5555);
    mockSpawn.mockImplementation(() => {
      const child = createFakeProcess();
      setTimeout(() => {
        child.emit('exit', 1);
        setTimeout(() => {
          child.stdout.emit('data', Buffer.from('The emulator already exists\n'));
        }, 20);
      }, 10);
      return child;
    });
    mockListHdcTargets
      .mockResolvedValueOnce([])
      .mockResolvedValue(['127.0.0.1:5555']);
    mockExecHdc.mockImplementation(async (args: string[]) => {
      if (args.includes('pwd')) {
        return { stdout: '/\n', stderr: '' };
      }
      if (args.includes('const.product.model')) {
        return { stdout: 'emulator\n', stderr: '' };
      }
      throw new Error(`unexpected hdc args: ${args.join(' ')}`);
    });

    const { ensureEmulatorTarget } = await import('../src/device/emulatorManager');
    const resultPromise = ensureEmulatorTarget({ preferredName: 'Mate 70 Pro', waitForShellReady: true });

    await expect(resultPromise).resolves.toEqual({
      emulatorName: 'Mate 70 Pro',
      deviceId: '127.0.0.1:5555',
      launchedNow: false,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  }, 10_000);
});
