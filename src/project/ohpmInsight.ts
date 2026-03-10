import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// OHPM Dependency Insight
//
// Addresses pain points:
//   - OHPM dependency management is confusing for newcomers
//   - No visual feedback on outdated or problematic dependencies
//   - oh-package.json5 lacks inline documentation
//
// Features:
//   1. DiagnosticCollection for dependency issues (shown in Problems panel)
//   2. CodeLens on dependencies showing version hints
//   3. Command to run full dependency audit
// ---------------------------------------------------------------------------

const KNOWN_PACKAGES: Record<string, { latest: string; description: string }> = {
  '@ohos/hypium': { latest: '1.0.18', description: '鸿蒙官方单元测试框架 / HarmonyOS unit test framework' },
  '@ohos/hamock': { latest: '1.0.0', description: '鸿蒙 Mock 测试工具 / HarmonyOS mock utility' },
  '@ohos/axios': { latest: '2.2.6', description: 'HTTP 客户端（基于 axios 适配鸿蒙）/ HTTP client for HarmonyOS' },
  '@ohos/crypto-js': { latest: '2.0.4', description: '加密工具库 / Crypto utility library' },
  '@ohos/lottie': { latest: '2.0.14', description: 'Lottie 动画库 / Lottie animation library' },
  '@ohos/pulltorefresh': { latest: '2.0.5', description: '下拉刷新组件 / Pull-to-refresh component' },
  '@ohos/smartdialog': { latest: '0.3.1', description: '智能弹窗库 / Smart dialog library' },
  '@ohos/routermodule': { latest: '1.0.5', description: '路由管理模块 / Router management module' },
  '@ohos/imageknife': { latest: '3.0.1', description: '高性能图片加载库 / High-performance image loading' },
  '@ohos/dataorm': { latest: '2.1.0', description: 'ORM 数据库框架 / ORM database framework' },
};

// Version comparison: returns -1, 0, or 1
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^[^0-9]*/, '').split('.').map(Number);
  const pb = b.replace(/^[^0-9]*/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// Parse a version range like "^1.0.0" or "~2.1.0" or "1.0.0" to base version
function parseBaseVersion(range: string): string {
  return range.replace(/^[\^~>=<\s]+/, '');
}

// ---------------------------------------------------------------------------
// Dependency analysis (pure logic, testable)
// ---------------------------------------------------------------------------

export interface DepIssue {
  packageName: string;
  currentVersion: string;
  latestVersion?: string;
  severity: 'outdated' | 'info';
  message: string;
  line: number;
}

export function analyzeDependencies(
  text: string,
  knownPackages: Record<string, { latest: string; description: string }> = KNOWN_PACKAGES,
): DepIssue[] {
  const issues: DepIssue[] = [];
  const lines = text.split('\n');

  const depSections = ['dependencies', 'devDependencies', 'dynamicDependencies'];
  let inDepSection = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect entering a dependency section
    if (depSections.some((s) => trimmed.startsWith(`"${s}"`) || trimmed.startsWith(`'${s}'`) || trimmed.startsWith(s))) {
      if (trimmed.includes('{')) {
        inDepSection = true;
        braceDepth = 1;
        continue;
      }
    }

    if (inDepSection) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        inDepSection = false;
        continue;
      }

      // Parse dependency line: "pkg": "^ver"
      const depMatch = trimmed.match(/["'](@?[\w/-]+)["']\s*:\s*["']([^"']+)["']/);
      if (depMatch) {
        const pkgName = depMatch[1];
        const versionRange = depMatch[2];
        const baseVersion = parseBaseVersion(versionRange);

        const known = knownPackages[pkgName];
        if (known) {
          const cmp = compareVersions(baseVersion, known.latest);
          if (cmp < 0) {
            issues.push({
              packageName: pkgName,
              currentVersion: versionRange,
              latestVersion: known.latest,
              severity: 'outdated',
              message: `${pkgName} ${versionRange} 可更新到 ${known.latest}`,
              line: i,
            });
          }
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// VS Code integration
// ---------------------------------------------------------------------------

export function createOhpmInsightProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('ohpm-insight');
  const disposables: vscode.Disposable[] = [collection];

  const analyze = async () => {
    const files = await vscode.workspace.findFiles('**/oh-package.json5', '**/node_modules/**', 10);
    for (const file of files) {
      const content = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(content).toString('utf8');
      const issues = analyzeDependencies(text);

      const diagnostics = issues.map((issue) => {
        const lineText = text.split('\n')[issue.line] || '';
        const startCol = lineText.indexOf(issue.packageName);
        const range = new vscode.Range(
          issue.line, Math.max(startCol, 0),
          issue.line, Math.max(startCol, 0) + issue.packageName.length,
        );
        const sev = issue.severity === 'outdated'
          ? vscode.DiagnosticSeverity.Information
          : vscode.DiagnosticSeverity.Hint;
        const d = new vscode.Diagnostic(range, issue.message, sev);
        d.source = 'OHPM Insight';
        d.code = 'ohpm-outdated';
        return d;
      });

      collection.set(file, diagnostics);
    }
  };

  // CodeLens on oh-package.json5 files
  const lensProvider = vscode.languages.registerCodeLensProvider(
    { pattern: '**/oh-package.json5' },
    {
      provideCodeLenses(document) {
        const text = document.getText();
        const lines = text.split('\n');
        const lenses: vscode.CodeLens[] = [];

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          const depMatch = trimmed.match(/["'](@?[\w/-]+)["']\s*:\s*["']([^"']+)["']/);
          if (depMatch) {
            const pkgName = depMatch[1];
            const known = KNOWN_PACKAGES[pkgName];
            if (known) {
              lenses.push(new vscode.CodeLens(
                new vscode.Range(i, 0, i, lines[i].length),
                { title: `$(info) ${known.description} | latest: ${known.latest}`, command: '' },
              ));
            }
          }
        }

        return lenses;
      },
    },
  );
  disposables.push(lensProvider);

  // Run on workspace open and on save
  analyze();
  const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.fileName.includes('oh-package')) analyze();
  });
  disposables.push(onSave);

  const disposable = vscode.Disposable.from(...disposables);
  context.subscriptions.push(disposable);
  return disposable;
}

// Exports for testing
export { compareVersions, KNOWN_PACKAGES, parseBaseVersion };

