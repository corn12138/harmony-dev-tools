import * as vscode from 'vscode';

export function getPreferredWorkspaceFolder(uri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  if (uri) {
    const fromUri = vscode.workspace.getWorkspaceFolder(uri);
    if (fromUri) {
      return fromUri;
    }
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const fromActiveEditor = vscode.workspace.getWorkspaceFolder(activeUri);
    if (fromActiveEditor) {
      return fromActiveEditor;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}
