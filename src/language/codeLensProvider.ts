import * as vscode from 'vscode';

const COMPONENT_REGEX = /^@Component\b/;
const STRUCT_REGEX = /struct\s+(\w+)/;
const ENTRY_REGEX = /^@Entry\b/;
const BUILDER_REGEX = /@Builder\s+([\w$]+)\s*\(/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function provideCodeLenses(
  document: vscode.TextDocument,
  _token: vscode.CancellationToken
): vscode.CodeLens[] {
  const lenses: vscode.CodeLens[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // @Component struct — show reference count
    if (COMPONENT_REGEX.test(trimmed)) {
      const rawNextLine = lines[i + 1] ?? '';
      const structMatch = rawNextLine.match(STRUCT_REGEX);
      if (structMatch) {
        const range = new vscode.Range(i, 0, i, rawLine.length);
        const col = rawNextLine.indexOf(structMatch[1]);
        lenses.push(new vscode.CodeLens(range, {
          title: `$(references) Find references`,
          command: 'editor.action.findReferences',
          arguments: [document.uri, new vscode.Position(i + 1, col >= 0 ? col : 0)],
        }));
      }
    }

    // @Entry — show route info
    if (ENTRY_REGEX.test(trimmed)) {
      const range = new vscode.Range(i, 0, i, rawLine.length);
      lenses.push(new vscode.CodeLens(range, {
        title: `$(globe) Entry Page`,
        command: '',
      }));
    }

    // @Builder — show usage count
    const builderMatch = trimmed.match(BUILDER_REGEX);
    if (builderMatch) {
      const builderName = builderMatch[1];
      const usageCount = (text.match(new RegExp(`\\b${escapeRegExp(builderName)}\\b`, 'g'))?.length ?? 1) - 1;
      const range = new vscode.Range(i, 0, i, rawLine.length);
      const col = rawLine.indexOf(builderName);
      lenses.push(new vscode.CodeLens(range, {
        title: `$(symbol-method) ${usageCount} usage${usageCount !== 1 ? 's' : ''}`,
        command: 'editor.action.findReferences',
        arguments: [document.uri, new vscode.Position(i, col >= 0 ? col : 0)],
      }));
    }
  }

  return lenses;
}
