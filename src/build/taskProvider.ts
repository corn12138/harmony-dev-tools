import * as vscode from 'vscode';
import * as path from 'path';

interface HvigorTaskDefinition extends vscode.TaskDefinition {
  task: string;
  module?: string;
}

const HVIGOR_TASKS = [
  { name: 'assembleHap', label: 'Build HAP', group: vscode.TaskGroup.Build },
  { name: 'assembleApp', label: 'Build APP', group: vscode.TaskGroup.Build },
  { name: 'clean', label: 'Clean', group: vscode.TaskGroup.Clean },
  { name: 'test', label: 'Run Tests', group: vscode.TaskGroup.Test },
];

export class HvigorTaskProvider implements vscode.TaskProvider {
  static readonly type = 'hvigor';

  async provideTasks(): Promise<vscode.Task[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return [];

    const tasks: vscode.Task[] = [];

    for (const folder of folders) {
      // Check if hvigorfile.ts exists
      const hvigorFile = vscode.Uri.joinPath(folder.uri, 'hvigorfile.ts');
      try {
        await vscode.workspace.fs.stat(hvigorFile);
      } catch {
        continue; // Not a hvigor project
      }

      for (const taskDef of HVIGOR_TASKS) {
        const definition: HvigorTaskDefinition = { type: HvigorTaskProvider.type, task: taskDef.name };
        const task = new vscode.Task(
          definition,
          folder,
          taskDef.label,
          'hvigor',
          new vscode.ShellExecution(`hvigorw ${taskDef.name} --no-daemon`, { cwd: folder.uri.fsPath }),
          '$hvigor'
        );
        task.group = taskDef.group;
        tasks.push(task);
      }
    }

    return tasks;
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as HvigorTaskDefinition;
    if (!definition.task) return undefined;

    const folder = task.scope as vscode.WorkspaceFolder;
    const modulePart = definition.module ? `:${definition.module}:` : '';
    return new vscode.Task(
      definition,
      folder ?? vscode.TaskScope.Workspace,
      definition.task,
      'hvigor',
      new vscode.ShellExecution(`hvigorw ${modulePart}${definition.task} --no-daemon`),
      '$hvigor'
    );
  }
}
