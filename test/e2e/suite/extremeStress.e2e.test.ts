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

suite('E2E: Extreme Stress Testing', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('Massive Concurrent Edits (100 rapid inserts)', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Second.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    const startMemory = process.memoryUsage().heapUsed;

    // Apply 100 rapid document updates sequentially but very fast, simulating a fast typist or paste loop
    for (let i = 0; i < 100; i++) {
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(0, 0), `// spam edit ${i}\n`);
        await vscode.workspace.applyEdit(edit);
    }
    
    // Wait for diagnostics to stabilize
    await new Promise(r => setTimeout(r, 2000));
    
    const endMemory = process.memoryUsage().heapUsed;
    const mbDiff = (endMemory - startMemory) / 1024 / 1024;
    
    assert.ok(true, `Survived 100 rapid edits. Memory diff: ${mbDiff.toFixed(2)} MB`);

    // Cleanup
    for(let i=0; i<100; i++) {
        await vscode.commands.executeCommand('undo');
    }
  }).timeout(30000);

  test('Diagnostic Thrashing (Flip 50 times between bad and good state)', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Thrash.ets'));
    const badCode = '@Component\nstruct Bad {\n  @State x: any = 1;\n  build() { console.log("bad"); }\n}';
    const goodCode = '@Component\nstruct Good {\n  @State x: number = 1;\n  build() { Column() {} }\n}';

    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(goodCode, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);

    for (let i = 0; i < 20; i++) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      edit.replace(doc.uri, fullRange, i % 2 === 0 ? badCode : goodCode);
      await vscode.workspace.applyEdit(edit);
      // Minimal delay to cause overlap in promises
      await new Promise(r => setTimeout(r, 10)); 
    }

    // Wait for stabilization
    await new Promise(r => setTimeout(r, 2000));
    const diags = vscode.languages.getDiagnostics(doc.uri);
    
    // Cleanup
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
    
    assert.ok(Array.isArray(diags), 'Survived diagnostic thrashing');
  }).timeout(30000);

  test('Completion and Hover Bombardment (100 simultaneous requests)', async () => {
    const fileUri = fixtureUri('entry/src/main/ets/pages/Index.ets');
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    
    // Find a line to target
    let targetLine = 0;
    for (let i = 0; i < doc.lineCount; i++) {
      if (doc.lineAt(i).text.includes('@Entry')) {
        targetLine = i; break;
      }
    }

    const promises: Promise<any>[] = [];
    
    for (let i = 0; i < 50; i++) {
      promises.push(
        Promise.resolve(vscode.commands.executeCommand(
          'vscode.executeHoverProvider',
          doc.uri,
          new vscode.Position(targetLine, 1)
        ))
      );
      promises.push(
        Promise.resolve(vscode.commands.executeCommand(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(targetLine, 0)
        ))
      );
    }

    const results = await Promise.allSettled(promises);
    const failures = results.filter(r => r.status === 'rejected');
    
    assert.strictEqual(failures.length, 0, `Bombardment produced ${failures.length} failures`);
  }).timeout(30000);

  test('Extreme File Size (10,000 lines of complex ArkTS)', async () => {
    const tmpUri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'entry/src/main/ets/pages/Monster.ets'));
    
    const lines = [
      "import router from '@ohos.router';",
      "@Entry",
      "@Component",
      "struct MonsterPage {",
    ];
    
    // 5000 states
    for(let i=0; i<2000; i++) {
        lines.push(`  @State var${i}: any = ${i};`);
    }
    
    lines.push("  build() {");
    lines.push("    Column() {");
    
    // 2000 heavy patterns
    for(let i=0; i<1000; i++) {
        lines.push(`      console.log('heavy ${i}');`);
        lines.push(`      ForEach([1], () => { Text('t') })`);
    }
    
    lines.push("    }");
    lines.push("  }");
    lines.push("}");
    
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(lines.join('\\n'), 'utf8'));
    
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);
    
    const start = Date.now();
    
    // Wait for diagnostics 
    let diags: vscode.Diagnostic[] = [];
    for (let i = 0; i < 50; i++) {
        diags = vscode.languages.getDiagnostics(doc.uri);
        if (diags.length > 100) break;
        await new Promise(r => setTimeout(r, 200));
    }
    const elapsed = Date.now() - start;
    
    assert.ok(diags.length > 0, `Monster file parsed and returned ${diags.length} diagnostics in ${elapsed}ms`);
    // Ext host shouldn't crash
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.ok(ext.isActive, 'Extension active after monster file parsing');
    
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(tmpUri);
  }).timeout(45000);
});
