import * as vscode from 'vscode';
import { DEPRECATED_APIS } from '../utils/constants';
import { getDecorators, getComponents, type DecoratorMeta, type ComponentMeta } from '../utils/metadata';

export interface CompatIssue {
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
}

export async function checkApiCompatibility(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }

  const issues: CompatIssue[] = [];
  const apiVersion = await detectApiVersion(folder.uri);

  const hvigorIssues = await checkHvigorConfig(folder.uri, apiVersion);
  issues.push(...hvigorIssues);

  const etsFiles = await vscode.workspace.findFiles('**/*.ets', '**/node_modules/**', 100);
  for (const file of etsFiles) {
    const content = await vscode.workspace.fs.readFile(file);
    const text = Buffer.from(content).toString('utf8');
    const relativePath = vscode.workspace.asRelativePath(file);
    const lines = text.split('\n');

    if (apiVersion) {
      checkDecoratorsCompat(lines, relativePath, apiVersion, issues);
      checkComponentsCompat(lines, relativePath, apiVersion, issues);
    }

    checkV1V2Mixing(text, relativePath, issues);
    checkDeprecated(lines, relativePath, apiVersion, issues);
  }

  showResults(issues, apiVersion);
}

function checkDecoratorsCompat(
  lines: string[],
  filePath: string,
  apiVersion: number,
  issues: CompatIssue[],
): void {
  for (const dec of getDecorators()) {
    if (dec.minApi <= apiVersion) continue;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(dec.name)) {
        const migration = dec.migration
          ? ` 迁移建议: 使用 ${dec.migration.to} 替代。`
          : '';
        issues.push({
          message: `${dec.name} 需要 API ${dec.minApi}+，当前项目目标为 API ${apiVersion}。${migration}`,
          severity: 'error',
          file: filePath,
          line: i + 1,
        });
        break;
      }
    }
  }
}

function checkComponentsCompat(
  lines: string[],
  filePath: string,
  apiVersion: number,
  issues: CompatIssue[],
): void {
  for (const comp of getComponents()) {
    if (comp.minApi <= apiVersion) continue;
    const re = new RegExp(`\\b${comp.name}\\b`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        issues.push({
          message: `${comp.name} 需要 API ${comp.minApi}+，当前项目目标为 API ${apiVersion}。`,
          severity: 'warning',
          file: filePath,
          line: i + 1,
        });
        break;
      }
    }
  }
}

function checkV1V2Mixing(text: string, filePath: string, issues: CompatIssue[]): void {
  const v1Decorators = getDecorators().filter(d => d.stateModel === 'v1');
  const v2Decorators = getDecorators().filter(d => d.stateModel === 'v2');
  const hasV1 = v1Decorators.some(d => text.includes(d.name));
  const hasV2 = v2Decorators.some(d => text.includes(d.name));
  if (hasV1 && hasV2) {
    issues.push({
      message: '同一文件中混用了 V1 和 V2 装饰器，建议统一迁移到 V2。运行 "HarmonyOS: Migrate V1 → V2 Decorators" 一键迁移。',
      severity: 'warning',
      file: filePath,
    });
  }
}

function checkDeprecated(
  lines: string[],
  filePath: string,
  apiVersion: number | null,
  issues: CompatIssue[],
): void {
  for (const dep of DEPRECATED_APIS) {
    const lineIdx = lines.findIndex(l => l.includes(dep.name));
    if (lineIdx >= 0) {
      issues.push({
        message: `"${dep.name}" 自 API ${dep.sinceApi} 起已废弃，请使用 "${dep.replacement}" 替代。`,
        severity: apiVersion && apiVersion >= dep.sinceApi + 2 ? 'warning' : 'info',
        file: filePath,
        line: lineIdx + 1,
      });
    }
  }
}

function showResults(issues: CompatIssue[], apiVersion: number | null): void {
  if (issues.length === 0) {
    const apiStr = apiVersion ? `API ${apiVersion}` : 'unknown API version';
    vscode.window.showInformationMessage(`No compatibility issues found. Project targets ${apiStr}.`);
    return;
  }

  const channel = vscode.window.createOutputChannel('HarmonyOS Compatibility');
  channel.clear();
  channel.appendLine(`=== HarmonyOS API Compatibility Check ===`);
  channel.appendLine(`Target API: ${apiVersion ?? 'unknown'}`);
  channel.appendLine(`Issues found: ${issues.length}`);
  channel.appendLine('');

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  if (errors.length) {
    channel.appendLine(`--- ERRORS (${errors.length}) ---`);
    for (const issue of errors) {
      const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}: ` : '';
      channel.appendLine(`  [ERROR] ${loc}${issue.message}`);
    }
    channel.appendLine('');
  }

  if (warnings.length) {
    channel.appendLine(`--- WARNINGS (${warnings.length}) ---`);
    for (const issue of warnings) {
      const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}: ` : '';
      channel.appendLine(`  [WARN] ${loc}${issue.message}`);
    }
    channel.appendLine('');
  }

  if (infos.length) {
    channel.appendLine(`--- INFO (${infos.length}) ---`);
    for (const issue of infos) {
      const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}: ` : '';
      channel.appendLine(`  [INFO] ${loc}${issue.message}`);
    }
    channel.appendLine('');
  }

  if (apiVersion) {
    const nextApis = buildUpgradeSuggestions(apiVersion);
    if (nextApis.length) {
      channel.appendLine(`--- UPGRADE SUGGESTIONS ---`);
      for (const tip of nextApis) {
        channel.appendLine(`  [TIP] ${tip}`);
      }
      channel.appendLine('');
    }
  }

  channel.show();

  vscode.window.showWarningMessage(
    `Found ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s). See Output panel.`
  );
}

function buildUpgradeSuggestions(apiVersion: number): string[] {
  const tips: string[] = [];
  const decorators = getDecorators();
  const components = getComponents();

  const nextLevels = [...new Set([
    ...decorators.map(d => d.minApi),
    ...components.map(c => c.minApi),
  ])].filter(v => v > apiVersion).sort((a, b) => a - b);

  for (const level of nextLevels) {
    const newDecs = decorators.filter(d => d.minApi === level).map(d => d.name);
    const newComps = components.filter(c => c.minApi === level).map(c => c.name);
    const parts: string[] = [];
    if (newDecs.length) parts.push(`装饰器: ${newDecs.join(', ')}`);
    if (newComps.length) parts.push(`组件: ${newComps.slice(0, 5).join(', ')}${newComps.length > 5 ? ` +${newComps.length - 5}` : ''}`);
    if (parts.length) {
      tips.push(`升级到 API ${level} 可获得: ${parts.join(' | ')}`);
    }
  }

  return tips;
}

export async function detectApiVersion(rootUri: vscode.Uri): Promise<number | null> {
  try {
    const buildProfile = vscode.Uri.joinPath(rootUri, 'build-profile.json5');
    const content = await vscode.workspace.fs.readFile(buildProfile);
    const text = Buffer.from(content).toString('utf8');

    const match = text.match(/["']?compileSdkVersion["']?\s*[:=]\s*(\d+)/);
    if (match) return parseInt(match[1], 10);

    const compatMatch = text.match(/["']?compatibleSdkVersion["']?\s*[:=]\s*(\d+)/);
    if (compatMatch) return parseInt(compatMatch[1], 10);

    return null;
  } catch {
    return null;
  }
}

async function checkHvigorConfig(rootUri: vscode.Uri, apiVersion: number | null): Promise<CompatIssue[]> {
  const issues: CompatIssue[] = [];

  try {
    const configUri = vscode.Uri.joinPath(rootUri, 'hvigor', 'hvigor-config.json5');
    const content = await vscode.workspace.fs.readFile(configUri);
    const text = Buffer.from(content).toString('utf8');

    if (apiVersion && apiVersion >= 12) {
      if (!text.includes('modelVersion')) {
        issues.push({
          message: 'hvigor-config.json5 is missing "modelVersion" field (required for API 12+). Add: "modelVersion": "5.0.0"',
          severity: 'warning',
          file: 'hvigor/hvigor-config.json5',
        });
      } else if (apiVersion >= 14) {
        const versionMatch = text.match(/["']?modelVersion["']?\s*[:=]\s*["'](\d+\.\d+\.\d+)["']/);
        if (versionMatch && versionMatch[1] < '5.0.2') {
          issues.push({
            message: `modelVersion "${versionMatch[1]}" may be outdated for API ${apiVersion}. Consider updating to "5.0.2".`,
            severity: 'info',
            file: 'hvigor/hvigor-config.json5',
          });
        }
      }

      if (text.includes('hvigorVersion')) {
        issues.push({
          message: '"hvigorVersion" in hvigor-config.json5 is deprecated for API 12+. Remove it and use "modelVersion" instead.',
          severity: 'info',
          file: 'hvigor/hvigor-config.json5',
        });
      }

      if (text.includes('@ohos/hvigor-ohos-plugin')) {
        issues.push({
          message: '"@ohos/hvigor-ohos-plugin" in dependencies is deprecated for API 12+. Remove it when using modelVersion.',
          severity: 'info',
          file: 'hvigor/hvigor-config.json5',
        });
      }
    }
  } catch {
    // hvigor-config.json5 doesn't exist, OK for some project types
  }

  return issues;
}
