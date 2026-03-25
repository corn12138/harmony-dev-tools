import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureConnectedDevice = vi.fn(async () => ({
  id: 'device-1',
  name: 'device-1',
  type: 'device',
  status: 'online' as const,
}));
const execHdc = vi.fn(async () => ({ stdout: '', stderr: '' }));
const fetchDevToolsTargets = vi.fn(async () => []);
const resolveDevToolsBrowser = vi.fn(async () => ({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  kind: 'chrome',
  source: 'auto',
  displayName: 'Google Chrome',
  inspectUrl: 'chrome://inspect/#devices',
  warnings: [],
}));
const openUrlInDevToolsBrowser = vi.fn(async () => true);
const createServer = vi.fn();
let fallbackLocalPort = 9333;

vi.mock('node:net', () => ({
  createServer,
}));

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

vi.mock('../src/webview/browser', () => ({
  resolveDevToolsBrowser,
  openUrlInDevToolsBrowser,
}));

describe('webview devtools command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    fallbackLocalPort = 9333;
    const vscode = await import('vscode');
    (vscode as any).__reset();

    createServer.mockImplementation(() => {
      let boundPort = 0;
      const listeners = new Map<string, Array<(...args: any[]) => void>>();
      const server = {
        once(event: string, listener: (...args: any[]) => void) {
          listeners.set(event, [listener]);
          return server;
        },
        listen(_port: number, _host: string, callback?: () => void) {
          boundPort = fallbackLocalPort;
          callback?.();
          return server;
        },
        address() {
          return { port: boundPort };
        },
        close(callback?: () => void) {
          callback?.();
          return server;
        },
      };
      return server;
    });

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
    expect(openUrlInDevToolsBrowser).toHaveBeenCalledWith('chrome://inspect/#devices', expect.objectContaining({
      displayName: 'Google Chrome',
    }));
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('falls back to an available localhost port when 9222 forwarding fails', async () => {
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
        throw new Error('address in use');
      }

      if (command.includes(`fport tcp:${fallbackLocalPort} localabstract:webview_devtools_remote_38532`)) {
        return { stdout: '', stderr: '' };
      }

      throw new Error(`Unexpected execHdc call: ${command}`);
    });

    const { openWebViewDevTools } = await import('../src/webview/devtools');
    await openWebViewDevTools();

    expect(fetchDevToolsTargets).toHaveBeenCalledWith(`http://127.0.0.1:${fallbackLocalPort}`);
  });
});
