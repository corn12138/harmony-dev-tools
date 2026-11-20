import * as vscode from 'vscode';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { readBuildProfile } from '../utils/harmonySdk';
import { findRootObjectFieldStart } from '../utils/json5';

export interface BuildProfileMigrationIssue {
  code: 'buildModeSetMissing';
  message: string;
}

export interface BuildProfileMigrationAnalysis {
  issues: BuildProfileMigrationIssue[];
}

export interface BuildProfileMigrationResult {
  changed: boolean;
  text: string;
  changes: BuildProfileMigrationIssue['code'][];
}

function detectIndent(text: string): string {
  const match = text.match(/\n([ \t]+)(?:"app"|app)\s*:/);
  return match?.[1] ?? '  ';
}

function detectLineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function insertIntoAppObject(text: string, block: string): string {
  const appBraceIndex = findRootObjectFieldStart(text, 'app');
  if (appBraceIndex === undefined) return text;

  const indent = detectIndent(text);
  const lineEnding = detectLineEnding(text);
  const blockIndent = `${indent.repeat(2)}`;
  const blockText = `${lineEnding}${blockIndent}${block.trim().replace(/\n/g, lineEnding + blockIndent)}`;
  return `${text.slice(0, appBraceIndex + 1)}${blockText}${text.slice(appBraceIndex + 1)}`;
}

export function analyzeBuildProfileMigration(text: string, profile = readBuildProfile(text)): BuildProfileMigrationAnalysis {
  const app = profile?.app;
  const issues: BuildProfileMigrationIssue[] = [];
  const isHarmonyProduct = Array.isArray(app?.products) && app.products.some(product =>
    product && (product.runtimeOS === 'HarmonyOS' || typeof product.targetSdkVersion === 'string' ||
      typeof product.compileSdkVersion === 'string' || typeof product.compatibleSdkVersion === 'string'));
  if (app && app.buildModeSet === undefined && (app.runtimeOS === 'HarmonyOS' || isHarmonyProduct)) {
    issues.push({
      code: 'buildModeSetMissing',
      message: 'buildModeSet 是可选配置。需要自定义 debug 或 release 时，可显式添加构建模式。',
    });
  }
  return { issues };
}

export function applyBuildProfileMigration(text: string): BuildProfileMigrationResult {
  const analysis = analyzeBuildProfileMigration(text);
  const changes: BuildProfileMigrationIssue['code'][] = [];
  let nextText = text;

  if (analysis.issues.some((issue) => issue.code === 'buildModeSetMissing')) {
    const beforeBuildModeSetInsert = nextText;
    nextText = insertIntoAppObject(
      nextText,
      `buildModeSet: [\n  {\n    name: "debug"\n  },\n  {\n    name: "release"\n  }\n],`
    );
    if (nextText !== beforeBuildModeSetInsert) {
      changes.push('buildModeSetMissing');
    }
  }

  return {
    changed: changes.length > 0 && nextText !== text,
    text: nextText,
    changes,
  };
}

export async function migrateBuildProfile(targetUri?: vscode.Uri): Promise<void> {
  let uri = targetUri;

  if (!uri) {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri?.fsPath.endsWith('build-profile.json5')) {
      uri = activeUri;
    }
  }

  if (!uri) {
    const folder = getPreferredWorkspaceFolder();
    if (folder) {
      uri = vscode.Uri.joinPath(folder.uri, 'build-profile.json5');
    }
  }

  if (!uri) {
    vscode.window.showWarningMessage('未找到 build-profile.json5。');
    return;
  }

  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch {
    vscode.window.showWarningMessage(`无法打开 ${uri.fsPath}。`);
    return;
  }

  const result = applyBuildProfileMigration(document.getText());
  if (!result.changed) {
    vscode.window.showInformationMessage('当前 build-profile.json5 已经是较新的配置形态。');
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(uri, fullRange, result.text);
  await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(document, { preview: false });
  vscode.window.showInformationMessage(`已更新 build-profile.json5：${result.changes.join('、')}`);
}
