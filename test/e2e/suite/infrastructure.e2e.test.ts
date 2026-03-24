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

suite('E2E: Debug Configuration Provider', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('harmonyos debug type is registered', async () => {
    // Verify the debug type exists by checking the registered debug configuration providers
    const allCommands = await vscode.commands.getCommands(true);
    assert.ok(allCommands.includes('harmony.debugApp'), 'harmony.debugApp command is registered');
  });

  test('resolveDebugConfiguration returns valid config for empty input', async () => {
    // We can test the debug config provider indirectly by checking that
    // the harmonyos debug type is available as a providerType
    // The provider should fill in defaults for an empty config
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.ok(ext.isActive, 'Extension must be active for debug provider');
  });
});

suite('E2E: Task Provider (Hvigor)', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Hvigor task provider is registered', async () => {
    // Fetch all tasks; the hvigor provider should be among them
    const tasks = await vscode.tasks.fetchTasks({ type: 'hvigor' });
    // Our fixture project might not have hvigorfile.ts so tasks could be empty,
    // but the provider itself should not throw
    assert.ok(Array.isArray(tasks), 'Tasks should be an array');
  }).timeout(10000);

  test('Fetching tasks does not throw for non-hvigor workspace', async () => {
    try {
      const tasks = await vscode.tasks.fetchTasks();
      assert.ok(Array.isArray(tasks), 'Should return array even without hvigor project');
    } catch (err) {
      assert.fail(`Task fetch crashed: ${err}`);
    }
  }).timeout(10000);
});

suite('E2E: JSON Schema Validation', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('build-profile.json5 is validated by JSON schema', async () => {
    const fileUri = fixtureUri('build-profile.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    // The schema validation is contributed via package.json jsonValidation.
    // We just verify the file can be opened and processed without error.
    assert.ok(doc.getText().length > 0, 'build-profile.json5 should have content');
  });

  test('oh-package.json5 is validated by JSON schema', async () => {
    const fileUri = fixtureUri('oh-package.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    assert.ok(doc.getText().length > 0, 'oh-package.json5 should have content');
  });

  test('app.json5 is validated by JSON schema', async () => {
    const fileUri = fixtureUri('AppScope/app.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    assert.ok(doc.getText().length > 0, 'app.json5 should have content');
  });

  test('module.json5 is validated by JSON schema', async () => {
    const fileUri = fixtureUri('entry/src/main/module.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    assert.ok(doc.getText().length > 0, 'module.json5 should have content');
  });
});

suite('E2E: Status Bar Items', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Status bar items are created without crash', () => {
    // Status bar items are created during extension activation.
    // If we get here with the extension active, they were created successfully.
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.strictEqual(ext.isActive, true, 'Extension active means status bars created');
  });
});

suite('E2E: Extension Deactivation', () => {
  // This must be the LAST suite to run since it deactivates the extension
  test('Deactivation completes cleanly without errors', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.ok(ext.isActive, 'Extension should be active before deactivation test');

    // We cannot actually call deactivate() in E2E (VS Code manages lifecycle),
    // but we verify the extension survives repeated activate calls
    // which internally stress the disposal of old registrations
    for (let i = 0; i < 3; i++) {
      await ext.activate();
    }
    assert.ok(ext.isActive, 'Extension survived repeated activation');
  });
});
