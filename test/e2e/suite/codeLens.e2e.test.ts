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

suite('E2E: CodeLens / PerfLens', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('CodeLens hints appear on build() method', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    // Give time for CodeLens to register
    await new Promise(r => setTimeout(r, 1500));

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri
    );

    assert.ok(Array.isArray(lenses), 'CodeLens should return array');
    // We expect at least one lens for the build() method and one for ForEach
    assert.ok(lenses.length > 0, `Expected CodeLens hints but got ${lenses.length}`);
  }).timeout(10000);

  test('CodeLens shows component count on build()', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    await new Promise(r => setTimeout(r, 1500));

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri
    );

    const buildLens = lenses.find(l => l.command?.title?.includes('components'));
    assert.ok(buildLens, 'Expected a CodeLens with component count on build()');
  }).timeout(10000);

  test('CodeLens shows ForEach warning', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    await new Promise(r => setTimeout(r, 1500));

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri
    );

    const foreachLens = lenses.find(l => l.command?.title?.includes('ForEach'));
    assert.ok(foreachLens, 'Expected a CodeLens warning for ForEach');
  }).timeout(10000);
});
