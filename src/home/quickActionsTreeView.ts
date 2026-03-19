import * as vscode from 'vscode';
import {
  HARMONY_ACTION_SECTIONS,
  getHarmonyActionsForSection,
  type HarmonyActionDefinition,
  type HarmonyActionSection,
} from './actions';

type QuickActionNode = QuickActionSectionNode | QuickActionItemNode;

interface QuickActionSectionNode {
  kind: 'section';
  section: HarmonyActionSection;
}

interface QuickActionItemNode {
  kind: 'action';
  action: HarmonyActionDefinition;
}

export class QuickActionsTreeProvider implements vscode.TreeDataProvider<QuickActionNode>, vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.onDidChangeEmitter.event;

  refresh(): void {
    this.onDidChangeEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  getTreeItem(element: QuickActionNode): vscode.TreeItem {
    if (element.kind === 'section') {
      const item = new vscode.TreeItem(
        element.section,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon(getSectionIcon(element.section));
      return item;
    }

    const item = new vscode.TreeItem(element.action.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.action.description;
    item.tooltip = element.action.tooltip;
    item.iconPath = new vscode.ThemeIcon(element.action.icon);
    item.command = {
      command: element.action.command,
      title: element.action.label,
    };
    return item;
  }

  getChildren(element?: QuickActionNode): QuickActionNode[] {
    if (!element) {
      return HARMONY_ACTION_SECTIONS.map((section) => ({ kind: 'section', section }));
    }

    if (element.kind === 'section') {
      return getHarmonyActionsForSection(element.section).map((action) => ({ kind: 'action', action }));
    }

    return [];
  }
}

function getSectionIcon(section: HarmonyActionSection): string {
  switch (section) {
    case 'Run':
      return 'rocket';
    case 'Device':
      return 'device-mobile';
    case 'Project':
      return 'tools';
  }
}
