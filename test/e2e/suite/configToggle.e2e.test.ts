import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';
const FIXTURE_ROOT = path.resolve(__dirname, '../../../../test/fixtures/demo-project');

async function ensureActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
  if (!ext.isActive) await ext.activate();
}

function fixtureUri(relativePath: string): vscode.Uri {
  return vscode.Uri.file(path.join(FIXTURE_ROOT, relativePath));
}

suite('E2E: Configuration Toggle Stress', () => {
  setup(async () => {
    await ensureActivated();
  });

  teardown(async () => {
    // Reset all settings to defaults
    const config = vscode.workspace.getConfiguration('harmony');
    await config.update('enableDiagnostics', undefined, vscode.ConfigurationTarget.Global);
    await config.update('enablePerfLens', undefined, vscode.ConfigurationTarget.Global);
    await config.update('logLevel', undefined, vscode.ConfigurationTarget.Global);
  });

  test('Changing logLevel does not throw', async () => {
    const config = vscode.workspace.getConfiguration('harmony');
    const levels = ['debug', 'info', 'warn', 'error'];
    for (const level of levels) {
      await config.update('logLevel', level, vscode.ConfigurationTarget.Global);
    }
    assert.ok(true, 'All log levels accepted');
  }).timeout(10000);

  test('Rapid setting toggles do not crash', async () => {
    const config = vscode.workspace.getConfiguration('harmony');
    for (let i = 0; i < 10; i++) {
      await config.update('enableCodeLens', i % 2 === 0, vscode.ConfigurationTarget.Global);
      await config.update('enablePerfLens', i % 2 !== 0, vscode.ConfigurationTarget.Global);
    }
    // Reset
    await config.update('enableCodeLens', undefined, vscode.ConfigurationTarget.Global);
    await config.update('enablePerfLens', undefined, vscode.ConfigurationTarget.Global);
    assert.ok(true, 'Survived 10x rapid config toggles');
  }).timeout(15000);

  test('Setting devicePollInterval to minimum does not crash', async () => {
    const config = vscode.workspace.getConfiguration('harmony');
    await config.update('devicePollInterval', 1000, vscode.ConfigurationTarget.Global);
    await new Promise(r => setTimeout(r, 2000)); // Let it run at fast poll
    await config.update('devicePollInterval', undefined, vscode.ConfigurationTarget.Global);
    assert.ok(true, 'Survived minimum poll interval');
  }).timeout(10000);
});
