import * as vscode from 'vscode';
import { formatHvigorProjectSetupIssue, resolveHvigorExecution } from '../utils/hvigor';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { resolveAssembleHapPreflight } from './preflight';

export async function buildHap(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const preflight = await resolveAssembleHapPreflight(folder.uri.fsPath);
  const hvigorExecution = preflight.hvigorExecution;
  if (preflight.blockingMessage) {
    vscode.window.showErrorMessage(preflight.blockingMessage);
    return;
  }

  const task = new vscode.Task(
    { type: 'hvigor', task: 'assembleHap' },
    folder,
    'Build HAP',
    'hvigor',
    new vscode.ShellExecution(hvigorExecution.command, {
      cwd: folder.uri.fsPath,
      ...(hvigorExecution.environment ? { env: hvigorExecution.environment } : {}),
      ...(hvigorExecution.shellPath ? { shellPath: hvigorExecution.shellPath } : {}),
    })
  );
  await vscode.tasks.executeTask(task);
}

export async function cleanBuild(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const hvigorExecution = await resolveHvigorExecution(folder.uri.fsPath, { task: 'clean' });
  if (
    !hvigorExecution.projectSetup.exists && !hvigorExecution.executablePath
    || (hvigorExecution.projectSetup.missingRuntimePaths.length > 0 && hvigorExecution.source !== 'external')
  ) {
    vscode.window.showErrorMessage(formatHvigorProjectSetupIssue(folder.uri.fsPath, hvigorExecution.projectSetup));
    return;
  }

  const task = new vscode.Task(
    { type: 'hvigor', task: 'clean' },
    folder,
    'Clean',
    'hvigor',
    new vscode.ShellExecution(hvigorExecution.command, {
      cwd: folder.uri.fsPath,
      ...(hvigorExecution.environment ? { env: hvigorExecution.environment } : {}),
      ...(hvigorExecution.shellPath ? { shellPath: hvigorExecution.shellPath } : {}),
    })
  );
  await vscode.tasks.executeTask(task);
}
