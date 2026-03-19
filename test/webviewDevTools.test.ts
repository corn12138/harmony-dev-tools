import { describe, expect, it } from 'vitest';
import { parseWebDebuggingAccess } from '../src/webview/projectAnalysis';
import {
  parseHdcFportMappings,
  parseWebViewDevToolsSockets,
} from '../src/webview/devtools';

describe('webview devtools helpers', () => {
  it('should parse USB WebView DevTools enablement', () => {
    expect(parseWebDebuggingAccess(`
      import { webview } from '@kit.ArkWeb';
      webview.WebviewController.setWebDebuggingAccess(true);
    `)).toEqual({ enabled: true, port: undefined });
  });

  it('should parse wireless WebView DevTools enablement', () => {
    expect(parseWebDebuggingAccess(`
      import { webview } from '@kit.ArkWeb';
      webview.WebviewController.setWebDebuggingAccess(true, 8888);
    `)).toEqual({ enabled: true, port: 8888 });
  });

  it('should parse running WebView DevTools sockets from hdc shell output', () => {
    const stdout = `
0000000000000000: 00000002 00000000 00010000 0001 01 12345 @webview_devtools_remote_38532
0000000000000000: 00000002 00000000 00010000 0001 01 12346 @webview_devtools_remote_38540
0000000000000000: 00000002 00000000 00010000 0001 01 12346 @webview_devtools_remote_38540
`;

    expect(parseWebViewDevToolsSockets(stdout)).toEqual([
      'webview_devtools_remote_38532',
      'webview_devtools_remote_38540',
    ]);
  });

  it('should parse HDC fport mappings', () => {
    const stdout = `
tcp:9222 localabstract:webview_devtools_remote_38532
tcp:9230 tcp:9230
[Empty]
`;

    expect(parseHdcFportMappings(stdout)).toEqual([
      { local: 'tcp:9222', remote: 'localabstract:webview_devtools_remote_38532' },
      { local: 'tcp:9230', remote: 'tcp:9230' },
    ]);
  });
});
