import * as vscode from 'vscode';
import { ARKTS_DECORATORS } from '../utils/constants';

const ARKUI_COMPONENTS = [
  'Column', 'Row', 'Stack', 'Flex', 'Grid', 'GridItem', 'List', 'ListItem',
  'Scroll', 'Tabs', 'TabContent', 'Swiper', 'Navigation', 'NavRouter', 'NavDestination',
  'Text', 'Span', 'Button', 'Image', 'TextInput', 'TextArea', 'Toggle',
  'Radio', 'Checkbox', 'Select', 'Slider', 'Progress', 'LoadingProgress',
  'Divider', 'Blank', 'Search', 'Rating', 'Stepper', 'StepperItem',
  'Badge', 'Marquee', 'Counter', 'DatePicker', 'TimePicker',
  'AlphabetIndexer', 'Panel', 'Refresh', 'WaterFlow', 'FlowItem',
  'RelativeContainer', 'SideBarContainer', 'Web', 'RichText', 'Video',
];

const LIFECYCLE_METHODS = [
  { name: 'aboutToAppear', doc: 'Called before the component build function is executed' },
  { name: 'aboutToDisappear', doc: 'Called before the component is destroyed' },
  { name: 'onPageShow', doc: 'Called when the page is displayed (Entry only)' },
  { name: 'onPageHide', doc: 'Called when the page is hidden (Entry only)' },
  { name: 'onBackPress', doc: 'Called when the back button is pressed (Entry only)' },
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

  // Decorator completions after @
  if (charBefore === '@') {
    for (const dec of ARKTS_DECORATORS) {
      const name = dec.slice(1); // Remove @
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Keyword);
      item.detail = `ArkTS Decorator`;
      item.insertText = name;
      item.sortText = '0' + name;
      items.push(item);
    }
    return items;
  }

  // ArkUI component completions
  for (const comp of ARKUI_COMPONENTS) {
    const item = new vscode.CompletionItem(comp, vscode.CompletionItemKind.Class);
    item.detail = 'ArkUI Component';
    item.insertText = new vscode.SnippetString(`${comp}($1) {\n  $0\n}`);
    items.push(item);
  }

  // Lifecycle method completions
  for (const method of LIFECYCLE_METHODS) {
    const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
    item.detail = 'Lifecycle';
    item.documentation = method.doc;
    item.insertText = new vscode.SnippetString(`${method.name}(): void {\n  $0\n}`);
    items.push(item);
  }

  // $r() resource reference completion
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
