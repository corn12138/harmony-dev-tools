import * as vscode from 'vscode';
import { buildHvigorCommand } from '../utils/hvigor';
import { getPreferredWorkspaceFolder } from '../utils/workspace';

export async function buildHap(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const task = new vscode.Task(
    { type: 'hvigor', task: 'assembleHap' },
    folder,
    'Build HAP',
    'hvigor',
    new vscode.ShellExecution(buildHvigorCommand({ task: 'assembleHap' }), { cwd: folder.uri.fsPath })
  );
  await vscode.tasks.executeTask(task);
}

export async function cleanBuild(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const task = new vscode.Task(
    { type: 'hvigor', task: 'clean' },
    folder,
    'Clean',
    'hvigor',
    new vscode.ShellExecution(buildHvigorCommand({ task: 'clean' }), { cwd: folder.uri.fsPath })
  );
  await vscode.tasks.executeTask(task);
}
