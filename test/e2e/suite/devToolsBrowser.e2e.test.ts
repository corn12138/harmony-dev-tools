import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveDevToolsBrowser } from '../../../src/webview/browser';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';

async function ensureActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
  if (!ext.isActive) {
    await ext.activate();
  }
}

suite('E2E: WebView DevTools Browser Resolver', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('configured devToolsBrowserPath is preferred', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-devtools-browser-'));
    const browserPath = path.join(root, process.platform === 'win32' ? 'msedge.exe' : 'msedge');
    try {
      fs.writeFileSync(browserPath, '', 'utf8');
      await vscode.workspace.getConfiguration('harmony').update('devToolsBrowserPath', browserPath, true);

      const resolved = await resolveDevToolsBrowser();
      assert.strictEqual(resolved.executablePath, browserPath);
      assert.strictEqual(resolved.kind, 'edge');
      assert.strictEqual(resolved.inspectUrl, 'edge://inspect/#devices');
    } finally {
      await vscode.workspace.getConfiguration('harmony').update('devToolsBrowserPath', '', true);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }).timeout(15000);
});
