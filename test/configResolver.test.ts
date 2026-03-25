import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SDK_ENV_KEYS = [
  'DEVECO_SDK_HOME',
  'OHOS_BASE_SDK_HOME',
  'HarmonyOS_HOME',
  'HARMONYOS_HOME',
  'OpenHarmony_HOME',
  'OPENHARMONY_HOME',
  'HM_SDK_HOME',
] as const;

function touchExecutable(filePath: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
  return filePath;
}

describe('tool resolver cache behavior', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const vscode = await import('vscode');
    (vscode as any).__reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches configured HDC paths without reusing stale cache', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-hdc-'));
    try {
      const first = touchExecutable(path.join(root, 'first-hdc'));
      const second = touchExecutable(path.join(root, 'second-hdc'));
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', first, true);

      const { resolveHdcPath } = await import('../src/utils/config');
      expect(await resolveHdcPath()).toBe(first);

      await vscode.workspace.getConfiguration('harmony').update('hdcPath', second, true);
      expect(await resolveHdcPath()).toBe(second);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('switches configured emulator paths without reusing stale cache', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-emulator-'));
    try {
      const first = touchExecutable(path.join(root, 'emulator-a'));
      const second = touchExecutable(path.join(root, 'emulator-b'));
      await vscode.workspace.getConfiguration('harmony').update('emulatorPath', first, true);

      const { resolveEmulatorPath } = await import('../src/utils/config');
      expect(await resolveEmulatorPath()).toBe(first);

      await vscode.workspace.getConfiguration('harmony').update('emulatorPath', second, true);
      expect(await resolveEmulatorPath()).toBe(second);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('re-resolves HDC when sdkSearchPaths changes', async () => {
    if (process.platform !== 'darwin') {
      return;
    }

    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-search-roots-'));
    const previousPath = process.env.PATH;
    try {
      const firstRoot = path.join(root, 'sdk-a');
      const secondRoot = path.join(root, 'sdk-b');
      const firstHdc = touchExecutable(path.join(firstRoot, 'default', 'openharmony', 'toolchains', 'hdc'));
      const secondHdc = touchExecutable(path.join(secondRoot, 'default', 'openharmony', 'toolchains', 'hdc'));
      process.env.PATH = '';
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', '', true);
      await vscode.workspace.getConfiguration('harmony').update('sdkSearchPaths', [firstRoot], true);

      const { resolveHdcPath } = await import('../src/utils/config');
      expect(await resolveHdcPath()).toBe(firstHdc);

      await vscode.workspace.getConfiguration('harmony').update('sdkSearchPaths', [secondRoot], true);
      expect(await resolveHdcPath()).toBe(secondHdc);
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers configured sdkSearchPaths over PATH lookups for HDC', async () => {
    if (process.platform !== 'darwin') {
      return;
    }

    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-priority-'));
    const previousPath = process.env.PATH;
    try {
      const pathRoot = path.join(root, 'path-bin');
      const sdkRoot = path.join(root, 'sdk-root');
      const pathHdc = touchExecutable(path.join(pathRoot, 'hdc'));
      const configuredHdc = touchExecutable(path.join(sdkRoot, 'default', 'openharmony', 'toolchains', 'hdc'));

      process.env.PATH = pathRoot;
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', '', true);
      await vscode.workspace.getConfiguration('harmony').update('sdkSearchPaths', [sdkRoot], true);

      const { resolveHdcPath } = await import('../src/utils/config');
      expect(await resolveHdcPath()).toBe(configuredHdc);
      expect(await resolveHdcPath()).not.toBe(pathHdc);
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('survives 128 concurrent hvigor resolutions backed by the same configured path', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-hvigor-'));
    try {
      const hvigor = touchExecutable(path.join(root, process.platform === 'win32' ? 'hvigorw.bat' : 'hvigorw'));
      await vscode.workspace.getConfiguration('harmony').update('hvigorPath', hvigor, true);

      const { resolveHvigorPath } = await import('../src/utils/config');
      const results = await Promise.all(Array.from({ length: 128 }, () => resolveHvigorPath()));

      expect(new Set(results)).toEqual(new Set([hvigor]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat a generic PATH emulator as the DevEco emulator fallback', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-path-emulator-'));
    const previousPath = process.env.PATH;
    try {
      const pathEmulator = touchExecutable(path.join(root, process.platform === 'win32' ? 'emulator.exe' : 'emulator'));
      process.env.PATH = `${root}${path.delimiter}${previousPath ?? ''}`;

      const { resolveEmulatorPath } = await import('../src/utils/config');
      expect(await resolveEmulatorPath()).not.toBe(pathEmulator);
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds DevEco default openharmony hdc under an SDK root even when the root is not versioned', async () => {
    if (process.platform !== 'darwin') {
      return;
    }

    const vscode = await import('vscode');
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-home-'));
    const previousHome = process.env.HOME;
    const previousPath = process.env.PATH;
    const previousSdkEnvs = new Map<string, string | undefined>(
      SDK_ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    try {
      process.env.HOME = fakeHome;
      process.env.PATH = '';
      for (const key of SDK_ENV_KEYS) {
        delete process.env[key];
      }
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', '', true);

      const hdc = touchExecutable(path.join(fakeHome, 'Library', 'OpenHarmony', 'Sdk', 'default', 'openharmony', 'toolchains', 'hdc'));
      const { resolveHdcPath } = await import('../src/utils/config');

      expect(await resolveHdcPath()).toBe(hdc);
    } finally {
      process.env.HOME = previousHome;
      process.env.PATH = previousPath;
      for (const [key, value] of previousSdkEnvs) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('finds hdc from HarmonyOS_HOME hmscore layouts exposed via environment variables', async () => {
    if (process.platform !== 'darwin') {
      return;
    }

    const vscode = await import('vscode');
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-config-hmscore-home-'));
    const previousHome = process.env.HOME;
    const previousPath = process.env.PATH;
    const previousSdkEnvs = new Map<string, string | undefined>(
      SDK_ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    try {
      process.env.HOME = fakeHome;
      process.env.PATH = '';
      for (const key of SDK_ENV_KEYS) {
        delete process.env[key];
      }
      process.env.HarmonyOS_HOME = path.join(fakeHome, 'HarmonyOSSdk');
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', '', true);

      const hdc = touchExecutable(path.join(fakeHome, 'HarmonyOSSdk', 'hmscore', '20', 'toolchains', 'hdc'));
      const { resolveHdcPath } = await import('../src/utils/config');

      expect(await resolveHdcPath()).toBe(hdc);
    } finally {
      process.env.HOME = previousHome;
      process.env.PATH = previousPath;
      for (const [key, value] of previousSdkEnvs) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
