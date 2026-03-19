import * as vscode from 'vscode';
import { getDecorators, getComponents, apiLabel } from '../utils/metadata';

const LIFECYCLE_METHODS = [
  { name: 'aboutToAppear', doc: 'Called before the component build function is executed' },
  { name: 'aboutToDisappear', doc: 'Called before the component is destroyed' },
  { name: 'onPageShow', doc: 'Called when the page is displayed (Entry only)' },
  { name: 'onPageHide', doc: 'Called when the page is hidden (Entry only)' },
  { name: 'onBackPress', doc: 'Called when the back button is pressed (Entry only)' },
  { name: 'aboutToReuse', doc: 'Called when a reusable component is about to be reused (@Reusable / @ReusableV2)' },
  { name: 'aboutToRecycle', doc: 'Called when a reusable component is recycled (@Reusable / @ReusableV2)' },
  { name: 'onWillApplyTheme', doc: 'Called before theme is applied to the component. Commonly used with ThemeControl.setDefaultTheme() or WithTheme(...). API 12+; supported in state management V2 components from API 16.' },
];

export function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken,
  _context: vscode.CompletionContext
): vscode.CompletionItem[] {
  const lineText = document.lineAt(position).text;
  const charBefore = lineText.charAt(position.character - 1);
  const items: vscode.CompletionItem[] = [];

  if (charBefore === '@') {
    for (const dec of getDecorators()) {
      const name = dec.name.slice(1);
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Keyword);
      const tag = apiLabel(dec.minApi);
      item.detail = tag ? `ArkTS Decorator (${tag})` : 'ArkTS Decorator';
      item.documentation = new vscode.MarkdownString(`${dec.zh}\n\n${dec.en}`);
      item.insertText = name;
      item.sortText = '0' + name;
      items.push(item);
    }
    return items;
  }

  for (const comp of getComponents()) {
    const item = new vscode.CompletionItem(comp.name, vscode.CompletionItemKind.Class);
    const tag = apiLabel(comp.minApi);
    item.detail = tag ? `ArkUI Component (${tag})` : 'ArkUI Component';
    item.documentation = new vscode.MarkdownString(`${comp.zh}\n\n${comp.en}`);
    if (comp.hasChildren) {
      item.insertText = new vscode.SnippetString(`${comp.name}($1) {\n  $0\n}`);
    } else {
      item.insertText = new vscode.SnippetString(`${comp.name}($1)`);
    }
    items.push(item);
  }

  for (const method of LIFECYCLE_METHODS) {
    const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
    item.detail = 'Lifecycle';
    item.documentation = method.doc;
    item.insertText = new vscode.SnippetString(`${method.name}(): void {\n  $0\n}`);
    items.push(item);
  }

  if (lineText.includes("$r('") || lineText.includes('$r("')) {
    return provideResourceCompletions(document);
  }

  return items;
}

function provideResourceCompletions(_document: vscode.TextDocument): vscode.CompletionItem[] {
  const resourceTypes = ['app.string', 'app.media', 'app.color', 'app.float', 'app.boolean', 'app.intarray', 'app.plural'];
  return resourceTypes.map((type) => {
    const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Value);
    item.detail = 'Resource Type';
    item.insertText = new vscode.SnippetString(`${type}.$1`);
    return item;
  });
}
