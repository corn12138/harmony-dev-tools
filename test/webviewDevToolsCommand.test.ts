import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureConnectedDevice = vi.fn(async () => ({
  id: 'device-1',
  name: 'device-1',
  type: 'device',
  status: 'online' as const,
}));
const execHdc = vi.fn(async () => ({ stdout: '', stderr: '' }));
const fetchDevToolsTargets = vi.fn(async () => []);

vi.mock('../src/device/devices', () => ({
  ensureConnectedDevice,
}));

vi.mock('../src/utils/hdc', () => ({
  buildHdcTargetArgs: (deviceId?: string) => (deviceId ? ['-t', deviceId] : []),
  execHdc,
}));

vi.mock('../src/utils/workspace', () => ({
  getPreferredWorkspaceFolder: () => ({
    uri: {
      fsPath: '/workspace/demo',
      toString: () => '/workspace/demo',
    },
  }),
}));

vi.mock('../src/webview/targets', () => ({
  buildDevToolsFrontendUrl: vi.fn(() => undefined),
  extractInspectablePageTargets: vi.fn(() => []),
  fetchDevToolsTargets,
  pickSuggestedInspectableTarget: vi.fn(() => undefined),
}));

describe('webview devtools command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const vscode = await import('vscode');
    (vscode as any).__reset();

    vscode.workspace.findFiles = vi.fn(async (pattern: any) => {
      const value = typeof pattern === 'string' ? pattern : pattern.pattern;
      if (value === '**/src/main/module.json5') {
        return [vscode.Uri.file('/workspace/demo/entry/src/main/module.json5')];
      }

      if (value === '**/*.ets') {
        return [vscode.Uri.file('/workspace/demo/entry/src/main/ets/pages/Index.ets')];
      }

      return [];
    }) as any;

    vscode.workspace.fs.readFile = vi.fn(async (uri: any) => Buffer.from(
      uri.fsPath.endsWith('module.json5')
        ? `{
  module: {
    abilities: [{ name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }]
  }
}`
        : `import { Web } from '@kit.ArkWeb';
@Entry
@Component
struct IndexPage {
  build() {
    Web({ src: 'https://example.com' })
  }
}`,
    )) as any;

    vscode.env.openExternal = vi.fn(async () => true) as any;
    vscode.window.showInformationMessage = vi.fn(async () => undefined) as any;
    vscode.window.showWarningMessage = vi.fn(async () => undefined) as any;

    execHdc.mockImplementation(async (args: string[]) => {
      const command = args.join(' ');
      if (command.includes('cat /proc/net/unix | grep devtools')) {
        return {
          stdout: '0000000000000000: 00000002 00000000 00010000 0001 01 12345 @webview_devtools_remote_38532\n',
          stderr: '',
        };
      }

      if (command.includes('fport ls')) {
        return { stdout: '[Empty]\n', stderr: '' };
      }

      if (command.includes('fport tcp:9222 localabstract:webview_devtools_remote_38532')) {
        return { stdout: '', stderr: '' };
      }

      throw new Error(`Unexpected execHdc call: ${command}`);
    });
  });

  it('falls back to runtime socket discovery when static debug access is not detected', async () => {
    const vscode = await import('vscode');
    const { openWebViewDevTools } = await import('../src/webview/devtools');

    await openWebViewDevTools();

    expect(execHdc.mock.calls.some(([args]) =>
      Array.isArray(args) && args[args.length - 1] === 'cat /proc/net/unix | grep devtools')).toBe(true);
    expect(fetchDevToolsTargets).toHaveBeenCalledWith('http://127.0.0.1:9222');
    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'chrome://inspect/#devices' }),
    );
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });
});
