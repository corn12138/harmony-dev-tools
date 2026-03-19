import * as vscode from 'vscode';
import { getPreferredWorkspaceFolder } from '../utils/workspace';

export interface BuildProfileMigrationIssue {
  code: 'targetSdkVersionMissing' | 'buildModeSetMissing';
  message: string;
}

export interface BuildProfileMigrationAnalysis {
  issues: BuildProfileMigrationIssue[];
  suggestedTargetSdkVersion?: string | number;
}

export interface BuildProfileMigrationResult {
  changed: boolean;
  text: string;
  changes: BuildProfileMigrationIssue['code'][];
}

interface ProductBlock {
  start: number;
  end: number;
  text: string;
}

function readFieldValue(text: string, key: string): string | number | undefined {
  const match = text.match(new RegExp(`(?:["']${key}["']|\\b${key}\\b)\\s*:\\s*(?:"([^"]+)"|'([^']+)'|(\\d+))`));
  if (!match) {
    return undefined;
  }

  if (match[1] !== undefined) {
    return match[1];
  }

  if (match[2] !== undefined) {
    return match[2];
  }

  if (match[3] !== undefined) {
    return Number(match[3]);
  }

  return undefined;
}

function pickSuggestedTargetSdkVersion(text: string): string | number | undefined {
  return readFieldValue(text, 'targetSdkVersion')
    ?? readFieldValue(text, 'compatibleSdkVersion')
    ?? readFieldValue(text, 'compileSdkVersion');
}

function findMatchingBracket(text: string, start: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote: '"' | '\'' | undefined;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        index++;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth++;
      continue;
    }

    if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractProductBlocks(text: string): ProductBlock[] {
  const productsMatch = text.match(/(?:["']products["']|products)\s*:\s*\[/);
  if (!productsMatch || productsMatch.index === undefined) {
    return [];
  }

  const arrayStart = text.indexOf('[', productsMatch.index);
  if (arrayStart < 0) {
    return [];
  }

  const arrayEnd = findMatchingBracket(text, arrayStart, '[', ']');
  if (arrayEnd < 0) {
    return [];
  }

  const blocks: ProductBlock[] = [];
  for (let index = arrayStart + 1; index < arrayEnd; index++) {
    if (text[index] !== '{') {
      continue;
    }

    const objectEnd = findMatchingBracket(text, index, '{', '}');
    if (objectEnd < 0 || objectEnd > arrayEnd) {
      break;
    }

    blocks.push({
      start: index,
      end: objectEnd,
      text: text.slice(index, objectEnd + 1),
    });
    index = objectEnd;
  }

  return blocks;
}

function formatFieldValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : `"${value}"`;
}

function detectIndent(text: string): string {
  const match = text.match(/\n([ \t]+)(?:"app"|app)\s*:/);
  return match?.[1] ?? '  ';
}

function detectLineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function detectObjectFieldIndent(fullText: string, block: ProductBlock): string {
  const fieldIndent = block.text.match(/\n([ \t]+)(?:["']?[\w$-]+["']?)\s*:/);
  if (fieldIndent?.[1]) {
    return fieldIndent[1];
  }

  const lineStart = fullText.lastIndexOf('\n', block.start) + 1;
  const objectIndent = fullText.slice(lineStart, block.start).match(/^[ \t]*/)?.[0] ?? '';
  return `${objectIndent}  `;
}

function insertIntoProductBlock(
  text: string,
  block: ProductBlock,
  key: string,
  value: string | number,
): string {
  const lineEnding = detectLineEnding(text);
  const fieldIndent = detectObjectFieldIndent(text, block);
  const insertText = `${lineEnding}${fieldIndent}${key}: ${formatFieldValue(value)},`;
  return `${text.slice(0, block.start + 1)}${insertText}${text.slice(block.start + 1)}`;
}

function insertIntoAppObject(text: string, block: string): string {
  const appMatch = text.match(/(?:["']app["']|app)\s*:\s*\{/);
  if (!appMatch || appMatch.index === undefined) {
    return text;
  }

  const appBraceIndex = text.indexOf('{', appMatch.index);
  if (appBraceIndex < 0) {
    return text;
  }

  const indent = detectIndent(text);
  const lineEnding = detectLineEnding(text);
  const blockIndent = `${indent.repeat(2)}`;
  const blockText = `${lineEnding}${blockIndent}${block.trim().replace(/\n/g, lineEnding + blockIndent)}`;
  return `${text.slice(0, appBraceIndex + 1)}${blockText}${text.slice(appBraceIndex + 1)}`;
}

export function analyzeBuildProfileMigration(text: string): BuildProfileMigrationAnalysis {
  const issues: BuildProfileMigrationIssue[] = [];
  const productBlocks = extractProductBlocks(text);
  const globalSuggestedTargetSdkVersion = pickSuggestedTargetSdkVersion(text);
  const inferableMissingTargets = productBlocks.filter((product) => {
    const hasTargetSdkVersion = readFieldValue(product.text, 'targetSdkVersion') !== undefined;
    const localSuggested = pickSuggestedTargetSdkVersion(product.text) ?? globalSuggestedTargetSdkVersion;
    return !hasTargetSdkVersion && localSuggested !== undefined;
  });
  const hasBuildModeSet = /(?:["']buildModeSet["']|buildModeSet)\s*:\s*\[/m.test(text);
  const suggestedTargetSdkVersion = inferableMissingTargets[0]
    ? (pickSuggestedTargetSdkVersion(inferableMissingTargets[0].text) ?? globalSuggestedTargetSdkVersion)
    : globalSuggestedTargetSdkVersion;
  const usesModernHarmonyShape = typeof globalSuggestedTargetSdkVersion === 'string'
    || /(?:["']runtimeOS["']|runtimeOS)\s*:\s*["']HarmonyOS["']/.test(text);

  if (inferableMissingTargets.length > 0 && usesModernHarmonyShape) {
    issues.push({
      code: 'targetSdkVersionMissing',
      message: '建议显式配置 targetSdkVersion，避免新版工具链持续给出迁移告警。',
    });
  }

  if (!hasBuildModeSet && usesModernHarmonyShape) {
    issues.push({
      code: 'buildModeSetMissing',
      message: '新版 HarmonyOS 工程通常显式声明 buildModeSet（debug/release）。',
    });
  }

  return { issues, suggestedTargetSdkVersion };
}

export function applyBuildProfileMigration(text: string): BuildProfileMigrationResult {
  const analysis = analyzeBuildProfileMigration(text);
  const changes: BuildProfileMigrationIssue['code'][] = [];
  let nextText = text;

  if (analysis.issues.some((issue) => issue.code === 'targetSdkVersionMissing') && analysis.suggestedTargetSdkVersion !== undefined) {
    const globalSuggestedTargetSdkVersion = pickSuggestedTargetSdkVersion(nextText) ?? analysis.suggestedTargetSdkVersion;
    const productBlocks = extractProductBlocks(nextText);
    let targetUpdated = false;

    for (let index = productBlocks.length - 1; index >= 0; index--) {
      const block = productBlocks[index];
      if (readFieldValue(block.text, 'targetSdkVersion') !== undefined) {
        continue;
      }

      const suggestedTargetSdkVersion = pickSuggestedTargetSdkVersion(block.text) ?? globalSuggestedTargetSdkVersion;
      if (suggestedTargetSdkVersion === undefined) {
        continue;
      }

      nextText = insertIntoProductBlock(nextText, block, 'targetSdkVersion', suggestedTargetSdkVersion);
      targetUpdated = true;
    }

    if (targetUpdated) {
      changes.push('targetSdkVersionMissing');
    }
  }

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
