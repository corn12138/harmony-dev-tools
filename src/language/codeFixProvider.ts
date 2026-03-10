import * as vscode from 'vscode';
import { DIAG_CODES, DiagCode } from './diagnosticProvider';

const SOURCE = 'HarmonyOS';

// ---------------------------------------------------------------------------
// Public API — registers a CodeActionProvider for .ets files
// ---------------------------------------------------------------------------

export function createCodeFixProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = vscode.languages.registerCodeActionsProvider(
    { language: 'arkts', scheme: 'file' },
    new ArkTSCodeFixProvider(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  );
  context.subscriptions.push(provider);
  return provider;
}

// ---------------------------------------------------------------------------
// CodeActionProvider implementation
// ---------------------------------------------------------------------------

class ArkTSCodeFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== SOURCE) continue;
      const code = diag.code as DiagCode;
      const fixes = this.getFixesForCode(document, diag, code);
      actions.push(...fixes);
    }

    return actions;
  }

  private getFixesForCode(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
    code: DiagCode,
  ): vscode.CodeAction[] {
    switch (code) {
      case DIAG_CODES.ANY_TYPE:
      case DIAG_CODES.UNKNOWN_TYPE:
        return this.fixAnyType(document, diag);
      case DIAG_CODES.AS_ANY:
        return this.fixAsAny(document, diag);
      case DIAG_CODES.IMPLICIT_ANY:
        return this.fixImplicitAny(document, diag);
      case DIAG_CODES.STATE_SHALLOW:
        return this.fixStateShallow(document, diag);
      case DIAG_CODES.LINK_IN_V2:
        return this.fixLinkInV2(document, diag);
      case DIAG_CODES.FOREACH_PERF:
        return this.fixForEach(document, diag);
      case DIAG_CODES.V1_V2_MIX:
        return this.fixV1V2Mix(document, diag);
      case DIAG_CODES.BUILD_HEAVY:
        return []; // No auto-fix — requires manual refactoring
      default:
        return [];
    }
  }

  // Replace `: any` or `: unknown` with `: string` (and offer other common types)
  private fixAnyType(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const badType = document.getText(diag.range);
    const suggestions = ['string', 'number', 'boolean', 'object', 'Record<string, Object>'];
    return suggestions.map((type) => {
      const action = new vscode.CodeAction(
        `替换 \`${badType}\` 为 \`${type}\``,
        vscode.CodeActionKind.QuickFix,
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, diag.range, type);
      action.diagnostics = [diag];
      action.isPreferred = type === 'string';
      return action;
    });
  }

  // Replace `as any` with `as unknown as TargetType`
  private fixAsAny(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const action = new vscode.CodeAction(
      '移除 `as any`',
      vscode.CodeActionKind.QuickFix,
    );
    const lineText = document.lineAt(diag.range.start.line).text;
    const beforeCast = lineText.substring(0, diag.range.start.character).trimEnd();
    const afterCast = lineText.substring(diag.range.end.character);
    const fullRange = new vscode.Range(
      diag.range.start.line, 0,
      diag.range.start.line, lineText.length,
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, fullRange, beforeCast + afterCast);
    action.diagnostics = [diag];
    return [action];
  }

  // Add `: string` type to untyped parameter
  private fixImplicitAny(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const paramName = document.getText(diag.range);
    const action = new vscode.CodeAction(
      `为 \`${paramName}\` 添加类型标注`,
      vscode.CodeActionKind.QuickFix,
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, diag.range, `${paramName}: string`);
    action.diagnostics = [diag];
    return [action];
  }

  // Suggest replacing @State with @ObservedV2 + @Trace
  private fixStateShallow(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const action = new vscode.CodeAction(
      '@State → @ObservedV2 + @Trace（深度观察）',
      vscode.CodeActionKind.QuickFix,
    );
    const lineText = document.lineAt(diag.range.start.line).text;
    const newLine = lineText.replace('@State', '@Trace');
    const fullRange = new vscode.Range(
      diag.range.start.line, 0,
      diag.range.start.line, lineText.length,
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, fullRange, newLine);
    action.diagnostics = [diag];
    return [action];
  }

  // Replace @Link with @Param
  private fixLinkInV2(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const lineText = document.lineAt(diag.range.start.line).text;

    const toParam = new vscode.CodeAction(
      '@Link → @Param（单向绑定）',
      vscode.CodeActionKind.QuickFix,
    );
    toParam.edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      diag.range.start.line, 0,
      diag.range.start.line, lineText.length,
    );
    toParam.edit.replace(document.uri, fullRange, lineText.replace('@Link', '@Param'));
    toParam.diagnostics = [diag];
    toParam.isPreferred = true;

    return [toParam];
  }

  // Replace ForEach with LazyForEach
  private fixForEach(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const action = new vscode.CodeAction(
      'ForEach → LazyForEach（按需渲染）',
      vscode.CodeActionKind.QuickFix,
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, diag.range, 'LazyForEach');
    action.diagnostics = [diag];
    return [action];
  }

  // Offer V1→V2 full migration
  private fixV1V2Mix(document: vscode.TextDocument, diag: vscode.Diagnostic): vscode.CodeAction[] {
    const action = new vscode.CodeAction(
      '执行 V1 → V2 装饰器迁移',
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      title: 'Migrate V1 → V2',
      command: 'harmony.migrateV1ToV2',
    };
    action.diagnostics = [diag];
    return [action];
  }
}
