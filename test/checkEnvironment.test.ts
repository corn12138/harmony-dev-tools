import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveHvigorPath = vi.fn<() => Promise<string | null>>();
const mockResolveToolPath = vi.fn<() => Promise<string | null>>();
const mockResolveHdcPath = vi.fn<() => Promise<string>>();
const mockResolveEmulatorPath = vi.fn<() => Promise<string | null>>();
const mockDetectEmulators = vi.fn<() => Array<{ name: string; dir: string; platform: string; running: boolean; deviceId?: string }>>();
const mockInspectSigningProfileSetup = vi.fn<() => Promise<any>>();
const mockFormatSigningProfileSetupIssue = vi.fn(() => 'missing signing profile');
const mockFormatSigningBundleNameMismatch = vi.fn((appBundleName: string, signingBundleName: string) =>
  `bundleName mismatch: ${appBundleName} -> ${signingBundleName}`);
const mockResolveDevToolsBrowser = vi.fn<() => Promise<any>>();
const mockProbeEmulatorBinary = vi.fn<() => Promise<any>>();
const mockProbeHvigorEnvironment = vi.fn<() => Promise<any>>();
const mockReadBundleName = vi.fn<() => Promise<string | undefined>>();
const mockProbeHdcEnvironment = vi.fn<() => Promise<any>>();
const mockDiscoverLocalSigningMaterials = vi.fn<() => Promise<any>>();
const mockBuildLocalSigningRecoverySteps = vi.fn(() => ['replace profile', 'replace storeFile', 'replace certpath']);
const mockFormatLocalSigningCandidates = vi.fn((candidates: Array<{ stem: string }>) => candidates.map((candidate) => `- ${candidate.stem}`));

vi.mock('../src/utils/config', () => ({
  getSdkPath: () => '',
  getHdcPath: () => '',
  resolveHvigorPath: mockResolveHvigorPath,
  resolveToolPath: mockResolveToolPath,
  resolveHdcPath: mockResolveHdcPath,
  resolveEmulatorPath: mockResolveEmulatorPath,
}));

vi.mock('../src/utils/hdc', () => ({
  coerceHdcCommandError: (error: unknown) => error,
  describeHdcCommandError: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

vi.mock('../src/utils/hdcProbe', () => ({
  probeHdcEnvironment: mockProbeHdcEnvironment,
}));

vi.mock('../src/device/emulatorManager', () => ({
  detectEmulators: mockDetectEmulators,
}));

vi.mock('../src/project/signingProfile', () => ({
  inspectSigningProfileSetup: mockInspectSigningProfileSetup,
  formatSigningProfileSetupIssue: mockFormatSigningProfileSetupIssue,
  formatSigningBundleNameMismatch: mockFormatSigningBundleNameMismatch,
}));

vi.mock('../src/webview/browser', () => ({
  resolveDevToolsBrowser: mockResolveDevToolsBrowser,
}));

vi.mock('../src/device/emulatorSupport', () => ({
  probeEmulatorBinary: mockProbeEmulatorBinary,
}));

vi.mock('../src/utils/hvigorProbe', () => ({
  probeHvigorEnvironment: mockProbeHvigorEnvironment,
}));

vi.mock('../src/utils/projectMetadata', () => ({
  readBundleName: mockReadBundleName,
}));

vi.mock('../src/project/localSigning', () => ({
  discoverLocalSigningMaterials: mockDiscoverLocalSigningMaterials,
  buildLocalSigningRecoverySteps: mockBuildLocalSigningRecoverySteps,
  formatLocalSigningCandidates: mockFormatLocalSigningCandidates,
}));

describe('checkEnvironment hvigor reporting', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    mockResolveToolPath.mockResolvedValue(null);
    mockResolveHdcPath.mockResolvedValue('/mock/hdc');
    mockResolveEmulatorPath.mockResolvedValue(null);
    mockDetectEmulators.mockReturnValue([]);
    mockInspectSigningProfileSetup.mockResolvedValue(undefined);
    mockProbeEmulatorBinary.mockResolvedValue(undefined);
    mockProbeHvigorEnvironment.mockResolvedValue({
      ok: true,
      kind: 'ready',
      command: './hvigorw tasks --no-daemon',
      output: '',
    });
    mockReadBundleName.mockResolvedValue('com.demo.app');
    mockDiscoverLocalSigningMaterials.mockResolvedValue({
      status: 'none',
      searchRoots: ['/Users/test/.ohos/config'],
      candidates: [],
    });
    mockProbeHdcEnvironment.mockResolvedValue({
      ok: true,
      hdcPath: '/mock/hdc',
      targets: [],
      targetProbes: [],
    });
    mockResolveDevToolsBrowser.mockResolvedValue({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      kind: 'chrome',
      source: 'auto',
      displayName: 'Google Chrome',
      inspectUrl: 'chrome://inspect/#devices',
      warnings: [],
    });
  });

  it('reports an external hvigor fallback when the project wrapper is broken', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-fallback-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockResolveHvigorPath.mockResolvedValue('/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw');

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('缺少它引用的运行时文件'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('外部 hvigor，可作为回退构建入口'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the broken-wrapper warning when no external hvigor is available', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-broken-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockResolveHvigorPath.mockResolvedValue(null);

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('缺少它引用的运行时文件'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('外部 hvigor'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('surfaces macOS readlink warnings even when the local wrapper is otherwise valid', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-readlink-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_APP_HOME=$(dirname $(readlink -f $0))\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockResolveHvigorPath.mockResolvedValue(null);

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('hvigor 脚本存在，可执行构建'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('readlink -f'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports emulator binary and images when machine-level emulator tooling is available', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-emulator-'));
    const emulatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-emulator-bin-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      const emulatorBinary = path.join(emulatorRoot, process.platform === 'win32' ? 'emulator.exe' : 'emulator');
      fs.writeFileSync(emulatorBinary, '', 'utf8');
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockResolveHvigorPath.mockResolvedValue(null);
      mockResolveEmulatorPath.mockResolvedValue(emulatorBinary);
      mockProbeEmulatorBinary.mockResolvedValue({
        listWorks: true,
        listedNames: ['Mate 70 Pro', 'Watch X'],
      });
      mockDetectEmulators.mockReturnValue([
        {
          name: 'Mate 70 Pro',
          dir: '/tmp/Mate70',
          platform: 'arm64',
          running: false,
          launchRoot: '/Users/test/.Huawei/Emulator/deployed',
          imageRoot: '/Users/test/Library/Huawei/Sdk',
        },
        {
          name: 'Watch X',
          dir: '/tmp/WatchX',
          platform: 'arm64',
          running: false,
          launchRoot: '/Users/test/.Huawei/Emulator/deployed',
          imageRoot: '/Users/test/Library/Huawei/Sdk',
        },
      ]);

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('模拟器入口'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('模拟器 CLI 可列出镜像'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('已检测到 2 个本地模拟器镜像'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('命令行启动元数据完整'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(emulatorRoot, { recursive: true, force: true });
    }
  });

  it('prints explicit manual recovery steps when machine-level tools cannot be auto-detected', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-manual-hints-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockResolveHdcPath.mockResolvedValue('hdc');
      mockResolveEmulatorPath.mockResolvedValue(null);

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('OpenHarmony SDK'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('command-line-tools'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('Device Manager'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('harmony.hdcPath'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('harmony.emulatorPath'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('warns when emulator -list fails even though image directories exist', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-emulator-cli-fail-'));
    const emulatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-emulator-cli-bin-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      const emulatorBinary = path.join(emulatorRoot, process.platform === 'win32' ? 'emulator.exe' : 'emulator');
      fs.writeFileSync(emulatorBinary, '', 'utf8');
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockResolveEmulatorPath.mockResolvedValue(emulatorBinary);
      mockProbeEmulatorBinary.mockResolvedValue({
        listWorks: false,
        listedNames: [],
        errorMessage: 'Unable to start the emulator\nsysmond service not found',
      });
      mockDetectEmulators.mockReturnValue([
        { name: 'Mate 70 Pro', dir: '/tmp/Mate70', platform: 'arm64', running: false },
      ]);

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('模拟器 CLI 自检失败'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('命令行启动模拟器时可能直接报错'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(emulatorRoot, { recursive: true, force: true });
    }
  });

  it('reports browser fallback warnings and signing profile issues for workspace-local machine dependencies', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-signing-browser-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockInspectSigningProfileSetup.mockResolvedValue({
        configured: true,
        exists: false,
        readable: false,
        profilePath: '/tmp/missing-profile.p7b',
        warnings: ['当前 build-profile.json5 使用了绝对签名 profile 路径，换机器后通常需要重新配置。'],
      });
      mockResolveDevToolsBrowser.mockResolvedValue({
        kind: 'system',
        source: 'system',
        displayName: 'System Browser',
        inspectUrl: 'chrome://inspect/#devices',
        warnings: ['Configured WebView DevTools browser was not found: /tmp/missing-browser'],
      });

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('系统默认浏览器')) || channel.lines.some((line) => line.includes('Chrome / Edge'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('missing signing profile'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('绝对签名 profile 路径'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prints local signing recovery steps when matching signing materials are found on this machine', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-local-signing-recovery-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockInspectSigningProfileSetup.mockResolvedValue({
        configured: true,
        exists: false,
        readable: false,
        profilePath: '/tmp/missing-profile.p7b',
        warnings: [],
      });
      mockDiscoverLocalSigningMaterials.mockResolvedValue({
        status: 'found',
        searchRoots: ['/Users/test/.ohos/config'],
        candidates: [],
        candidate: {
          stem: 'auto_ohos_123_com.demo.app',
          profilePath: '/Users/test/.ohos/config/auto_ohos_123_com.demo.app.p7b',
          storeFilePath: '/Users/test/.ohos/config/auto_ohos_123_com.demo.app.p12',
          certPath: '/Users/test/.ohos/config/auto_ohos_123_com.demo.app.cer',
          bundleName: 'com.demo.app',
        },
      });

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('本机发现可复用的签名材料'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('replace profile'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports hvigor SDK probe success when the workspace is runnable', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-hvigor-probe-ready-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      expect(mockProbeHvigorEnvironment).toHaveBeenCalledWith(root);
      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('hvigor SDK 自检通过（tasks --no-daemon）'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('surfaces hvigor SDK license failures directly in environment check output', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-hvigor-license-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockProbeHvigorEnvironment.mockResolvedValue({
        ok: false,
        kind: 'sdkLicenseNotAccepted',
        command: './hvigorw tasks --no-daemon',
        output: 'The SDK license agreement is not accepted.',
        summary: {
          kind: 'sdkLicenseNotAccepted',
          message: 'The SDK license agreement is not accepted.',
          hints: [],
        },
      });

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('未接受 HarmonyOS SDK License'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('OpenHarmony SDK'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-install-sdk'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('surfaces missing HarmonyOS SDK components directly in environment check output', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-hvigor-sdk-components-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockProbeHvigorEnvironment.mockResolvedValue({
        ok: false,
        kind: 'sdkComponentMissing',
        command: './hvigorw tasks --no-daemon',
        output: 'SDK component missing.',
        summary: {
          kind: 'sdkComponentMissing',
          message: 'SDK component missing.',
          hints: [],
        },
      });

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('缺少 HarmonyOS SDK 必需组件'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('OpenHarmony SDK'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports signing bundleName mismatches before build starts', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-signing-bundle-mismatch-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockInspectSigningProfileSetup.mockResolvedValue({
        configured: true,
        exists: true,
        readable: true,
        profilePath: path.join(root, 'sign', 'profile.p7b'),
        profilePathSource: 'relative',
        bundleName: 'com.signing.profile',
        materials: [
          {
            kind: 'profile',
            path: path.join(root, 'sign', 'profile.p7b'),
            pathSource: 'relative',
            exists: true,
            readable: true,
          },
        ],
        warnings: [],
      });

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      expect(mockReadBundleName).toHaveBeenCalledWith(expect.objectContaining({ fsPath: root }));
      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('bundleName mismatch: com.demo.app -> com.signing.profile'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports online HDC targets whose shell is not ready yet', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-env-hdc-shell-pending-'));
    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      vscode.workspace.workspaceFolders = [
        { name: 'demo', uri: vscode.Uri.file(root), index: 0 },
      ] as any;

      mockProbeHdcEnvironment.mockResolvedValue({
        ok: true,
        hdcPath: '/mock/hdc',
        targets: ['127.0.0.1:5555', '192.168.0.2:8710'],
        targetProbes: [
          {
            deviceId: '127.0.0.1:5555',
            shellReady: true,
          },
          {
            deviceId: '192.168.0.2:8710',
            shellReady: false,
            message: 'HDC did not respond in time. The HDC server may be hung or the emulator is still booting.',
          },
        ],
      });

      const channelSpy = vi.spyOn(vscode.window, 'createOutputChannel');
      const { checkEnvironment } = await import('../src/project/checkEnvironment');
      await checkEnvironment();

      const channel = channelSpy.mock.results[0].value as { lines: string[] };
      expect(channel.lines.some((line) => line.includes('HDC 服务可访问，当前在线目标: 2'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('HDC shell 可访问: 127.0.0.1:5555'))).toBe(true);
      expect(channel.lines.some((line) => line.includes('192.168.0.2:8710 已出现，但 shell 尚未就绪'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
