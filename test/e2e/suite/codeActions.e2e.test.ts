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

suite('E2E: Code Actions / Quick Fixes', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Quick fix is offered for arkts-no-any diagnostic', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    // Wait for diagnostics to show up
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-no-any'));
    const anyDiag = diags.find(d => d.code === 'arkts-no-any');
    assert.ok(anyDiag, 'Expected arkts-no-any diagnostic');

    // Request code actions at the diagnostic range
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      anyDiag!.range
    );

    assert.ok(Array.isArray(actions), 'Code actions should be an array');
    assert.ok(actions.length > 0, 'Expected at least one code action for arkts-no-any');
  }).timeout(15000);

  test('Quick fix is offered for arkts-foreach-perf', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-foreach-perf'));
    const feDiag = diags.find(d => d.code === 'arkts-foreach-perf');
    assert.ok(feDiag, 'Expected arkts-foreach-perf diagnostic');

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      feDiag!.range
    );

    assert.ok(actions.length > 0, 'Expected ForEach → LazyForEach quick fix');
  }).timeout(15000);

  test('Quick fix is offered for arkts-deprecated-router', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-deprecated-router'));
    const routerDiag = diags.find(d => d.code === 'arkts-deprecated-router');
    assert.ok(routerDiag, 'Expected arkts-deprecated-router diagnostic');

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      routerDiag!.range
    );

    assert.ok(actions.length > 0, 'Expected router migration quick fix');
  }).timeout(15000);
});
