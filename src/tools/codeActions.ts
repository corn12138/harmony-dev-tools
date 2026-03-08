import * as vscode from 'vscode';

export async function extractComponent(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Please select UI code to extract');
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Component name',
    placeHolder: 'MyComponent',
    validateInput: (v) => /^[A-Z]\w*$/.test(v) ? null : 'Must start with uppercase letter',
  });
  if (!name) return;

  const selectedText = editor.document.getText(editor.selection);
  const component = `@Component\nstruct ${name} {\n  build() {\n    ${selectedText}\n  }\n}\n`;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, editor.selection, `${name}()`);
  // Insert component definition before the current struct
  const docText = editor.document.getText();
  const firstStruct = docText.indexOf('struct ');
  const insertPos = firstStruct > 0 ? editor.document.positionAt(docText.lastIndexOf('\n', firstStruct)) : new vscode.Position(0, 0);
  edit.insert(editor.document.uri, insertPos, '\n' + component + '\n');

  await vscode.workspace.applyEdit(edit);
}

export async function extractBuilder(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Please select UI code to extract as @Builder');
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Builder function name',
    placeHolder: 'myBuilder',
    validateInput: (v) => /^[a-z]\w*$/.test(v) ? null : 'Must start with lowercase letter',
  });
  if (!name) return;

  const selectedText = editor.document.getText(editor.selection);
  const builder = `  @Builder\n  ${name}() {\n    ${selectedText}\n  }\n`;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, editor.selection, `this.${name}()`);

  // Insert @Builder before the build() method
  const docText = editor.document.getText();
  const buildIdx = docText.indexOf('build()');
  if (buildIdx > 0) {
    const insertPos = editor.document.positionAt(docText.lastIndexOf('\n', buildIdx));
    edit.insert(editor.document.uri, insertPos, '\n' + builder);
  }

  await vscode.workspace.applyEdit(edit);
}

export async function extractString(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Please select a string literal to extract');
    return;
  }

  const selectedText = editor.document.getText(editor.selection);
  // Remove quotes if present
  const rawText = selectedText.replace(/^['"`]|['"`]$/g, '');

  const resourceName = await vscode.window.showInputBox({
    prompt: 'Resource key name',
    placeHolder: 'my_string_key',
    value: rawText.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30),
  });
  if (!resourceName) return;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, editor.selection, `$r('app.string.${resourceName}')`);
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage(
    `Remember to add "${resourceName}": "${rawText}" to resources/base/element/string.json`
  );
}

/**
 * Migrate V1 decorators to V2 in the current file.
 * @Component → @ComponentV2, @State → @Local, @Prop → @Param, etc.
 */
export async function migrateV1ToV2(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const doc = editor.document;
  const text = doc.getText();

  // Check if file has V1 decorators
  const v1Patterns = ['@Component', '@State ', '@Prop ', '@Link ', '@Provide ', '@Consume ', '@Watch(', '@Observed', '@ObjectLink'];
  const hasV1 = v1Patterns.some(p => text.includes(p));

  if (!hasV1) {
    vscode.window.showInformationMessage('No V1 decorators found in this file.');
    return;
  }

  // Check if already has V2
  const hasV2 = text.includes('@ComponentV2') || text.includes('@Local ');
  if (hasV2) {
    const proceed = await vscode.window.showWarningMessage(
      'File already contains V2 decorators. Mixing V1 and V2 is not recommended. Continue?',
      'Continue', 'Cancel'
    );
    if (proceed !== 'Continue') return;
  }

  const confirm = await vscode.window.showInformationMessage(
    'Migrate V1 → V2 decorators in this file?',
    'Migrate', 'Cancel'
  );
  if (confirm !== 'Migrate') return;

  // Perform replacements
  const migrations: [RegExp, string][] = [
    [/^@Component\b(?!V2)/gm, '@ComponentV2'],
    [/@State\s+(?=\w)/g, '@Local '],
    [/@Prop\s+(?=\w)/g, '@Param '],
    [/@Provide\b(?!r)/g, '@Provider'],
    [/@Consume\b(?!r)/g, '@Consumer'],
    [/@Watch\(/g, '@Monitor('],
    [/@Observed\b(?!V2)/g, '@ObservedV2'],
    [/@ObjectLink\s+/g, '@Param /* TODO: review @ObjectLink migration */ '],
  ];

  let newText = text;
  let changeCount = 0;
  for (const [pattern, replacement] of migrations) {
    const before = newText;
    newText = newText.replace(pattern, replacement);
    if (before !== newText) changeCount++;
  }

  if (newText === text) {
    vscode.window.showInformationMessage('No changes needed.');
    return;
  }

  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, fullRange, newText);
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage(
    `V1 → V2 migration complete (${changeCount} decorator types changed). Please review @Monitor and @ObjectLink conversions.`
  );
}
