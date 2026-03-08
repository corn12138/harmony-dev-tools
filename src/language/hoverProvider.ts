import * as vscode from 'vscode';
import { ARKTS_DECORATORS } from '../utils/constants';

const DECORATOR_DOCS: Record<string, string> = {
  '@Component': 'Declares a struct as a custom ArkUI component. Must contain a `build()` method.',
  '@Entry': 'Marks a component as the entry point of a page. Only one per page.',
  '@State': 'Component-level reactive state. Changes trigger UI re-render.',
  '@Prop': 'One-way data binding from parent component. Child gets a copy.',
  '@Link': 'Two-way data binding between parent and child components.',
  '@Provide': 'Provides data to descendant components (paired with @Consume).',
  '@Consume': 'Consumes data provided by ancestor @Provide.',
  '@Watch': 'Registers a callback for state variable changes.',
  '@Observed': 'Marks a class for deep observation of property changes.',
  '@ObjectLink': 'Creates a reference to an @Observed class instance.',
  '@Builder': 'Defines a reusable UI building function.',
  '@BuilderParam': 'Declares a builder function parameter in a component.',
  '@Styles': 'Defines reusable style combinations.',
  '@Extend': 'Extends a built-in component with custom attribute methods.',
  '@CustomDialog': 'Declares a custom dialog component.',
  '@Concurrent': 'Marks a function for concurrent execution in a Worker.',
  '@Sendable': 'Marks a class as transferable between threads.',
  '@Reusable': 'Marks a component for reuse in list scenarios.',
  '@Preview': 'Enables component preview in the IDE previewer.',
};

export function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken
): vscode.Hover | undefined {
  const range = document.getWordRangeAtPosition(position, /@\w+/);
  if (!range) return undefined;

  const word = document.getText(range);
  const doc = DECORATOR_DOCS[word];
  if (!doc) return undefined;

  const markdown = new vscode.MarkdownString();
  markdown.appendCodeblock(word, 'arkts');
  markdown.appendMarkdown(`\n\n${doc}`);
  markdown.appendMarkdown(`\n\n[HarmonyOS Documentation](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/arkts-state-management-overview)`);

  return new vscode.Hover(markdown, range);
}
