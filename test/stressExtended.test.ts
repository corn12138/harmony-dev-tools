import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeText, DIAG_CODES } from '../src/language/diagnosticProvider';
import { provideCompletionItems } from '../src/language/completionProvider';
import { getDecorators, getComponents, getDecoratorByName, getComponentByName } from '../src/utils/metadata';

// =========================================================================
// Helpers
// =========================================================================

function mockDocument(lineText: string) {
  return {
    lineAt: (_line: number) => ({ text: lineText }),
    uri: { fsPath: '/test/Index.ets' },
    getText: () => lineText,
  } as any;
}

function mockPosition(line: number, character: number) {
  return { line, character } as any;
}

const dummyToken = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any;
const dummyContext = { triggerKind: 0, triggerCharacter: undefined } as any;

// =========================================================================
// PART 1: CodeFix Provider — comprehensive coverage
// =========================================================================

describe('stress: codeFixProvider coverage', () => {
  // We test indirectly through the diagnostic codes — ensuring each new
  // code has well-defined messages that a QuickFix can key on.
  
  it('DEPRECATED_ROUTER diagnostic severity should be Information', () => {
    const code = "import router from '@ohos.router';";
    const diags = analyzeText(code);
    const d = diags.find((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER);
    expect(d).toBeDefined();
    expect(d!.severity).toBe(2); // 2 = Information
  });

  it('SANDBOX_HARDCODED_PATH diagnostic severity should be Warning', () => {
    const code = 'const p = "/data/storage/el1/base/files/test.txt";';
    const diags = analyzeText(code);
    const d = diags.find((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH);
    expect(d).toBeDefined();
    expect(d!.severity).toBe(1); // 1 = Warning
  });

  it('DEPRECATED_ROUTER message should mention NavPathStack', () => {
    const code = "import router from '@ohos.router';";
    const diags = analyzeText(code);
    const d = diags.find((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER);
    expect(d!.message).toContain('NavPathStack');
  });

  it('SANDBOX_HARDCODED_PATH message should mention getContext', () => {
    const code = 'const p = "/data/storage/el1/base/files/test.txt";';
    const diags = analyzeText(code);
    const d = diags.find((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH);
    expect(d!.message).toContain('getContext');
  });

  it('DEPRECATED_ROUTER call diagnostic should contain the specific method name', () => {
    const methods = ['pushUrl', 'replaceUrl', 'back', 'clear', 'getLength', 'getParams', 'getState'];
    for (const method of methods) {
      const code = `router.${method}();`;
      const diags = analyzeText(code);
      const d = diags.find((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER);
      expect(d, `Expected diagnostic for router.${method}()`).toBeDefined();
      expect(d!.message).toContain(method);
    }
  });

  it('DEPRECATED_ROUTER should provide correct column range for import', () => {
    const code = "import router from '@ohos.router';";
    const diags = analyzeText(code);
    const d = diags.find((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER);
    expect(d!.line).toBe(0);
    expect(d!.colStart).toBe(0);
    expect(d!.colEnd).toBeGreaterThan(20);
  });

  it('SANDBOX_HARDCODED_PATH should provide correct column range', () => {
    const code = '    let f = "/data/storage/el1/base/files/x.db";';
    const diags = analyzeText(code);
    const d = diags.find((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH);
    expect(d!.line).toBe(0);
    expect(d!.colStart).toBeGreaterThanOrEqual(12);
  });
});

// =========================================================================
// PART 2: Completion Provider — new components/decorators
// =========================================================================

describe('stress: completionProvider new entries', () => {
  it('should provide @Track after @', () => {
    const items = provideCompletionItems(
      mockDocument('@'),
      mockPosition(0, 1),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('Track');
  });

  it('should provide Repeat component', () => {
    const items = provideCompletionItems(
      mockDocument('  Re'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('Repeat');
  });

  it('should provide RepeatItem component', () => {
    const items = provideCompletionItems(
      mockDocument('  Re'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('RepeatItem');
  });

  it('should provide FoldSplitContainer component (API 20)', () => {
    const items = provideCompletionItems(
      mockDocument('  Fo'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('FoldSplitContainer');
  });

  it('should provide MediaCachedImage component (API 20)', () => {
    const items = provideCompletionItems(
      mockDocument('  Me'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('MediaCachedImage');
  });

  it('should provide ExpandableTitle component (API 20)', () => {
    const items = provideCompletionItems(
      mockDocument('  Ex'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('ExpandableTitle');
  });

  it('should provide UIExtensionComponent (API 18)', () => {
    const items = provideCompletionItems(
      mockDocument('  UI'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('UIExtensionComponent');
  });

  it('should provide ScrollBar component', () => {
    const items = provideCompletionItems(
      mockDocument('  Sc'),
      mockPosition(0, 4),
      dummyToken,
      dummyContext,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('ScrollBar');
  });

  it('should include all known decorators after @', () => {
    const items = provideCompletionItems(
      mockDocument('@'),
      mockPosition(0, 1),
      dummyToken,
      dummyContext,
    );
    const labels = new Set(items.map(i => i.label));
    const decoratorNames = getDecorators().map(d => d.name.replace('@', ''));
    for (const name of decoratorNames) {
      expect(labels.has(name), `Missing decorator: @${name}`).toBe(true);
    }
  });

  it('should include all known components in general completion', () => {
    const items = provideCompletionItems(
      mockDocument('  '),
      mockPosition(0, 2),
      dummyToken,
      dummyContext,
    );
    const labels = new Set(items.map(i => i.label));
    const componentNames = getComponents().map(c => c.name);
    for (const name of componentNames) {
      expect(labels.has(name), `Missing component: ${name}`).toBe(true);
    }
  });
});

// =========================================================================
// PART 3: ArkTS TextMate Grammar — new component coverage
// =========================================================================

describe('stress: ArkTS TextMate grammar', () => {
  const grammarPath = join(__dirname, '..', 'syntaxes', 'arkts.tmLanguage.json');
  const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));

  it('grammar should have component-call patterns', () => {
    expect(grammar.repository['arkui-component-call']).toBeDefined();
  });

  it('grammar struct pattern should match PascalCase names', () => {
    const structPattern = grammar.repository['arkts-struct'];
    expect(structPattern.begin).toContain('struct');
    expect(structPattern.begin).toContain('[A-Z]');
  });

  it('grammar should have resource-reference pattern', () => {
    const resRef = grammar.repository['arkts-resource-reference'];
    expect(resRef).toBeDefined();
    expect(resRef.match).toContain('$r');
  });

  it('grammar should recognize V2 decorators', () => {
    const stateDecorators = grammar.repository['arkts-decorators'].patterns[1];
    expect(stateDecorators.match).toContain('ObservedV2');
    expect(stateDecorators.match).toContain('Trace');
  });

  it('grammar should recognize concurrency decorators', () => {
    const concPatterns = grammar.repository['arkts-decorators'].patterns[3];
    expect(concPatterns.match).toContain('Concurrent');
    expect(concPatterns.match).toContain('Sendable');
  });
});

// =========================================================================
// PART 4: Cross-cutting diagnostic stress scenarios
// =========================================================================

describe('stress: cross-cutting diagnostic combinations', () => {
  it('should fire DEPRECATED_ROUTER + SANDBOX_HARDCODED_PATH + ANY_TYPE in same file', () => {
    const code = [
      "import router from '@ohos.router';",
      'let data: any = null;',
      'const path = "/data/storage/el1/base/files/test.txt";',
    ].join('\n');
    const diags = analyzeText(code);
    expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toBe(true);
    expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    expect(diags.some((d) => d.code === DIAG_CODES.ANY_TYPE)).toBe(true);
  });

  it('should fire FOREACH_PERF + BUILD_HEAVY + V1_V2_MIX in same file', () => {
    const code = [
      '@Component',
      'struct A {',
      '  @State items: string[] = [];',
      '  build() {',
      '    Column() {',
      '      ForEach(this.items, (item: string) => {',
      '        Text(item)',
      '      })',
      '      console.log("debug")',
      '    }',
      '  }',
      '}',
      '@ComponentV2',
      'struct B {',
      '  @Local val: string = "";',
      '  build() { Column() {} }',
      '}',
    ].join('\n');
    const diags = analyzeText(code);
    expect(diags.some((d) => d.code === DIAG_CODES.FOREACH_PERF)).toBe(true);
    expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY)).toBe(true);
    expect(diags.some((d) => d.code === DIAG_CODES.V1_V2_MIX)).toBe(true);
  });

  it('should fire multiple SANDBOX_HARDCODED_PATH on different lines with correct line numbers', () => {
    const code = [
      'const a = "/data/storage/el1/base/files/a.txt";',
      '// safe line',
      'const b = "/storage/emulated/0/photos/b.jpg";',
    ].join('\n');
    const diags = analyzeText(code);
    const pathDiags = diags.filter((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH);
    expect(pathDiags.length).toBe(2);
    expect(pathDiags[0].line).toBe(0);
    expect(pathDiags[1].line).toBe(2);
  });

  it('should handle a real-world file combining many patterns', () => {
    const code = [
      "import router from '@ohos.router';",
      '',
      '@Entry',
      '@Component',
      'struct MainPage {',
      '  @State items: string[] = [];',
      '  @State data: any = null;',
      '',
      '  aboutToAppear() {',
      '    const file = "/data/storage/el1/base/files/config.json";',
      '  }',
      '',
      '  build() {',
      '    Column() {',
      '      ForEach(this.items, (item: string) => {',
      '        Text(item)',
      '          .onClick(() => {',
      "            router.pushUrl({ url: 'pages/Detail' })",
      '          })',
      '      })',
      '      console.log("render")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code);
    const codes = new Set(diags.map((d) => d.code));
    expect(codes.has(DIAG_CODES.DEPRECATED_ROUTER)).toBe(true);
    expect(codes.has(DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    expect(codes.has(DIAG_CODES.ANY_TYPE)).toBe(true);
    expect(codes.has(DIAG_CODES.STATE_SHALLOW)).toBe(true);
    expect(codes.has(DIAG_CODES.FOREACH_PERF)).toBe(true);
    expect(codes.has(DIAG_CODES.BUILD_HEAVY)).toBe(true);
    // Count total — should be >= 6 distinct rules firing
    expect(codes.size).toBeGreaterThanOrEqual(6);
  });

  it('should handle 10000-line file without performance regression', () => {
    const start = performance.now();
    const lines: string[] = ['@Entry', '@ComponentV2', 'struct StressPage {', '  @Local count: number = 0;'];
    for (let i = 0; i < 9990; i++) {
      if (i % 1000 === 0) {
        lines.push(`  // batch ${i / 1000}`);
        lines.push('  let x: any = 0;'); // Sprinkle some any types
      } else {
        lines.push(`  // line ${i}`);
      }
    }
    lines.push('  build() {', '    Column() {', '      Text("done")', '    }', '  }', '}');
    const code = lines.join('\n');
    const diags = analyzeText(code);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000); // Must finish within 2s
    expect(diags.some((d) => d.code === DIAG_CODES.ANY_TYPE)).toBe(true);
  });
});

// =========================================================================
// PART 5: Metadata cache consistency
// =========================================================================

describe('stress: metadata cache consistency', () => {
  it('repeated getDecorators() calls should return same reference', () => {
    const d1 = getDecorators();
    const d2 = getDecorators();
    expect(d1).toBe(d2); // Same cached reference
  });

  it('repeated getComponents() calls should return same reference', () => {
    const c1 = getComponents();
    const c2 = getComponents();
    expect(c1).toBe(c2); // Same cached reference
  });

  it('getDecoratorByName and getDecorators should be consistent', () => {
    for (const d of getDecorators()) {
      expect(getDecoratorByName(d.name)).toBe(d);
    }
  });

  it('getComponentByName and getComponents should be consistent', () => {
    for (const c of getComponents()) {
      expect(getComponentByName(c.name)).toBe(c);
    }
  });
});

// =========================================================================
// PART 6: Snippet cross-language isolation
// =========================================================================

describe('stress: snippet isolation between ArkTS and Cangjie', () => {
  const arktsSnippets = JSON.parse(readFileSync(join(__dirname, '..', 'snippets', 'arkts.snippets.json'), 'utf8'));
  const cangjieSnippets = JSON.parse(readFileSync(join(__dirname, '..', 'snippets', 'cangjie.snippets.json'), 'utf8'));

  it('snippet names should not collide between ArkTS and Cangjie', () => {
    const arktsNames = new Set(Object.keys(arktsSnippets));
    const cangjieNames = new Set(Object.keys(cangjieSnippets));
    const overlap = [...arktsNames].filter((n) => cangjieNames.has(n));
    expect(overlap).toHaveLength(0);
  });

  it('ArkTS snippet bodies should reference ArkTS constructs', () => {
    const arktsBody = Object.values(arktsSnippets)
      .map((s: any) => (Array.isArray(s.body) ? s.body.join('\n') : s.body))
      .join('\n');
    expect(arktsBody).toContain('struct');
    expect(arktsBody).toContain('build()');
  });

  it('Cangjie snippet bodies should reference Cangjie constructs', () => {
    const cangjieBody = Object.values(cangjieSnippets)
      .map((s: any) => (Array.isArray(s.body) ? s.body.join('\n') : s.body))
      .join('\n');
    expect(cangjieBody).toContain('func');
    expect(cangjieBody).toContain('Int64');
  });
});

// =========================================================================
// PART 7: Cangjie grammar regex stress
// =========================================================================

describe('stress: Cangjie grammar regex robustness', () => {
  const grammar = JSON.parse(readFileSync(join(__dirname, '..', 'syntaxes', 'cangjie.tmLanguage.json'), 'utf8'));

  it('keyword control regex should be valid', () => {
    const controlPattern = grammar.repository.keywords.patterns[0].match;
    expect(() => new RegExp(controlPattern)).not.toThrow();
    const re = new RegExp(controlPattern);
    expect(re.test('if')).toBe(true);
    expect(re.test('else')).toBe(true);
    expect(re.test('match')).toBe(true);
    expect(re.test('while')).toBe(true);
    expect(re.test('return')).toBe(true);
    expect(re.test('notakeyword')).toBe(false);
  });

  it('keyword declaration regex should be valid', () => {
    const declPattern = grammar.repository.keywords.patterns[1].match;
    expect(() => new RegExp(declPattern)).not.toThrow();
    const re = new RegExp(declPattern);
    expect(re.test('func')).toBe(true);
    expect(re.test('class')).toBe(true);
    expect(re.test('struct')).toBe(true);
    expect(re.test('enum')).toBe(true);
    expect(re.test('interface')).toBe(true);
    expect(re.test('let')).toBe(true);
    expect(re.test('var')).toBe(true);
  });

  it('keyword modifier regex should be valid', () => {
    const modPattern = grammar.repository.keywords.patterns[2].match;
    expect(() => new RegExp(modPattern)).not.toThrow();
    const re = new RegExp(modPattern);
    expect(re.test('public')).toBe(true);
    expect(re.test('private')).toBe(true);
    expect(re.test('static')).toBe(true);
    expect(re.test('spawn')).toBe(true);
    expect(re.test('unsafe')).toBe(true);
  });

  it('type regex should match built-in types', () => {
    const typePattern = grammar.repository.types.patterns[0].match;
    expect(() => new RegExp(typePattern)).not.toThrow();
    const re = new RegExp(typePattern);
    expect(re.test('Bool')).toBe(true);
    expect(re.test('Int64')).toBe(true);
    expect(re.test('Float64')).toBe(true);
    expect(re.test('String')).toBe(true);
    expect(re.test('Unit')).toBe(true);
    expect(re.test('Nothing')).toBe(true);
    expect(re.test('Rune')).toBe(true);
  });

  it('annotation regex should match @ prefixed names', () => {
    const annotPattern = grammar.repository.annotations.patterns[0].match;
    expect(() => new RegExp(annotPattern)).not.toThrow();
    const re = new RegExp(annotPattern);
    expect(re.test('@C')).toBe(true);
    expect(re.test('@MyAnnotation')).toBe(true);
    expect(re.test('@_private')).toBe(true);
  });

  it('number regexes should match all number forms', () => {
    const numPatterns = grammar.repository.numbers.patterns;
    
    // Hex
    const hexRe = new RegExp(numPatterns[0].match);
    expect(hexRe.test('0xFF')).toBe(true);
    expect(hexRe.test('0x1A_2B')).toBe(true);
    
    // Binary
    const binRe = new RegExp(numPatterns[1].match);
    expect(binRe.test('0b1010')).toBe(true);
    expect(binRe.test('0b1_0_1')).toBe(true);
    
    // Octal
    const octRe = new RegExp(numPatterns[2].match);
    expect(octRe.test('0o77')).toBe(true);
    
    // Float
    const floatRe = new RegExp(numPatterns[3].match);
    expect(floatRe.test('3.14')).toBe(true);
    expect(floatRe.test('1.0e10')).toBe(true);
    
    // Integer
    const intRe = new RegExp(numPatterns[4].match);
    expect(intRe.test('42')).toBe(true);
    expect(intRe.test('1_000_000')).toBe(true);
  });

  it('string patterns should handle escape sequences', () => {
    const strPatterns = grammar.repository.strings.patterns;
    const doubleQuote = strPatterns[0];
    expect(doubleQuote.patterns).toBeDefined();
    // Should have escape and interpolation sub-patterns
    expect(doubleQuote.patterns.length).toBeGreaterThanOrEqual(2);
  });
});
