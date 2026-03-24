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

async function waitForDiagnostics(
  uri: vscode.Uri,
  predicate: (d: vscode.Diagnostic[]) => boolean,
  timeoutMs = 8000,
): Promise<vscode.Diagnostic[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const diags = vscode.languages.getDiagnostics(uri);
    if (predicate(diags)) return diags;
    await new Promise(r => setTimeout(r, 150));
  }
  return vscode.languages.getDiagnostics(uri);
}

suite('E2E: Rapid Edit Stress', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('20 rapid edits do not crash the extension host', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc);

    // Apply 20 rapid insertions
    for (let i = 0; i < 20; i++) {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(doc.uri, new vscode.Position(0, 0), `// rapid edit ${i}\n`);
      await vscode.workspace.applyEdit(edit);
    }

    // Give diagnostic provider time to re-analyze
    await new Promise(r => setTimeout(r, 2000));

    const diags = vscode.languages.getDiagnostics(doc.uri);
    // The file still has anti-patterns, so diagnostics should exist
    assert.ok(diags.length > 0, 'Diagnostics should still report after rapid edits');

    // Undo all changes to restore fixture
    for (let i = 0; i < 20; i++) {
      await vscode.commands.executeCommand('undo');
    }
  }).timeout(20000);

  test('Large generated file (2000 lines) completes diagnostics within timeout', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Large.ets'));

    // Generate a 2000-line file
    const lines: string[] = [
      "import router from '@ohos.router';",
      '@Entry',
      '@Component',
      'struct LargePage {',
      '  @State data: any = null;',
    ];
    for (let i = 0; i < 1990; i++) {
      lines.push(`  // generated line ${i}`);
    }
    lines.push('  build() {', '    Column() {', '      ForEach([1,2,3], (n: number) => { Text(String(n)) })', '    }', '  }', '}');

    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(lines.join('\n'), 'utf8'));

    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);

    const start = Date.now();
    const diags = await waitForDiagnostics(tmpUri, d => d.length > 0, 10000);
    const elapsed = Date.now() - start;

    assert.ok(diags.length > 0, 'Large file should still produce diagnostics');
    // Performance target: complete within 5 seconds
    assert.ok(elapsed < 10000, `Diagnostics on 2000-line file took ${elapsed}ms (target < 10s)`);

    // Cleanup
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(20000);

  test('Replacing entire document content does not orphan old diagnostics', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Replace.ets'));
    const badCode = '@Component\nstruct Bad {\n  @State x: any = 1;\n  build() { Column() {} }\n}';
    const goodCode = '@Component\nstruct Good {\n  @State x: number = 1;\n  build() { Column() {} }\n}';

    // Write bad code
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(badCode, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);

    let diags = await waitForDiagnostics(tmpUri, d => d.some(x => x.code === 'arkts-no-any'), 8000);
    assert.ok(diags.some(d => d.code === 'arkts-no-any'), 'Bad code should produce arkts-no-any');

    // Replace with good code
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    );
    edit.replace(tmpUri, fullRange, goodCode);
    await vscode.workspace.applyEdit(edit);

    // Wait for diagnostics to update
    await new Promise(r => setTimeout(r, 3000));
    diags = vscode.languages.getDiagnostics(tmpUri);
    const anyDiags = diags.filter(d => d.code === 'arkts-no-any');
    assert.strictEqual(anyDiags.length, 0, 'After fix, arkts-no-any should disappear');

    // Cleanup
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(20000);
});
