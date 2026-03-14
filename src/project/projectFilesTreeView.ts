import * as vscode from 'vscode';
import * as path from 'path';
import { getCurrentProjectFileIndex } from './projectDetector';
import type { HarmonyTrackedFile } from './fileTracker';
import type { HarmonyEventBus } from '../core/eventBus';

type TreeElement = FileNode | FolderNode;

interface FileNode {
  type: 'file';
  tracked: HarmonyTrackedFile;
  rootPath: string;
}

interface FolderNode {
  type: 'folder';
  label: string;
  children: TreeElement[];
  description?: string;
}

export class ProjectFilesTreeProvider implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private disposable: vscode.Disposable[] = [];

  constructor(eventBus?: HarmonyEventBus) {
    if (eventBus) {
      this.disposable.push(eventBus.on('project:indexUpdated', () => this._onDidChange.fire()));
    }
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === 'file') {
      const item = new vscode.TreeItem(path.basename(element.tracked.path), vscode.TreeItemCollapsibleState.None);
      item.resourceUri = vscode.Uri.file(element.tracked.path);
      item.description = element.tracked.module;
      item.tooltip = element.tracked.path;
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [item.resourceUri],
      };
      const icon = element.tracked.kind === 'arkts' ? 'file-code' : element.tracked.kind === 'resource' ? 'file-media' : 'file';
      item.iconPath = new vscode.ThemeIcon(icon);
      return item;
    }

    const folder = element as FolderNode;
    const item = new vscode.TreeItem(
      folder.label,
      folder.children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    item.description = folder.description;
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    const index = getCurrentProjectFileIndex();
    if (!index || !index.files.length) {
      return [];
    }

    if (element) {
      return element.type === 'folder' ? element.children : [];
    }

    // Root: group by module, then root configs
    const byModule = new Map<string, HarmonyTrackedFile[]>();
    const rootFiles: HarmonyTrackedFile[] = [];

    for (const f of index.files) {
      if (f.module) {
        const list = byModule.get(f.module) ?? [];
        list.push(f);
        byModule.set(f.module, list);
      } else {
        rootFiles.push(f);
      }
    }

    const nodes: TreeElement[] = [];

    for (const [moduleName] of byModule) {
      const files = byModule.get(moduleName)!;
      const arkts = files.filter((f) => f.kind === 'arkts');
      const config = files.filter((f) => f.kind === 'moduleJson' || f.kind === 'ohPackage');
      const resource = files.filter((f) => f.kind === 'resource');
      const children: TreeElement[] = [];
      if (arkts.length > 0) {
        children.push({
          type: 'folder',
          label: `ArkTS (${arkts.length})`,
          description: moduleName,
          children: arkts.map((t) => ({ type: 'file' as const, tracked: t, rootPath: index.rootPath })),
        });
      }
      if (config.length > 0) {
        children.push({
          type: 'folder',
          label: 'Config',
          description: moduleName,
          children: config.map((t) => ({ type: 'file' as const, tracked: t, rootPath: index.rootPath })),
        });
      }
      if (resource.length > 0) {
        children.push({
          type: 'folder',
          label: `Resources (${resource.length})`,
          description: moduleName,
          children: resource.map((t) => ({ type: 'file' as const, tracked: t, rootPath: index.rootPath })),
        });
      }
      nodes.push({
        type: 'folder',
        label: moduleName,
        description: `${files.length} files`,
        children,
      });
    }

    if (rootFiles.length > 0) {
      nodes.push({
        type: 'folder',
        label: 'Root',
        description: '工程配置',
        children: rootFiles.map((t) => ({ type: 'file' as const, tracked: t, rootPath: index.rootPath })),
      });
    }

    return nodes;
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposable.forEach((d) => d.dispose());
  }
}
