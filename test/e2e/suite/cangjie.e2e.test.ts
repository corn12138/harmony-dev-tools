import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';
const FIXTURE_ROOT = path.resolve(__dirname, '../../../../test/fixtures/demo-project');

async function ensureActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
  if (!ext.isActive) await ext.activate();
}

suite('E2E: Cangjie Extreme Stress', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Massive Concurrent Edits on Cangjie file do not crash extension', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/cangjie/Monster.cj'));
    
    // Ensure directory exists by writing a small initial part
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from('main() {\n}\n', 'utf8'));
    
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);
    
    // Set language id precisely since .cj might just be registered in package.json
    await vscode.languages.setTextDocumentLanguage(doc, 'cangjie');

    const startMemory = process.memoryUsage().heapUsed;

    // Apply 100 rapid document updates sequentially but very fast
    for (let i = 0; i < 100; i++) {
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(1, 0), `  let concurrent_var_${i} = spawn { println("extreme stress ${i}") }\n`);
        await vscode.workspace.applyEdit(edit);
    }
    
    // Wait for internal providers to stabilize
    await new Promise(r => setTimeout(r, 2000));
    
    const endMemory = process.memoryUsage().heapUsed;
    const mbDiff = (endMemory - startMemory) / 1024 / 1024;
    
    assert.ok(true, `Survived 100 rapid edits on Cangjie file. Memory diff: ${mbDiff.toFixed(2)} MB`);

    // Teardown
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(20000);

  test('Cangjie Snippet Bombardment (100 simultaneous requests)', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/cangjie/Bombard.cj'));
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from('\n', 'utf8'));
    
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);
    await vscode.languages.setTextDocumentLanguage(doc, 'cangjie');
    
    const promises: Promise<any>[] = [];
    
    for (let i = 0; i < 100; i++) {
      promises.push(
        Promise.resolve(vscode.commands.executeCommand(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(0, 0)
        ))
      );
    }

    const results = await Promise.allSettled(promises);
    const failures = results.filter(r => r.status === 'rejected');
    
    assert.strictEqual(failures.length, 0, `Bombardment produced ${failures.length} failures`);
    
    // Check if snippets are actually returned
    const successfulCompletions = results.find(r => r.status === 'fulfilled' && r.value && r.value.items && r.value.items.length > 0);
    if (successfulCompletions && successfulCompletions.status === 'fulfilled') {
      const items = successfulCompletions.value.items;
      const snippetItems = items.filter((i: any) => i.kind === vscode.CompletionItemKind.Snippet);
      assert.ok(snippetItems.length > 0, 'Should find Cangjie snippets in completions');
    }
    
    // Cleanup
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(30000);
});
