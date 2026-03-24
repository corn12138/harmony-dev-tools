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

suite('E2E: Diagnostics Stress', () => {
  let doc: vscode.TextDocument;

  setup(async () => {
    await ensureActivated();
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
  });

  // --- Core diagnostic rule coverage ---

  test('Detects arkts-no-any for `: any` type', async () => {
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-no-any'));
    assert.ok(diags.some(d => d.code === 'arkts-no-any'), 'Missing arkts-no-any');
  }).timeout(10000);

  test('Detects arkts-deprecated-router for @ohos.router import', async () => {
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-deprecated-router'));
    assert.ok(diags.some(d => d.code === 'arkts-deprecated-router'), 'Missing arkts-deprecated-router');
  }).timeout(10000);

  test('Detects arkts-state-shallow for @State with array type', async () => {
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-state-shallow'));
    assert.ok(diags.some(d => d.code === 'arkts-state-shallow'), 'Missing arkts-state-shallow');
  }).timeout(10000);

  test('Detects arkts-foreach-perf for ForEach usage', async () => {
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-foreach-perf'));
    assert.ok(diags.some(d => d.code === 'arkts-foreach-perf'), 'Missing arkts-foreach-perf');
  }).timeout(10000);

  test('Detects arkts-build-heavy for console.log in build()', async () => {
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-build-heavy'));
    assert.ok(diags.some(d => d.code === 'arkts-build-heavy'), 'Missing arkts-build-heavy');
  }).timeout(10000);

  test('Detects arkts-sandbox-hardcoded-path for /data/storage/ path', async () => {
    const diags = await waitForDiagnostics(doc.uri, d => d.some(x => x.code === 'arkts-sandbox-hardcoded-path'));
    assert.ok(diags.some(d => d.code === 'arkts-sandbox-hardcoded-path'), 'Missing arkts-sandbox-hardcoded-path');
  }).timeout(10000);

  // --- Stress: rapid open/close ---

  test('Diagnostics remain consistent after 10x rapid open/close cycles', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');

    for (let i = 0; i < 10; i++) {
      const d = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(d);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    // Reopen and check diagnostics still work
    const reopenedDoc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(reopenedDoc);
    const diags = await waitForDiagnostics(reopenedDoc.uri, d => d.length > 0);
    assert.ok(diags.length > 0, 'Diagnostics did not recover after rapid cycling');
  }).timeout(20000);

  // --- Stress: clean file has no false positives ---

  test('Clean file should have zero or minimal diagnostics', async () => {
    const cleanUri = fixtureUri('entry/src/main/ets/pages/Second.ets');
    const cleanDoc = await vscode.workspace.openTextDocument(cleanUri);
    await vscode.window.showTextDocument(cleanDoc);

    // Wait a bit for diagnostics to settle
    await new Promise(r => setTimeout(r, 2000));
    const diags = vscode.languages.getDiagnostics(cleanDoc.uri);
    // Second.ets is clean code; we should not see errors/warnings (info hints like ForEach are acceptable)
    const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(errors.length, 0, `Clean file has unexpected errors: ${errors.map(e => e.code).join(', ')}`);
  }).timeout(10000);
});
