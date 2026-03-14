import * as vscode from 'vscode';
import * as path from 'path';
import { HarmonyModule, ModuleContext } from '../core/module';
import { CONFIG_FILES, CONTEXT_KEYS } from '../utils/constants';
import { extractJson5StringValue } from '../utils/json5';
import { HarmonyProjectFileIndex, HarmonyProjectFileTracker } from './fileTracker';

export interface ProjectInfo {
  rootPath: string;
  modules: string[];
  appName?: string;
  bundleName?: string;
  sdkVersion?: number;
}

let currentProjectInfo: ProjectInfo | undefined;
let currentProjectFileIndex: HarmonyProjectFileIndex | undefined;

export function getCurrentProjectInfo(): ProjectInfo | undefined {
  return currentProjectInfo;
}

export function getCurrentProjectFileIndex(): HarmonyProjectFileIndex | undefined {
  return currentProjectFileIndex;
}

export class ProjectDetectorModule implements HarmonyModule {
  readonly id = 'harmony.projectDetector';
  isActive = false;
  private statusBarItem?: vscode.StatusBarItem;
  private fileTracker?: HarmonyProjectFileTracker;
  private disposables: vscode.Disposable[] = [];

  async activate(ctx: ModuleContext): Promise<void> {
    const projectInfo = await this.detectProject();

    if (projectInfo) {
      currentProjectInfo = projectInfo;
      // Set context for when-clauses
      vscode.commands.executeCommand('setContext', CONTEXT_KEYS.IS_HARMONY_PROJECT, true);

      // Show status bar
      this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      this.statusBarItem.text = `$(hubot) HarmonyOS`;
      this.statusBarItem.tooltip = `Project: ${projectInfo.appName ?? path.basename(projectInfo.rootPath)}`;
      this.statusBarItem.show();
      this.disposables.push(this.statusBarItem);

      ctx.eventBus.emit('project:detected', {
        rootPath: projectInfo.rootPath,
        modules: projectInfo.modules,
      });
      this.fileTracker = new HarmonyProjectFileTracker(vscode.Uri.file(projectInfo.rootPath), ctx.eventBus);
      this.disposables.push(this.fileTracker);
      const indexUpdatedSub = ctx.eventBus.on('project:indexUpdated', (data) => {
        currentProjectFileIndex = data as HarmonyProjectFileIndex;
      });
      this.disposables.push(indexUpdatedSub);
      const index = await this.fileTracker.rebuild();
      currentProjectFileIndex = index;
      ctx.logger.info(`HarmonyOS project detected: ${projectInfo.rootPath}`);
      ctx.logger.info(`Tracked HarmonyOS files: ${index.files.length}`);
    } else {
      currentProjectInfo = undefined;
      currentProjectFileIndex = undefined;
      vscode.commands.executeCommand('setContext', CONTEXT_KEYS.IS_HARMONY_PROJECT, false);
    }

    this.isActive = true;
  }

  async deactivate(): Promise<void> {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    currentProjectInfo = undefined;
    currentProjectFileIndex = undefined;
    this.isActive = false;
  }

  private async detectProject(): Promise<ProjectInfo | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return null;

    const activeFolder = vscode.window.activeTextEditor?.document.uri
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : undefined;
    const orderedFolders = activeFolder
      ? [activeFolder, ...workspaceFolders.filter((folder) => folder.uri.toString() !== activeFolder.uri.toString())]
      : workspaceFolders;

    for (const folder of orderedFolders) {
      const buildProfileUri = vscode.Uri.joinPath(folder.uri, CONFIG_FILES.BUILD_PROFILE);
      try {
        await vscode.workspace.fs.stat(buildProfileUri);
        const modules = await this.findModules(folder.uri);
        const appInfo = await this.readAppInfo(folder.uri);
        return {
          rootPath: folder.uri.fsPath,
          modules,
          ...appInfo,
        };
      } catch {
        // Not a HarmonyOS project, continue
      }
    }
    return null;
  }

  private async findModules(rootUri: vscode.Uri): Promise<string[]> {
    const modules: string[] = [];
    try {
      const entries = await vscode.workspace.fs.readDirectory(rootUri);
      for (const [name, type] of entries) {
        if (type === vscode.FileType.Directory) {
          const moduleJson = vscode.Uri.joinPath(rootUri, name, 'src/main', CONFIG_FILES.MODULE_JSON);
          try {
            await vscode.workspace.fs.stat(moduleJson);
            modules.push(name);
          } catch {
            // Not a module directory
          }
        }
      }
    } catch {
      // Ignore
    }
    return modules;
  }

  private async readAppInfo(rootUri: vscode.Uri): Promise<{ appName?: string; bundleName?: string }> {
    try {
      const appJsonUri = vscode.Uri.joinPath(rootUri, 'AppScope', CONFIG_FILES.APP_JSON);
      const content = await vscode.workspace.fs.readFile(appJsonUri);
      const text = Buffer.from(content).toString('utf8');
      return {
        appName: extractJson5StringValue(text, 'label'),
        bundleName: extractJson5StringValue(text, 'bundleName'),
      };
    } catch {
      return {};
    }
  }
}
