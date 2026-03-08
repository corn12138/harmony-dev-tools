import * as vscode from 'vscode';

export async function buildHap(): Promise<void> {
  const task = new vscode.Task(
    { type: 'hvigor', task: 'assembleHap' },
    vscode.TaskScope.Workspace,
    'Build HAP',
    'hvigor',
    new vscode.ShellExecution('./hvigorw assembleHap --no-daemon')
  );
  await vscode.tasks.executeTask(task);
}

export async function cleanBuild(): Promise<void> {
  const task = new vscode.Task(
    { type: 'hvigor', task: 'clean' },
    vscode.TaskScope.Workspace,
    'Clean',
    'hvigor',
    new vscode.ShellExecution('./hvigorw clean --no-daemon')
  );
  await vscode.tasks.executeTask(task);
}
