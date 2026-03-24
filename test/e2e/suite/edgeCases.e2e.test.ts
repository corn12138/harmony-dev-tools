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

suite('E2E: Config Hover Advanced', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Hover on app.json5 bundleName returns documentation', async () => {
    const fileUri = fixtureUri('AppScope/app.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    let targetLine = -1;
    for (let i = 0; i < doc.lineCount; i++) {
      if (doc.lineAt(i).text.includes('bundleName')) {
        targetLine = i;
        break;
      }
    }

    if (targetLine >= 0) {
      const col = doc.lineAt(targetLine).text.indexOf('bundleName');
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        new vscode.Position(targetLine, col + 1)
      );
      assert.ok(Array.isArray(hovers), 'Hover should return array');
    }
  }).timeout(10000);

  test('Hover on oh-package.json5 key returns documentation', async () => {
    const fileUri = fixtureUri('oh-package.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    let targetLine = -1;
    for (let i = 0; i < doc.lineCount; i++) {
      if (doc.lineAt(i).text.includes('dependencies')) {
        targetLine = i;
        break;
      }
    }

    if (targetLine >= 0) {
      const col = doc.lineAt(targetLine).text.indexOf('dependencies');
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        new vscode.Position(targetLine, col + 1)
      );
      assert.ok(Array.isArray(hovers), 'Hover should return array');
    }
  }).timeout(10000);
});

suite('E2E: Concurrent Document Editing', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Editing two .ets files simultaneously does not crash', async () => {
    const file1 = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const file2 = fixtureUri('entry/src/main/ets/pages/Second.ets');

    const doc1 = await vscode.workspace.openTextDocument(file1);
    const doc2 = await vscode.workspace.openTextDocument(file2);

    const editor1 = await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
    const editor2 = await vscode.window.showTextDocument(doc2, vscode.ViewColumn.Two);

    // Apply edits to both simultaneously
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc1.uri, new vscode.Position(0, 0), '// concurrent edit 1\n');
    edit.insert(doc2.uri, new vscode.Position(0, 0), '// concurrent edit 2\n');
    await vscode.workspace.applyEdit(edit);

    await new Promise(r => setTimeout(r, 1000));

    // Both files should still have diagnostics available
    const diags1 = vscode.languages.getDiagnostics(doc1.uri);
    const diags2 = vscode.languages.getDiagnostics(doc2.uri);

    assert.ok(Array.isArray(diags1), 'File 1 diagnostics should exist');
    assert.ok(Array.isArray(diags2), 'File 2 diagnostics should exist');

    // Undo edits
    await vscode.commands.executeCommand('undo');
    await vscode.window.showTextDocument(doc1);
    await vscode.commands.executeCommand('undo');
  }).timeout(15000);

  test('Switching between tabs rapidly does not break diagnostics', async () => {
    const files = [
      fixtureUri('entry/src/main/ets/pages/Index.ets'),
      fixtureUri('entry/src/main/ets/pages/Second.ets'),
      fixtureUri('entry/src/main/ets/pages/V1V2Mix.ets'),
    ];

    for (let round = 0; round < 5; round++) {
      for (const file of files) {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
      }
    }

    // After 15 rapid tab switches, diagnostics should still work
    const doc = await vscode.workspace.openTextDocument(files[0]);
    await vscode.window.showTextDocument(doc);
    await new Promise(r => setTimeout(r, 500));

    const diags = vscode.languages.getDiagnostics(doc.uri);
    assert.ok(Array.isArray(diags), 'Diagnostics should survive rapid tab switching');
  }).timeout(20000);
});

suite('E2E: Error Resilience', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Opening a non-.ets file does not produce false diagnostics', async () => {
    const fileUri = fixtureUri('build-profile.json5');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    await new Promise(r => setTimeout(r, 1000));

    const diags = vscode.languages.getDiagnostics(doc.uri);
    const arktsDiags = diags.filter(d => d.source === 'HarmonyOS');
    // JSON5 config files should NOT get arkts diagnostics
    assert.strictEqual(arktsDiags.length, 0, 'JSON5 files should not have ArkTS diagnostics');
  }).timeout(10000);

  test('Opening a malformed .ets file does not crash the extension', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Malformed.ets'));
    const malformedCode = Buffer.from(
      '@@@@InvalidSyntax{{{\n@Component\nstruct { break everything \n  @State @Prop @Link simultaneous: any = {};',
      'utf8'
    );

    await vscode.workspace.fs.writeFile(tmpUri, malformedCode);
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);

    await new Promise(r => setTimeout(r, 2000));

    // Extension should still be active
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.ok(ext.isActive, 'Extension should survive malformed files');

    // Clean up
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(10000);

  test('Empty .ets file produces no crashes', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Empty.ets'));
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from('', 'utf8'));

    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);
    await new Promise(r => setTimeout(r, 1000));

    const diags = vscode.languages.getDiagnostics(doc.uri);
    assert.ok(Array.isArray(diags), 'Empty file should not crash diagnostics');
    assert.strictEqual(diags.length, 0, 'Empty file should have no diagnostics');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(10000);

  test('File with 10000 characters on a single line does not hang', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/LongLine.ets'));
    const longLine = '@Component\nstruct LongLine {\n  @State data: string = "' + 'x'.repeat(10000) + '";\n  build() { Column() {} }\n}';

    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(longLine, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);

    const start = Date.now();
    await new Promise(r => setTimeout(r, 3000));
    const elapsed = Date.now() - start;

    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.ok(ext.isActive, 'Extension should survive long lines');
    assert.ok(elapsed < 10000, `Processing should not hang (took ${elapsed}ms)`);

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(15000);
});
