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
