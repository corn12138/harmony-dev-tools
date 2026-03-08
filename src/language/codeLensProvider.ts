import * as vscode from 'vscode';

const COMPONENT_REGEX = /^@Component\s*$/m;
const STRUCT_REGEX = /struct\s+(\w+)/;
const ENTRY_REGEX = /^@Entry\s*$/m;
const BUILDER_REGEX = /@Builder\s+(\w+)\s*\(/;

export function provideCodeLenses(
  document: vscode.TextDocument,
  _token: vscode.CancellationToken
): vscode.CodeLens[] {
  const lenses: vscode.CodeLens[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // @Component struct — show reference count
    if (COMPONENT_REGEX.test(line)) {
      const nextLine = lines[i + 1]?.trim() ?? '';
      const structMatch = nextLine.match(STRUCT_REGEX);
      if (structMatch) {
        const range = new vscode.Range(i, 0, i, line.length);
        lenses.push(new vscode.CodeLens(range, {
          title: `$(references) Find references`,
          command: 'editor.action.findReferences',
          arguments: [document.uri, new vscode.Position(i + 1, nextLine.indexOf(structMatch[1]))],
        }));
      }
    }

    // @Entry — show route info
    if (ENTRY_REGEX.test(line)) {
      const range = new vscode.Range(i, 0, i, line.length);
      lenses.push(new vscode.CodeLens(range, {
        title: `$(globe) Entry Page`,
        command: '',
      }));
    }

    // @Builder — show usage count
    const builderMatch = line.match(BUILDER_REGEX);
    if (builderMatch) {
      const builderName = builderMatch[1];
      const usageCount = (text.match(new RegExp(`\\b${builderName}\\b`, 'g'))?.length ?? 1) - 1;
      const range = new vscode.Range(i, 0, i, line.length);
      lenses.push(new vscode.CodeLens(range, {
        title: `$(symbol-method) ${usageCount} usage${usageCount !== 1 ? 's' : ''}`,
        command: 'editor.action.findReferences',
        arguments: [document.uri, new vscode.Position(i, line.indexOf(builderName))],
      }));
    }
  }

  return lenses;
}
