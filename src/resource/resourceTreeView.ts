import * as vscode from 'vscode';
import { getResourceIndexer, type ResourceEntry } from './resourceIndexer';

type ResourceNode = ResourceGroupNode | ResourceLeafNode;

interface ResourceGroupNode {
  kind: 'group';
  label: string;
  type: string;
  children: ResourceLeafNode[];
}

interface ResourceLeafNode {
  kind: 'entry';
  resource: ResourceEntry;
}

export class ResourceTreeProvider implements vscode.TreeDataProvider<ResourceNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly indexer = getResourceIndexer();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      this._onDidChangeTreeData,
      this.indexer.onDidUpdate(() => this.refresh()),
    );
    void this.indexer.ensureInitialized().then(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ResourceNode): vscode.TreeItem {
    if (element.kind === 'group') {
      const item = new vscode.TreeItem(
        `${element.label} (${element.children.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon(this.getGroupIcon(element.type));
      item.description = element.type;
      return item;
    }

    const item = new vscode.TreeItem(element.resource.name, vscode.TreeItemCollapsibleState.None);
    item.description = element.resource.key;
    item.tooltip = element.resource.value
      ? `${element.resource.key}\n${element.resource.value}`
      : element.resource.key;
    item.command = {
      command: 'vscode.open',
      title: 'Open Resource',
      arguments: [element.resource.fileUri],
    };
    item.iconPath = new vscode.ThemeIcon(this.getGroupIcon(element.resource.type));
    return item;
  }

  getChildren(element?: ResourceNode): ResourceNode[] {
    if (element?.kind === 'group') {
      return element.children;
    }

    const resources = this.indexer.getAll().sort((a, b) => a.key.localeCompare(b.key));
    if (resources.length === 0) {
      return [];
    }

    const grouped = new Map<string, ResourceEntry[]>();
    for (const resource of resources) {
      const list = grouped.get(resource.type) ?? [];
      list.push(resource);
      grouped.set(resource.type, list);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, entries]) => ({
        kind: 'group' as const,
        type,
        label: this.getGroupLabel(type),
        children: entries.map((resource) => ({ kind: 'entry' as const, resource })),
      }));
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private getGroupLabel(type: string): string {
    switch (type) {
      case 'string': return 'Strings';
      case 'color': return 'Colors';
      case 'media': return 'Media';
      case 'profile': return 'Profiles';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  private getGroupIcon(type: string): string {
    switch (type) {
      case 'string': return 'symbol-string';
      case 'color': return 'symbol-color';
      case 'media': return 'file-media';
      case 'profile': return 'symbol-file';
      default: return 'symbol-key';
    }
  }
}
