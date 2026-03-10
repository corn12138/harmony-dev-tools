import * as vscode from 'vscode';
import { DEPRECATED_APIS } from '../utils/constants';

export interface CompatIssue {
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
}

const V2_DECORATORS = ['@ComponentV2', '@Local', '@Param', '@Once', '@Event', '@Monitor', '@Computed', '@Provider', '@Consumer', '@ObservedV2', '@Trace'];

const API_LEVEL_FEATURES: Record<number, { decorators: string[]; components: string[]; apis: string[] }> = {
  12: {
    decorators: V2_DECORATORS,
    components: ['CalendarPicker', 'ContainerSpan', 'SymbolGlyph', 'SymbolSpan', 'NodeContainer', 'ContentSlot', 'ComponentContent'],
    apis: ['AppStorageV2', 'PersistenceV2'],
  },
  13: {
    decorators: ['@Require'],
    components: ['IsolatedComponent', 'NodeAdapter', 'EmbeddedComponent'],
    apis: ['UIContext.getHostContext', 'UIContext.getMediaQuery'],
  },
  14: {
    decorators: ['@Type'],
    components: ['MarqueeV2', 'EffectComponent'],
    apis: ['makeObserved', 'UIContext.getPromptAction', 'UIContext.getOverlayManager'],
  },
};

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

    // Check features against project API level
    if (apiVersion) {
      for (const [apiStr, features] of Object.entries(API_LEVEL_FEATURES)) {
        const requiredApi = parseInt(apiStr, 10);
        if (apiVersion < requiredApi) {
          for (const dec of features.decorators) {
            const lineIdx = lines.findIndex(l => l.includes(dec));
            if (lineIdx >= 0) {
              issues.push({
                message: `${dec} requires API ${requiredApi}+, but project targets API ${apiVersion}`,
                severity: 'error',
                file: relativePath,
                line: lineIdx + 1,
              });
            }
          }
          for (const comp of features.components) {
            const lineIdx = lines.findIndex(l => new RegExp(`\\b${comp}\\b`).test(l));
            if (lineIdx >= 0) {
              issues.push({
                message: `${comp} requires API ${requiredApi}+, but project targets API ${apiVersion}`,
                severity: 'warning',
                file: relativePath,
                line: lineIdx + 1,
              });
            }
          }
          for (const api of features.apis) {
            const lineIdx = lines.findIndex(l => l.includes(api));
            if (lineIdx >= 0) {
              issues.push({
                message: `${api} requires API ${requiredApi}+, but project targets API ${apiVersion}`,
                severity: 'warning',
                file: relativePath,
                line: lineIdx + 1,
              });
            }
          }
        }
      }
    }

    // Check V1+V2 mixing
    const hasV1 = ['@Component\n', '@Component ', '@State ', '@Prop '].some(p => text.includes(p));
    const hasV2 = V2_DECORATORS.some(d => text.includes(d));
    if (hasV1 && hasV2) {
      issues.push({
        message: 'V1 and V2 decorators are mixed in the same file. This is not recommended.',
        severity: 'warning',
        file: relativePath,
      });
    }

    // Check deprecated APIs
    for (const dep of DEPRECATED_APIS) {
      const lineIdx = lines.findIndex(l => l.includes(dep.name));
      if (lineIdx >= 0) {
        issues.push({
          message: `"${dep.name}" is deprecated since API ${dep.sinceApi}. Use "${dep.replacement}" instead.`,
          severity: apiVersion && apiVersion >= dep.sinceApi + 2 ? 'warning' : 'info',
          file: relativePath,
          line: lineIdx + 1,
        });
      }
    }
  }

  showResults(issues, apiVersion);
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
  channel.appendLine(`Latest available: API 14 (HarmonyOS 5.0.2)`);
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

  // Upgrade suggestions
  if (apiVersion && apiVersion < 14) {
    channel.appendLine(`--- UPGRADE SUGGESTIONS ---`);
    if (apiVersion < 13) {
      channel.appendLine(`  [TIP] Upgrade to API 13 (HarmonyOS 5.0.1) for: @Require decorator, IsolatedComponent, enhanced UIContext APIs`);
    }
    if (apiVersion < 14) {
      channel.appendLine(`  [TIP] Upgrade to API 14 (HarmonyOS 5.0.2) for: @Type decorator, makeObserved(), enhanced drag-and-drop, EffectComponent`);
    }
    channel.appendLine('');
  }

  channel.show();

  vscode.window.showWarningMessage(
    `Found ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s). See Output panel.`
  );
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
