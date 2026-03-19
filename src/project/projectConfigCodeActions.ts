import * as vscode from 'vscode';
import {
  PROJECT_CONFIG_DIAG_CODES,
  PROJECT_CONFIG_DIAG_SOURCE,
} from './projectConfigDiagnostics';
import { COMMANDS } from '../utils/constants';
import { syncAppBundleNameToSigningProfile, resolveSigningProfileInfo } from './signingProfile';
import { findJson5StringValue } from '../utils/json5';
import { getPreferredWorkspaceFolder } from '../utils/workspace';

export function createProjectConfigCodeActions(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = vscode.languages.registerCodeActionsProvider(
    [
      { scheme: 'file', pattern: '**/build-profile.json5' },
      { scheme: 'file', pattern: '**/AppScope/app.json5' },
      { scheme: 'file', pattern: '**/src/main/module.json5' },
      { scheme: 'file', pattern: '**/src/main/resources/base/profile/*.json' },
      { scheme: 'file', language: 'arkts' },
    ],
    new ProjectConfigCodeActionProvider(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );

  context.subscriptions.push(provider);
  return provider;
}

class ProjectConfigCodeActionProvider implements vscode.CodeActionProvider {
  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== PROJECT_CONFIG_DIAG_SOURCE) {
        continue;
      }

      switch (diagnostic.code) {
        case PROJECT_CONFIG_DIAG_CODES.TARGET_SDK_MISSING:
        case PROJECT_CONFIG_DIAG_CODES.BUILD_MODE_SET_MISSING:
          actions.push(this.createBuildProfileMigrationAction(document.uri, diagnostic));
          break;
        case PROJECT_CONFIG_DIAG_CODES.PAGE_ENTRY_MISSING:
          actions.push(this.createAddEntryAction(document, diagnostic));
          break;
        case PROJECT_CONFIG_DIAG_CODES.ROUTE_BUILDER_DECORATOR_MISSING:
          actions.push(this.createAddBuilderAction(document, diagnostic));
          break;
        case PROJECT_CONFIG_DIAG_CODES.SIGNING_BUNDLE_NAME_MISMATCH: {
          const action = await this.createSyncSigningBundleNameAction(document, diagnostic);
          if (action) {
            actions.push(action);
          }
          break;
        }
        default:
          break;
      }
    }

    return actions;
  }

  private createBuildProfileMigrationAction(uri: vscode.Uri, diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '迁移为新版 build-profile 配置',
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: COMMANDS.MIGRATE_BUILD_PROFILE,
      title: 'Migrate build-profile',
      arguments: [uri],
    };
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }

  private createAddEntryAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '为页面补上 @Entry',
      vscode.CodeActionKind.QuickFix,
    );
    const edit = new vscode.WorkspaceEdit();
    const text = document.getText();
    const componentMatch = text.match(/^\s*@Component(V2)?\b/m);
    const insertOffset = componentMatch?.index ?? 0;
    const insertPosition = document.positionAt(insertOffset);
    edit.insert(document.uri, insertPosition, '@Entry\n');
    action.edit = edit;
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }

  private createAddBuilderAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '为构建函数补上 @Builder',
      vscode.CodeActionKind.QuickFix,
    );
    const edit = new vscode.WorkspaceEdit();
    const line = diagnostic.range.start.line;
    const lineStart = new vscode.Position(line, 0);
    edit.insert(document.uri, lineStart, '@Builder\n');
    action.edit = edit;
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }

  private async createSyncSigningBundleNameAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): Promise<vscode.CodeAction | undefined> {
    const folder = getPreferredWorkspaceFolder(document.uri);
    if (!folder) {
      return undefined;
    }

    const signingInfo = await resolveSigningProfileInfo(folder.uri);
    if (!signingInfo?.bundleName) {
      return undefined;
    }

    const match = findJson5StringValue(document.getText(), 'bundleName');
    if (!match) {
      return undefined;
    }

    const action = new vscode.CodeAction(
      `同步为签名 profile 中的 bundleName: ${signingInfo.bundleName}`,
      vscode.CodeActionKind.QuickFix,
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(match.valueStart),
        document.positionAt(match.valueEnd),
      ),
      signingInfo.bundleName,
    );
    action.edit = edit;
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    action.command = {
      command: 'workbench.action.files.save',
      title: 'Save app.json5',
    };
    return action;
  }
}
