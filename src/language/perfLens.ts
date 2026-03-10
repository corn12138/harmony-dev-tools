import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Performance insight CodeLens for ArkTS / ArkUI
//
// Shows inline hints on:
//   1. build() methods — component tree depth + child count
//   2. ForEach / LazyForEach — rendering strategy & tips
//   3. @State / @Local / @Trace — state variable count per struct
// ---------------------------------------------------------------------------

const COMPONENT_RE = /\b([A-Z]\w+)\s*\(/g;
const FOREACH_RE = /\b(ForEach|LazyForEach)\s*\(/;
const BUILD_RE = /\bbuild\s*\(\s*\)\s*\{/;
const STRUCT_RE = /\bstruct\s+(\w+)/;
const STATE_DECS = ['@State', '@Local', '@Trace', '@Prop', '@Link', '@Param'];

export function createPerfLensProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = vscode.languages.registerCodeLensProvider(
    { language: 'arkts', scheme: 'file' },
    new PerfCodeLensProvider(),
  );
  context.subscriptions.push(provider);
  return provider;
}

// ---------------------------------------------------------------------------
// Pure-logic helpers (exported for testing)
// ---------------------------------------------------------------------------

export interface BuildStats {
  componentCount: number;
  maxDepth: number;
  hasForEach: boolean;
  hasLazyForEach: boolean;
}

export function analyzeBuildBlock(text: string): BuildStats {
  let componentCount = 0;
  let maxDepth = 0;
  let depth = 0;
  let hasForEach = false;
  let hasLazyForEach = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    const components = trimmed.match(COMPONENT_RE);
    if (components) componentCount += components.length;

    for (const ch of trimmed) {
      if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth); }
      if (ch === '}') depth--;
    }

    if (/\bForEach\s*\(/.test(trimmed)) hasForEach = true;
    if (/\bLazyForEach\s*\(/.test(trimmed)) hasLazyForEach = true;
  }

  return { componentCount, maxDepth, hasForEach, hasLazyForEach };
}

export function countStateVariables(structBlock: string): number {
  let count = 0;
  for (const line of structBlock.split('\n')) {
    if (STATE_DECS.some((d) => line.includes(d))) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

class PerfCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const text = document.getText();
    const lines = text.split('\n');
    const lenses: vscode.CodeLens[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // build() method
      if (BUILD_RE.test(line)) {
        const block = this.extractBlock(lines, i);
        const stats = analyzeBuildBlock(block);
        const parts: string[] = [
          `$(symbol-class) ${stats.componentCount} components`,
          `depth ${stats.maxDepth}`,
        ];
        if (stats.hasForEach && !stats.hasLazyForEach) {
          parts.push('$(warning) ForEach — consider LazyForEach for large lists');
        } else if (stats.hasLazyForEach) {
          parts.push('$(check) LazyForEach');
        }

        lenses.push(new vscode.CodeLens(
          new vscode.Range(i, 0, i, line.length),
          { title: parts.join(' | '), command: '' },
        ));
      }

      // ForEach / LazyForEach
      const feMatch = line.match(FOREACH_RE);
      if (feMatch) {
        const isLazy = feMatch[1] === 'LazyForEach';
        const tip = isLazy
          ? '$(check) LazyForEach：按需渲染，适合长列表'
          : '$(warning) ForEach：全量渲染，列表项 > 20 时建议切换到 LazyForEach';
        lenses.push(new vscode.CodeLens(
          new vscode.Range(i, 0, i, line.length),
          { title: tip, command: '' },
        ));
      }

      // struct — state variable count
      const structMatch = line.match(STRUCT_RE);
      if (structMatch) {
        const block = this.extractBlock(lines, i);
        const stateCount = countStateVariables(block);
        if (stateCount > 0) {
          const warning = stateCount > 10 ? ' $(warning) 状态变量过多，考虑拆分组件' : '';
          lenses.push(new vscode.CodeLens(
            new vscode.Range(i, 0, i, line.length),
            { title: `$(symbol-variable) ${stateCount} state vars${warning}`, command: '' },
          ));
        }
      }
    }

    return lenses;
  }

  private extractBlock(lines: string[], startIdx: number): string {
    let depth = 0;
    let started = false;
    const blockLines: string[] = [];

    for (let j = startIdx; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
      }
      blockLines.push(lines[j]);
      if (started && depth === 0) break;
    }

    return blockLines.join('\n');
  }
}
