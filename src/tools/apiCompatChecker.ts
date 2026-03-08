import * as vscode from 'vscode';

/**
 * API Compatibility Checker
 * Detects the project's target API version and checks for compatibility issues.
 */

interface CompatIssue {
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
}

// V2 decorators require API 12+
const V2_DECORATORS = ['@ComponentV2', '@Local', '@Param', '@Once', '@Event', '@Monitor', '@Computed', '@Provider', '@Consumer', '@ObservedV2', '@Trace'];

// API 12+ new components
const API12_COMPONENTS = ['CalendarPicker', 'ContainerSpan', 'SymbolGlyph', 'SymbolSpan', 'NodeContainer', 'ContentSlot', 'ComponentContent'];

export async function checkApiCompatibility(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }

  const rootPath = folder.uri.fsPath;
  const issues: CompatIssue[] = [];

  // Step 1: Detect API version from build-profile.json5
  const apiVersion = await detectApiVersion(folder.uri);

  // Step 2: Check hvigor-config.json5
  const hvigorIssues = await checkHvigorConfig(folder.uri, apiVersion);
  issues.push(...hvigorIssues);

  // Step 3: Scan .ets files for compatibility issues
  const etsFiles = await vscode.workspace.findFiles('**/*.ets', '**/node_modules/**', 50);
  for (const file of etsFiles) {
    const content = await vscode.workspace.fs.readFile(file);
    const text = Buffer.from(content).toString('utf8');
    const relativePath = vscode.workspace.asRelativePath(file);

    // Check V2 decorator usage with old API
    if (apiVersion && apiVersion < 12) {
      for (const dec of V2_DECORATORS) {
        if (text.includes(dec)) {
          issues.push({
            message: `${dec} requires API 12+, but project targets API ${apiVersion}`,
            severity: 'error',
            file: relativePath,
          });
        }
      }
      for (const comp of API12_COMPONENTS) {
        if (text.includes(comp)) {
          issues.push({
            message: `${comp} requires API 12+, but project targets API ${apiVersion}`,
            severity: 'warning',
            file: relativePath,
          });
        }
      }
    }

    // Check V1+V2 mixing
    const hasV1 = ['@Component\n', '@State ', '@Prop '].some(p => text.includes(p));
    const hasV2 = V2_DECORATORS.some(d => text.includes(d));
    if (hasV1 && hasV2) {
      issues.push({
        message: 'V1 and V2 decorators are mixed in the same file. This is not recommended.',
        severity: 'warning',
        file: relativePath,
      });
    }
  }

  // Step 4: Show results
  if (issues.length === 0) {
    const apiStr = apiVersion ? `API ${apiVersion}` : 'unknown API version';
    vscode.window.showInformationMessage(`No compatibility issues found. Project targets ${apiStr}.`);
    return;
  }

  // Show in Output channel
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
      channel.appendLine(`  [ERROR] ${issue.file ? `${issue.file}: ` : ''}${issue.message}`);
    }
    channel.appendLine('');
  }

  if (warnings.length) {
    channel.appendLine(`--- WARNINGS (${warnings.length}) ---`);
    for (const issue of warnings) {
      channel.appendLine(`  [WARN] ${issue.file ? `${issue.file}: ` : ''}${issue.message}`);
    }
    channel.appendLine('');
  }

  if (infos.length) {
    channel.appendLine(`--- INFO (${infos.length}) ---`);
    for (const issue of infos) {
      channel.appendLine(`  [INFO] ${issue.file ? `${issue.file}: ` : ''}${issue.message}`);
    }
  }

  channel.show();

  vscode.window.showWarningMessage(
    `Found ${errors.length} errors, ${warnings.length} warnings. See Output panel for details.`
  );
}

async function detectApiVersion(rootUri: vscode.Uri): Promise<number | null> {
  try {
    const buildProfile = vscode.Uri.joinPath(rootUri, 'build-profile.json5');
    const content = await vscode.workspace.fs.readFile(buildProfile);
    const text = Buffer.from(content).toString('utf8');

    // Match "compileSdkVersion": 12 or compileSdkVersion: 12
    const match = text.match(/["']?compileSdkVersion["']?\s*[:=]\s*(\d+)/);
    if (match) return parseInt(match[1], 10);

    // Also try compatibleSdkVersion
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

    // API 12+ requires modelVersion
    if (apiVersion && apiVersion >= 12) {
      if (!text.includes('modelVersion')) {
        issues.push({
          message: 'hvigor-config.json5 is missing "modelVersion" field (required for API 12+). Add: "modelVersion": "5.0.0"',
          severity: 'warning',
          file: 'hvigor/hvigor-config.json5',
        });
      }

      // Deprecated fields in API 12+
      if (text.includes('hvigorVersion')) {
        issues.push({
          message: '"hvigorVersion" in hvigor-config.json5 is deprecated for API 12+. Remove it and use "modelVersion" instead.',
          severity: 'info',
          file: 'hvigor/hvigor-config.json5',
        });
      }
    }
  } catch {
    // hvigor-config.json5 doesn't exist, that's OK for some project types
  }

  return issues;
}
