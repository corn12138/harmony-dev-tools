import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveEmulatorPath, resolveHdcPath } from '../../../src/utils/config';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';

async function ensureActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
  if (!ext.isActive) {
    await ext.activate();
  }
}

function touchExecutable(filePath: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
  return filePath;
}

suite('E2E: Local Tool Resolver', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('configured hdcPath can be switched without stale cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-hdc-switch-'));
    const first = touchExecutable(path.join(root, process.platform === 'win32' ? 'hdc-a.exe' : 'hdc-a'));
    const second = touchExecutable(path.join(root, process.platform === 'win32' ? 'hdc-b.exe' : 'hdc-b'));
    const pathBinary = touchExecutable(path.join(root, process.platform === 'win32' ? 'hdc.exe' : 'hdc'));
    const previousPath = process.env.PATH;

    try {
      process.env.PATH = `${root}${path.delimiter}${previousPath ?? ''}`;
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', first, true);
      assert.strictEqual(await resolveHdcPath(), first);

      await vscode.workspace.getConfiguration('harmony').update('hdcPath', second, true);
      assert.strictEqual(await resolveHdcPath(), second);

      await vscode.workspace.getConfiguration('harmony').update('hdcPath', '', true);
      assert.strictEqual(await resolveHdcPath(), pathBinary);
    } finally {
      process.env.PATH = previousPath;
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', '', true);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }).timeout(15000);

  test('configured emulatorPath can be switched without stale cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-emulator-switch-'));
    const first = touchExecutable(path.join(root, process.platform === 'win32' ? 'emulator-a.exe' : 'emulator-a'));
    const second = touchExecutable(path.join(root, process.platform === 'win32' ? 'emulator-b.exe' : 'emulator-b'));

    try {
      await vscode.workspace.getConfiguration('harmony').update('emulatorPath', first, true);
      assert.strictEqual(await resolveEmulatorPath(), first);

      await vscode.workspace.getConfiguration('harmony').update('emulatorPath', second, true);
      assert.strictEqual(await resolveEmulatorPath(), second);
    } finally {
      await vscode.workspace.getConfiguration('harmony').update('emulatorPath', '', true);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }).timeout(15000);
});
