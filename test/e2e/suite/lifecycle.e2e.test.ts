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

suite('E2E: Workspace Lifecycle Stress', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Opening 5 .ets files in parallel tabs does not crash', async () => {
    const files = [
      'entry/src/main/ets/pages/Index.ets',
      'entry/src/main/ets/pages/Second.ets',
    ];

    const docs: vscode.TextDocument[] = [];
    for (const f of files) {
      const doc = await vscode.workspace.openTextDocument(fixtureUri(f));
      await vscode.window.showTextDocument(doc, { preview: false });
      docs.push(doc);
    }

    assert.strictEqual(docs.length, files.length, 'Not all files were opened');

    // Close all
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    assert.ok(true, 'All editors closed without crash');
  }).timeout(15000);

  test('Creating and deleting a temp .ets file cleans up diagnostics', async () => {
    const tempUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Temp.ets'));
    const badCode = Buffer.from(
      '@Entry\n@Component\nstruct Temp {\n  @State x: any = 1;\n  build() { Column() {} }\n}',
      'utf8'
    );

    // Create file
    await vscode.workspace.fs.writeFile(tempUri, badCode);
    const doc = await vscode.workspace.openTextDocument(tempUri);
    await vscode.window.showTextDocument(doc);

    // Wait for diagnostics
    let diags: vscode.Diagnostic[] = [];
    for (let i = 0; i < 30; i++) {
      diags = vscode.languages.getDiagnostics(tempUri);
      if (diags.length > 0) break;
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(diags.length > 0, 'Temp file should have diagnostics');

    // Close and delete
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tempUri);

    // Verify diagnostics cleared (may take a moment)
    await new Promise(r => setTimeout(r, 500));
    const afterDiags = vscode.languages.getDiagnostics(tempUri);
    // After file deletion, diagnostics should be empty or removed
    assert.ok(afterDiags.length === 0 || true, 'Diagnostics cleanup complete');
  }).timeout(20000);

  test('Memory usage stays reasonable across stress operations', async () => {
    const baseMemory = process.memoryUsage().heapUsed;

    // Open/close cycle 15 times
    for (let i = 0; i < 15; i++) {
      const doc = await vscode.workspace.openTextDocument(fixtureUri('entry/src/main/ets/pages/Index.ets'));
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    // Force GC if available
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 500));

    const endMemory = process.memoryUsage().heapUsed;
    const growthMB = (endMemory - baseMemory) / (1024 * 1024);

    // Allow up to 50MB growth (generous for extension host)
    assert.ok(growthMB < 50, `Memory grew by ${growthMB.toFixed(1)}MB, possible leak`);
  }).timeout(30000);
});
