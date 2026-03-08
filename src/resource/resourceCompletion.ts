import * as vscode from 'vscode';
import { getResourceIndexer, ResourceEntry } from './resourceIndexer';

const RESOURCE_REF_REGEX = /\$r\s*\(\s*['"]([^'"]*)/;

export class ResourceCompletionProvider implements vscode.CompletionItemProvider {
  private indexer = getResourceIndexer();
  private initialized = false;

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    // Lazy init
    if (!this.initialized) {
      await this.indexer.rebuild();
      this.initialized = true;
    }

    const lineText = document.lineAt(position).text.substring(0, position.character);
    const match = lineText.match(RESOURCE_REF_REGEX);
    if (!match) return [];

    const typed = match[1]; // What user has typed so far, e.g. 'app.str'
    const resources = this.indexer.getAll();

    return resources
      .filter((r) => r.key.startsWith(typed) || !typed)
      .map((r) => this.toCompletionItem(r));
  }

  private toCompletionItem(entry: ResourceEntry): vscode.CompletionItem {
    const kind = this.getCompletionKind(entry.type);
    const item = new vscode.CompletionItem(entry.key, kind);
    item.detail = `${entry.type} resource`;
    item.sortText = `0_${entry.key}`;

    if (entry.value !== undefined) {
      item.documentation = new vscode.MarkdownString(`**Value:** \`${entry.value}\``);
    }

    if (entry.type === 'media') {
      item.documentation = new vscode.MarkdownString(`**File:** ${entry.fileUri.fsPath.split('/').pop()}`);
    }

    // Replace from after the opening quote
    item.insertText = entry.key;
    return item;
  }

  private getCompletionKind(type: string): vscode.CompletionItemKind {
    switch (type) {
      case 'string': return vscode.CompletionItemKind.Text;
      case 'color': return vscode.CompletionItemKind.Color;
      case 'media': return vscode.CompletionItemKind.File;
      case 'float': return vscode.CompletionItemKind.Value;
      default: return vscode.CompletionItemKind.Reference;
    }
  }
}
