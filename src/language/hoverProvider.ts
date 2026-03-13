import * as vscode from 'vscode';
import { getDecoratorByName, apiLabel } from '../utils/metadata';

export function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken
): vscode.Hover | undefined {
  const range = document.getWordRangeAtPosition(position, /@\w+/);
  if (!range) return undefined;

  const word = document.getText(range);
  const meta = getDecoratorByName(word);
  if (!meta) return undefined;

  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.supportHtml = true;

  md.appendCodeblock(word, 'arkts');

  const tag = apiLabel(meta.minApi);
  if (tag) {
    md.appendMarkdown(`\n\n**${tag}** · ${meta.stateModel !== 'common' ? `State Model: **${meta.stateModel.toUpperCase()}**` : 'Common'}\n`);
  }

  md.appendMarkdown(`\n${meta.zh}\n\n${meta.en}\n`);

  if (meta.migration) {
    md.appendMarkdown(`\n---\n**迁移建议 / Migration**: ${meta.migration.to}\n\n> ${meta.migration.hint}\n`);
  }

  md.appendMarkdown(`\n[📖 官方文档 / Docs](${meta.docUrl})`);

  return new vscode.Hover(md, range);
}
