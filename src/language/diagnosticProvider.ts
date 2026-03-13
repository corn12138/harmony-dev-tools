import * as vscode from 'vscode';
import { getDecorators, getComponents, apiLabel, type DecoratorMeta } from '../utils/metadata';

// ---------------------------------------------------------------------------
// Diagnostic codes — referenced by codeFixProvider for Quick Fix matching
// ---------------------------------------------------------------------------
export const DIAG_CODES = {
  ANY_TYPE: 'arkts-no-any',
  UNKNOWN_TYPE: 'arkts-no-unknown',
  AS_ANY: 'arkts-no-as-any',
  IMPLICIT_ANY: 'arkts-implicit-any',
  STATE_SHALLOW: 'arkts-state-shallow',
  V1_V2_MIX: 'arkts-v1v2-mix',
  LINK_IN_V2: 'arkts-link-in-v2',
  FOREACH_PERF: 'arkts-foreach-perf',
  BUILD_HEAVY: 'arkts-build-heavy',
  API_LEVEL: 'arkts-api-level',
} as const;

export type DiagCode = (typeof DIAG_CODES)[keyof typeof DIAG_CODES];

const SOURCE = 'HarmonyOS';

// ---------------------------------------------------------------------------
// V1 / V2 decorator sets
// ---------------------------------------------------------------------------
const V1_DECORATORS = new Set([
  '@Component', '@State', '@Prop', '@Link', '@Provide', '@Consume',
  '@Watch', '@Observed', '@ObjectLink',
]);
const V2_DECORATORS = new Set([
  '@ComponentV2', '@Local', '@Param', '@Once', '@Event', '@Monitor',
  '@Computed', '@Provider', '@Consumer', '@ObservedV2', '@Trace',
]);

// Complex type indicators after @State
const COMPLEX_TYPE_PATTERNS = [
  /:\s*(Array|Map|Set|Record)\s*</,
  /:\s*\w+\[\]/,
  /:\s*\{[^}]+\}/,
  /:\s*[A-Z]\w+\s*[;=]/,
];

// Heavy computation patterns inside build()
const HEAVY_BUILD_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bawait\b/, message: 'Avoid async/await inside build() — causes unnecessary re-renders' },
  { pattern: /\bfetch\s*\(/, message: 'Network requests in build() will fire on every re-render' },
  { pattern: /\bsetTimeout\s*\(/, message: 'setTimeout in build() creates repeated timers on re-render' },
  { pattern: /\bsetInterval\s*\(/, message: 'setInterval in build() creates leaked timers on re-render' },
  { pattern: /\bfor\s*\(.*;.*;.*\)\s*\{/, message: 'Imperative loops in build() may degrade performance; prefer declarative ForEach/LazyForEach' },
  { pattern: /\bwhile\s*\(/, message: 'while-loops in build() can block the UI thread' },
  { pattern: /\bconsole\.(log|warn|error|info)\s*\(/, message: 'console output in build() fires on every re-render; move to lifecycle methods' },
  { pattern: /\bJSON\.(parse|stringify)\s*\(/, message: 'JSON serialisation in build() is expensive; cache the result in a state variable' },
];

// ---------------------------------------------------------------------------
// Public API — called from extension.ts
// ---------------------------------------------------------------------------

export function createDiagnosticProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('arkts-lint');

  let cachedApiLevel: number | undefined;

  const detectProjectApi = async () => {
    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) return;
    try {
      const bp = vscode.Uri.joinPath(rootUri, 'build-profile.json5');
      const raw = Buffer.from(await vscode.workspace.fs.readFile(bp)).toString('utf8');
      const m = raw.match(/["']?compileSdkVersion["']?\s*[:=]\s*(\d+)/);
      if (m) { cachedApiLevel = parseInt(m[1], 10); return; }
      const m2 = raw.match(/["']?compatibleSdkVersion["']?\s*[:=]\s*(\d+)/);
      if (m2) { cachedApiLevel = parseInt(m2[1], 10); }
    } catch { /* no build-profile */ }
  };

  detectProjectApi();

  const runDiag = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'arkts' && !doc.fileName.endsWith('.ets')) return;
    const diagnostics = analyzeDocument(doc, cachedApiLevel);
    collection.set(doc.uri, diagnostics);
  };

  const onOpen = vscode.workspace.onDidOpenTextDocument(runDiag);
  const onSave = vscode.workspace.onDidSaveTextDocument(runDiag);
  const onChange = vscode.workspace.onDidChangeTextDocument((e) => runDiag(e.document));

  const onConfigChange = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.fileName.endsWith('build-profile.json5')) {
      detectProjectApi();
    }
  });

  if (vscode.window.activeTextEditor) {
    runDiag(vscode.window.activeTextEditor.document);
  }

  const disposable = vscode.Disposable.from(collection, onOpen, onSave, onChange, onConfigChange);
  context.subscriptions.push(disposable);
  return disposable;
}

// ---------------------------------------------------------------------------
// Core analysis — pure logic, testable without VS Code runtime
// ---------------------------------------------------------------------------

export interface RawDiagnostic {
  line: number;
  colStart: number;
  colEnd: number;
  message: string;
  severity: vscode.DiagnosticSeverity;
  code: DiagCode;
}

export function analyzeText(text: string, projectApiLevel?: number): RawDiagnostic[] {
  const lines = text.split('\n');
  const diags: RawDiagnostic[] = [];

  diags.push(...checkStrictTypes(lines));
  diags.push(...checkStateManagement(lines, text));
  diags.push(...checkPerformanceAntiPatterns(lines, text));
  if (projectApiLevel) {
    diags.push(...checkApiLevelUsage(lines, projectApiLevel));
  }

  return diags;
}

function analyzeDocument(doc: vscode.TextDocument, projectApiLevel?: number): vscode.Diagnostic[] {
  const raw = analyzeText(doc.getText(), projectApiLevel);
  return raw.map((r) => {
    const range = new vscode.Range(r.line, r.colStart, r.line, r.colEnd);
    const d = new vscode.Diagnostic(range, r.message, r.severity);
    d.code = r.code;
    d.source = SOURCE;
    return d;
  });
}

// ---------------------------------------------------------------------------
// Rule 1: ArkTS strict-type rules
// ---------------------------------------------------------------------------

function checkStrictTypes(lines: string[]): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip single-line comments and strings
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // `: any` or `: unknown` type annotation
    const anyAnnotation = line.match(/:\s*(any|unknown)\b/);
    if (anyAnnotation && anyAnnotation.index !== undefined) {
      const col = anyAnnotation.index + anyAnnotation[0].indexOf(anyAnnotation[1]);
      diags.push({
        line: i,
        colStart: col,
        colEnd: col + anyAnnotation[1].length,
        message: `ArkTS 禁止使用 \`${anyAnnotation[1]}\` 类型。请使用具体类型替代。`,
        severity: vscode.DiagnosticSeverity.Error,
        code: anyAnnotation[1] === 'any' ? DIAG_CODES.ANY_TYPE : DIAG_CODES.UNKNOWN_TYPE,
      });
    }

    // `as any` cast
    const asAny = line.match(/\bas\s+any\b/);
    if (asAny && asAny.index !== undefined) {
      diags.push({
        line: i,
        colStart: asAny.index,
        colEnd: asAny.index + asAny[0].length,
        message: '`as any` 强制转换绕过了类型检查，在 ArkTS 严格模式下禁用。',
        severity: vscode.DiagnosticSeverity.Error,
        code: DIAG_CODES.AS_ANY,
      });
    }

    // Implicit any — function parameter without type annotation
    const funcParams = line.match(/(?:function\s+\w+|(?:async\s+)?(?:\w+|\([^)]*\))\s*=>|\w+\s*\()\s*\(([^)]+)\)/);
    if (funcParams) {
      const params = funcParams[1].split(',');
      for (const param of params) {
        const trimmedParam = param.trim();
        if (trimmedParam && !trimmedParam.includes(':') && !trimmedParam.startsWith('...') && !trimmedParam.startsWith('{') && !trimmedParam.startsWith('[')) {
          const paramIdx = line.indexOf(trimmedParam);
          if (paramIdx >= 0) {
            diags.push({
              line: i,
              colStart: paramIdx,
              colEnd: paramIdx + trimmedParam.length,
              message: `参数 \`${trimmedParam}\` 缺少类型标注，在 ArkTS 中不允许隐式 any。`,
              severity: vscode.DiagnosticSeverity.Warning,
              code: DIAG_CODES.IMPLICIT_ANY,
            });
          }
        }
      }
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Rule 2: State management traps
// ---------------------------------------------------------------------------

function checkStateManagement(lines: string[], text: string): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];

  const foundV1 = new Set<number>();
  const foundV2 = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // Collect V1/V2 decorator locations (use regex to avoid substring false positives)
    for (const dec of V1_DECORATORS) {
      const escaped = dec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped + '(?!V2|ed|\\w)');
      if (re.test(line)) foundV1.add(i);
    }
    for (const dec of V2_DECORATORS) {
      if (line.includes(dec)) foundV2.add(i);
    }

    // @State with complex object type
    const stateMatch = line.match(/@State\s+(\w+)/);
    if (stateMatch) {
      const nextContent = line.substring(line.indexOf(stateMatch[0]));
      const isComplex = COMPLEX_TYPE_PATTERNS.some((p) => p.test(nextContent));
      if (isComplex) {
        const col = line.indexOf('@State');
        diags.push({
          line: i,
          colStart: col,
          colEnd: col + '@State'.length,
          message: '@State 仅浅观察第一层属性，嵌套属性变更不会触发 UI 刷新。建议改用 @ObservedV2 + @Trace 实现深度观察。',
          severity: vscode.DiagnosticSeverity.Warning,
          code: DIAG_CODES.STATE_SHALLOW,
        });
      }
    }

    // @Link inside @ComponentV2 context
    if (line.includes('@Link')) {
      const preceding = lines.slice(Math.max(0, i - 20), i).join('\n');
      if (preceding.includes('@ComponentV2')) {
        const col = line.indexOf('@Link');
        diags.push({
          line: i,
          colStart: col,
          colEnd: col + '@Link'.length,
          message: '@Link 在 V2 状态管理中不可用。请使用 @Param + @Event 替代双向绑定。',
          severity: vscode.DiagnosticSeverity.Error,
          code: DIAG_CODES.LINK_IN_V2,
        });
      }
    }
  }

  // V1/V2 mixing — if both sets have entries
  if (foundV1.size > 0 && foundV2.size > 0) {
    const firstV1 = Math.min(...foundV1);
    const firstV2 = Math.min(...foundV2);
    const reportLine = Math.min(firstV1, firstV2);
    diags.push({
      line: reportLine,
      colStart: 0,
      colEnd: lines[reportLine].length,
      message: '同一文件中混用了 V1 和 V2 装饰器，会导致运行时异常。请统一使用 V1 或 V2。',
      severity: vscode.DiagnosticSeverity.Error,
      code: DIAG_CODES.V1_V2_MIX,
    });
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Rule 3: Performance anti-patterns
// ---------------------------------------------------------------------------

function checkPerformanceAntiPatterns(lines: string[], text: string): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];

  // ForEach with large data — suggest LazyForEach
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    const forEachMatch = line.match(/\bForEach\s*\(/);
    if (forEachMatch && forEachMatch.index !== undefined) {
      diags.push({
        line: i,
        colStart: forEachMatch.index,
        colEnd: forEachMatch.index + 'ForEach'.length,
        message: 'ForEach 会一次性渲染所有子项。当列表数据较多时，请使用 LazyForEach 实现按需渲染以提升性能。',
        severity: vscode.DiagnosticSeverity.Information,
        code: DIAG_CODES.FOREACH_PERF,
      });
    }
  }

  // Heavy computation inside build()
  const buildBlocks = extractBuildBlocks(text);
  for (const block of buildBlocks) {
    for (const { pattern, message } of HEAVY_BUILD_PATTERNS) {
      const match = block.content.match(pattern);
      if (match && match.index !== undefined) {
        const beforeMatch = block.content.substring(0, match.index);
        const lineOffset = beforeMatch.split('\n').length - 1;
        const absoluteLine = block.startLine + lineOffset;
        const lastNewlineIdx = beforeMatch.lastIndexOf('\n');
        const col = lastNewlineIdx === -1 ? match.index : match.index - lastNewlineIdx - 1;
        diags.push({
          line: absoluteLine,
          colStart: col,
          colEnd: col + match[0].length,
          message: `build() 中检测到反模式：${message}`,
          severity: vscode.DiagnosticSeverity.Warning,
          code: DIAG_CODES.BUILD_HEAVY,
        });
      }
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Rule 4: API level usage — warn when using features above project target
// ---------------------------------------------------------------------------

function checkApiLevelUsage(lines: string[], apiLevel: number): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];

  for (const dec of getDecorators()) {
    if (dec.minApi <= apiLevel) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const idx = line.indexOf(dec.name);
      if (idx >= 0) {
        const migration = dec.migration ? ` 建议: ${dec.migration.hint}` : '';
        diags.push({
          line: i,
          colStart: idx,
          colEnd: idx + dec.name.length,
          message: `${dec.name} 需要 ${apiLabel(dec.minApi)}，当前项目目标为 API ${apiLevel}。${migration}`,
          severity: vscode.DiagnosticSeverity.Error,
          code: DIAG_CODES.API_LEVEL,
        });
      }
    }
  }

  for (const comp of getComponents()) {
    if (comp.minApi <= apiLevel) continue;
    const re = new RegExp(`\\b${comp.name}\\s*\\(`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const match = line.match(re);
      if (match && match.index !== undefined) {
        diags.push({
          line: i,
          colStart: match.index,
          colEnd: match.index + comp.name.length,
          message: `${comp.name} 需要 ${apiLabel(comp.minApi)}，当前项目目标为 API ${apiLevel}。`,
          severity: vscode.DiagnosticSeverity.Warning,
          code: DIAG_CODES.API_LEVEL,
        });
      }
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BuildBlock {
  startLine: number;
  content: string;
}

export function extractBuildBlocks(text: string): BuildBlock[] {
  const blocks: BuildBlock[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (/\bbuild\s*\(\s*\)\s*\{/.test(lines[i])) {
      let depth = 0;
      let started = false;
      const blockLines: string[] = [];
      const startLine = i;

      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { depth++; started = true; }
          if (ch === '}') depth--;
        }
        blockLines.push(lines[j]);
        if (started && depth === 0) break;
      }

      blocks.push({ startLine, content: blockLines.join('\n') });
    }
  }

  return blocks;
}
