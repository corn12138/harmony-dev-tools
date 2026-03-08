import * as vscode from 'vscode';

export async function formatDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await vscode.commands.executeCommand('editor.action.formatDocument');
}
