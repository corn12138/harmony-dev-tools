import * as vscode from 'vscode';
import { formatHvigorProjectSetupIssue, resolveHvigorExecution } from '../utils/hvigor';
import { resolveAssembleHapPreflight } from './preflight';

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
        const preflight = taskDef.name.startsWith('assemble')
          ? await resolveAssembleHapPreflight(folder.uri.fsPath, { task: taskDef.name })
          : {
              hvigorExecution: await resolveHvigorExecution(folder.uri.fsPath, { task: taskDef.name }),
              warnings: [],
              blockingMessage: undefined,
            };
        const hvigorExecution = preflight.hvigorExecution;
        const isHvigorBroken =
          !hvigorExecution.projectSetup.exists && !hvigorExecution.executablePath
          || (hvigorExecution.projectSetup.missingRuntimePaths.length > 0 && hvigorExecution.source !== 'external');
        if (isHvigorBroken || preflight.blockingMessage) {
          continue;
        }
        const task = new vscode.Task(
          definition,
          folder,
          taskDef.label,
          'hvigor',
          new vscode.ShellExecution(hvigorExecution.command, {
            cwd: folder.uri.fsPath,
            ...(hvigorExecution.environment ? { env: hvigorExecution.environment } : {}),
            ...(hvigorExecution.shellPath ? { shellPath: hvigorExecution.shellPath } : {}),
          }),
          '$hvigor'
        );
        task.group = taskDef.group;
        tasks.push(task);
      }
    }

    return tasks;
  }

  async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
    const definition = task.definition as HvigorTaskDefinition;
    if (!definition.task) return undefined;

    const folder = task.scope as vscode.WorkspaceFolder;
    const folderPath = folder?.uri.fsPath;
    if (!folderPath) {
      return undefined;
    }
    const hvigorExecution = await resolveHvigorExecution(folderPath, {
      task: definition.task,
      module: definition.module,
    });
    const preflight = definition.task.startsWith('assemble')
      ? await resolveAssembleHapPreflight(folderPath, {
          task: definition.task,
        })
      : {
          hvigorExecution,
          warnings: [],
          blockingMessage: undefined,
        };
    const resolvedExecution = preflight.hvigorExecution;
    if (
      !resolvedExecution.projectSetup.exists && !resolvedExecution.executablePath
      || (resolvedExecution.projectSetup.missingRuntimePaths.length > 0 && resolvedExecution.source !== 'external')
    ) {
      void vscode.window.showWarningMessage(formatHvigorProjectSetupIssue(folderPath, resolvedExecution.projectSetup));
      return undefined;
    }
    if (preflight.blockingMessage) {
      void vscode.window.showWarningMessage(preflight.blockingMessage);
      return undefined;
    }

    return new vscode.Task(
      definition,
      folder ?? vscode.TaskScope.Workspace,
      definition.task,
      'hvigor',
      new vscode.ShellExecution(
        resolvedExecution.command,
        {
          cwd: folder.uri.fsPath,
          ...(resolvedExecution.environment ? { env: resolvedExecution.environment } : {}),
          ...(resolvedExecution.shellPath ? { shellPath: resolvedExecution.shellPath } : {}),
        },
      ),
      '$hvigor'
    );
  }
}
