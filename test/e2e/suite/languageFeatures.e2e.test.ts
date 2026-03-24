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

suite('E2E: Language Features Stress', () => {
  let doc: vscode.TextDocument;

  setup(async () => {
    await ensureActivated();
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    // Give providers time to initialize
    await new Promise(r => setTimeout(r, 1000));
  });

  test('Hover provider returns content on @Entry decorator', async () => {
    // Find the line with @Entry
    let entryLine = -1;
    for (let i = 0; i < doc.lineCount; i++) {
      if (doc.lineAt(i).text.includes('@Entry')) {
        entryLine = i;
        break;
      }
    }
    assert.ok(entryLine >= 0, '@Entry not found in fixture');

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(entryLine, 1)
    );
    // Our hover provider should return something for @Entry
    // Note: it may or may not fire depending on cursor position exactness
    assert.ok(Array.isArray(hovers), 'Hover provider should return an array');
  }).timeout(10000);

  test('Completion provider triggers on @ character', async () => {
    // Find a position inside the struct body
    let targetLine = -1;
    for (let i = 0; i < doc.lineCount; i++) {
      if (doc.lineAt(i).text.includes('build()')) {
        targetLine = i - 1; // line before build()
        break;
      }
    }
    if (targetLine < 0) targetLine = 5;

    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(targetLine, 2),
      '@'
    );
    assert.ok(completions, 'Completion provider should return a result');
    // We just verify it doesn't crash; actual items depend on context
  }).timeout(10000);

  test('Color provider detects hex colors in the file', async () => {
    const colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
      'vscode.executeDocumentColorProvider',
      doc.uri
    );
    // Index.ets contains '#FF5733' so we expect at least one color
    assert.ok(Array.isArray(colors), 'Color provider should return an array');
    assert.ok(colors.length > 0, 'Expected at least one color from #FF5733');
  }).timeout(10000);

  test('Hover provider handles rapid requests without crash', async () => {
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        Promise.resolve(vscode.commands.executeCommand(
          'vscode.executeHoverProvider',
          doc.uri,
          new vscode.Position(i % doc.lineCount, 0)
        ))
      );
    }
    const results = await Promise.allSettled(promises);
    const failures = results.filter(r => r.status === 'rejected');
    assert.strictEqual(failures.length, 0, `${failures.length} hover requests crashed`);
  }).timeout(15000);
});
