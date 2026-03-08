import * as vscode from 'vscode';
import * as path from 'path';
import { HarmonyModule, ModuleContext } from '../core/module';
import { CONFIG_FILES, CONTEXT_KEYS } from '../utils/constants';

export interface ProjectInfo {
  rootPath: string;
  modules: string[];
  appName?: string;
  bundleName?: string;
  sdkVersion?: number;
}

export class ProjectDetectorModule implements HarmonyModule {
  readonly id = 'harmony.projectDetector';
  isActive = false;
  private statusBarItem?: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  async activate(ctx: ModuleContext): Promise<void> {
    const projectInfo = await this.detectProject();

    if (projectInfo) {
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
      ctx.logger.info(`HarmonyOS project detected: ${projectInfo.rootPath}`);
    } else {
      vscode.commands.executeCommand('setContext', CONTEXT_KEYS.IS_HARMONY_PROJECT, false);
    }

    // Watch for config changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/{build-profile,oh-package,module,app}.json5');
    watcher.onDidChange((uri) => {
      ctx.eventBus.emit('project:configChanged', {
        file: uri.fsPath,
        type: path.basename(uri.fsPath),
      });
    });
    this.disposables.push(watcher);

    this.isActive = true;
  }

  async deactivate(): Promise<void> {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.isActive = false;
  }

  private async detectProject(): Promise<ProjectInfo | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return null;

    for (const folder of workspaceFolders) {
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
      // Simple JSON5 parse for bundleName (avoid heavy dependency)
      const bundleMatch = text.match(/"bundleName"\s*:\s*"([^"]+)"/);
      return { bundleName: bundleMatch?.[1] };
    } catch {
      return {};
    }
  }
}
