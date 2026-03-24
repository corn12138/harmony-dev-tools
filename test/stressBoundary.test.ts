import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { analyzeText, DIAG_CODES } from '../src/language/diagnosticProvider';
import { getDecorators, getComponents, getDecoratorByName, getComponentByName, getFeaturesAboveApi, apiLabel } from '../src/utils/metadata';

// =========================================================================
// PART 1: Diagnostic Provider — Extreme Boundary Tests
// =========================================================================

describe('stress: diagnosticProvider boundary coverage', () => {
  // -----------------------------------------------------------------------
  // Empty / minimal inputs
  // -----------------------------------------------------------------------
  describe('empty and minimal inputs', () => {
    it('should handle empty string', () => {
      expect(analyzeText('')).toHaveLength(0);
    });

    it('should handle single newline', () => {
      expect(analyzeText('\n')).toHaveLength(0);
    });

    it('should handle only whitespace (tabs + spaces)', () => {
      expect(analyzeText('    \t\t\n   \n\t')).toHaveLength(0);
    });

    it('should handle single character', () => {
      expect(analyzeText('x')).toHaveLength(0);
    });

    it('should handle a file with 10000+ empty lines', () => {
      const code = '\n'.repeat(10001);
      expect(analyzeText(code)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // DEPRECATED_ROUTER — boundary cases
  // -----------------------------------------------------------------------
  describe('DEPRECATED_ROUTER boundary', () => {
    it('should detect import router from @ohos.router with double quotes', () => {
      const code = 'import router from "@ohos.router";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toBe(true);
    });

    it('should detect import router from @ohos.router with single quotes', () => {
      const code = "import router from '@ohos.router';";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toBe(true);
    });

    it('should detect destructured import from @ohos.router', () => {
      const code = "import { Router } from '@ohos.router';";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toBe(true);
    });

    it('should detect router.pushUrl call', () => {
      const code = "router.pushUrl({ url: 'pages/Detail' });";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('pushUrl'))).toBe(true);
    });

    it('should detect router.replaceUrl call', () => {
      const code = "router.replaceUrl({ url: 'pages/Home' });";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('replaceUrl'))).toBe(true);
    });

    it('should detect router.back call', () => {
      const code = 'router.back();';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('back'))).toBe(true);
    });

    it('should detect router.pushNamedRoute call', () => {
      const code = "router.pushNamedRoute({ name: 'detail' });";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('pushNamedRoute'))).toBe(true);
    });

    it('should detect router.getParams call', () => {
      const code = 'const params = router.getParams();';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('getParams'))).toBe(true);
    });

    it('should detect router.getLength call', () => {
      const code = 'const len = router.getLength();';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('getLength'))).toBe(true);
    });

    it('should detect router.clear call', () => {
      const code = 'router.clear();';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('clear'))).toBe(true);
    });

    it('should NOT flag router import in block comment', () => {
      const code = "/* import router from '@ohos.router'; */";
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toHaveLength(0);
    });

    it('should NOT flag router import in line comment', () => {
      const code = "// import router from '@ohos.router';";
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toHaveLength(0);
    });

    it('should NOT flag router.pushUrl in line comment', () => {
      const code = "// router.pushUrl({ url: 'pages/Detail' });";
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toHaveLength(0);
    });

    it('should NOT flag non-ohos router imports', () => {
      const code = "import router from './myRouter';";
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toHaveLength(0);
    });

    it('should detect both import AND call in same file', () => {
      const code = [
        "import router from '@ohos.router';",
        "router.pushUrl({ url: 'pages/Detail' });",
      ].join('\n');
      const diags = analyzeText(code);
      const routerDiags = diags.filter((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER);
      expect(routerDiags.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect router.showAlertBeforeBackPage call', () => {
      const code = "router.showAlertBeforeBackPage({ message: 'confirm?' });";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('showAlertBeforeBackPage'))).toBe(true);
    });

    it('should detect router.hideAlertBeforeBackPage call', () => {
      const code = 'router.hideAlertBeforeBackPage();';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('hideAlertBeforeBackPage'))).toBe(true);
    });

    it('should detect router.getState call', () => {
      const code = 'const state = router.getState();';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER && d.message.includes('getState'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // SANDBOX_HARDCODED_PATH — boundary cases
  // -----------------------------------------------------------------------
  describe('SANDBOX_HARDCODED_PATH boundary', () => {
    it('should detect /data/storage/ path with double quotes', () => {
      const code = 'const path = "/data/storage/el1/base/files/data.json";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /data/storage/ path with single quotes', () => {
      const code = "const path = '/data/storage/el2/base/caches/temp.txt';";
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /data/accounts/ path', () => {
      const code = 'const path = "/data/accounts/account_0/appdata/com.example/files/";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /data/app/ path', () => {
      const code = 'const p = "/data/app/el1/bundle/public/com.example/entry/";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /data/el1/ path', () => {
      const code = 'const path = "/data/el1/bundle/public/com.example/";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /data/el2/ path', () => {
      const code = 'const path = "/data/el2/bundle/public/com.example/";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /storage/ path', () => {
      const code = 'const path = "/storage/emulated/0/DCIM/Camera/photo.jpg";';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should detect /storage/ path with template literal', () => {
      const code = 'const path = `/storage/media/100/local/files/photo.jpg`;';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toBe(true);
    });

    it('should NOT flag /data/ paths in comments', () => {
      const code = '// const path = "/data/storage/el1/base/files/data.json";';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toHaveLength(0);
    });

    it('should NOT flag /data/ paths in block comments', () => {
      const code = '/* const path = "/data/storage/el1/base/files/data.json"; */';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toHaveLength(0);
    });

    it('should NOT flag safe sandbox API paths', () => {
      const code = "const path = getContext(this).filesDir + '/data.json';";
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toHaveLength(0);
    });

    it('should NOT flag /data/ when not followed by known subdirs', () => {
      const code = 'const path = "/data/random/path/here";';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH)).toHaveLength(0);
    });

    it('should detect multiple hardcoded paths in same file', () => {
      const code = [
        'const a = "/data/storage/el1/base/files/a.txt";',
        'const b = "/storage/emulated/0/DCIM/b.jpg";',
        'const c = "/data/app/el1/bundle/public/com.example/c.so";',
      ].join('\n');
      const diags = analyzeText(code);
      const pathDiags = diags.filter((d) => d.code === DIAG_CODES.SANDBOX_HARDCODED_PATH);
      expect(pathDiags.length).toBeGreaterThanOrEqual(3);
    });
  });

  // -----------------------------------------------------------------------
  // Large file stress
  // -----------------------------------------------------------------------
  describe('large file stress', () => {
    it('should handle 5000-line file without crashing', () => {
      const lines: string[] = [
        "import router from '@ohos.router';",
        '@Entry',
        '@ComponentV2',
        'struct StressPage {',
        '  @Local count: number = 0;',
      ];
      for (let i = 0; i < 4990; i++) {
        lines.push(`  // line ${i}`);
      }
      lines.push('  build() {', '    Column() {}', '  }', '}');
      const code = lines.join('\n');
      const diags = analyzeText(code);
      expect(Array.isArray(diags)).toBe(true);
      expect(diags.some((d) => d.code === DIAG_CODES.DEPRECATED_ROUTER)).toBe(true);
    });

    it('should handle deeply nested braces', () => {
      let code = 'build() {\n';
      for (let i = 0; i < 50; i++) {
        code += '  '.repeat(i + 1) + 'Column() {\n';
      }
      for (let i = 49; i >= 0; i--) {
        code += '  '.repeat(i + 1) + '}\n';
      }
      code += '}';
      const diags = analyzeText(code);
      expect(Array.isArray(diags)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Unicode and special character stress
  // -----------------------------------------------------------------------
  describe('unicode and special characters', () => {
    it('should handle Chinese variable names', () => {
      const code = '@ComponentV2\nstruct 页面 {\n  @Local 计数: number = 0;\n  build() { Column() {} }\n}';
      const diags = analyzeText(code);
      expect(Array.isArray(diags)).toBe(true);
    });

    it('should handle emoji in strings', () => {
      const code = 'build() {\n  Text("Hello 🌍🎉")\n}';
      const diags = analyzeText(code);
      expect(Array.isArray(diags)).toBe(true);
    });

    it('should handle mixed CJK and Latin in comments', () => {
      const code = '// 这是 ArkTS 注释 with mixed 语言\nlet x: number = 0;';
      const diags = analyzeText(code);
      expect(Array.isArray(diags)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // V1/V2 mixing edge cases
  // -----------------------------------------------------------------------
  describe('V1/V2 mixing extreme edge cases', () => {
    it('should handle 3+ structs with mixed V1/V2', () => {
      const code = [
        '@Component', 'struct A { @State n: number = 0; build() {} }',
        '@ComponentV2', 'struct B { @Local n: number = 0; build() {} }',
        '@Component', 'struct C { @Prop m: string = ""; build() {} }',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.V1_V2_MIX)).toBe(true);
    });

    it('should NOT flag single V2 struct with all V2 decorators', () => {
      const code = [
        '@ComponentV2',
        'struct Pure {',
        '  @Local a: number = 0;',
        '  @Param b: string = "";',
        '  @Event onTap: () => void = () => {};',
        '  @Computed get c() { return this.a + 1; }',
        '  @Monitor("a") onAChange() {}',
        '  build() {}',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.V1_V2_MIX)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple rules firing on same line
  // -----------------------------------------------------------------------
  describe('multiple diagnostics on same line', () => {
    it('should detect any type AND @State shallow on different properties', () => {
      const code = '@Component\nstruct P {\n  @State data: any = null;\n  @State items: string[] = [];\n  build() {}\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.ANY_TYPE)).toBe(true);
      expect(diags.some((d) => d.code === DIAG_CODES.STATE_SHALLOW)).toBe(true);
    });
  });
});

// =========================================================================
// PART 2: Metadata — Boundary Tests
// =========================================================================

describe('stress: metadata boundary coverage', () => {
  it('should load all decorators without error', () => {
    const decorators = getDecorators();
    expect(decorators.length).toBeGreaterThanOrEqual(25);
  });

  it('should load all components without error', () => {
    const components = getComponents();
    expect(components.length).toBeGreaterThanOrEqual(95);
  });

  it('should have unique names in decorators', () => {
    const names = getDecorators().map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should have unique names in components', () => {
    const names = getComponents().map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should include @Track decorator (API 12+)', () => {
    const track = getDecoratorByName('@Track');
    expect(track).toBeDefined();
    expect(track!.minApi).toBe(12);
    expect(track!.stateModel).toBe('v1');
  });

  it('should include Repeat component (API 12+)', () => {
    const repeat = getComponentByName('Repeat');
    expect(repeat).toBeDefined();
    expect(repeat!.minApi).toBe(12);
  });

  it('should include FoldSplitContainer component (API 20)', () => {
    const comp = getComponentByName('FoldSplitContainer');
    expect(comp).toBeDefined();
    expect(comp!.minApi).toBe(20);
  });

  it('should include MediaCachedImage component (API 20)', () => {
    const comp = getComponentByName('MediaCachedImage');
    expect(comp).toBeDefined();
    expect(comp!.minApi).toBe(20);
  });

  it('should include ExpandableTitle component (API 20)', () => {
    const comp = getComponentByName('ExpandableTitle');
    expect(comp).toBeDefined();
    expect(comp!.minApi).toBe(20);
  });

  it('should return undefined for non-existent decorator', () => {
    expect(getDecoratorByName('@NonExistent')).toBeUndefined();
  });

  it('should return undefined for non-existent component', () => {
    expect(getComponentByName('FakeComponent')).toBeUndefined();
  });

  // getFeaturesAboveApi boundary
  it('should return all features when apiLevel is 0', () => {
    const features = getFeaturesAboveApi(0);
    expect(features.length).toBeGreaterThan(0);
  });

  it('should return no features when apiLevel is 99', () => {
    const features = getFeaturesAboveApi(99);
    expect(features).toHaveLength(0);
  });

  it('should return only API 20+ features when apiLevel is 19', () => {
    const features = getFeaturesAboveApi(19);
    expect(features.every((f) => f.minApi >= 20)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
  });

  it('should include both decorators and components in above-api results', () => {
    const features = getFeaturesAboveApi(11);
    const kinds = new Set(features.map((f) => f.kind));
    expect(kinds.has('decorator')).toBe(true);
    expect(kinds.has('component')).toBe(true);
  });

  // apiLabel boundary
  it('should return empty string for minApi <= 8', () => {
    expect(apiLabel(8)).toBe('');
    expect(apiLabel(0)).toBe('');
    expect(apiLabel(-1)).toBe('');
  });

  it('should return API X+ for minApi > 8', () => {
    expect(apiLabel(12)).toBe('API 12+');
    expect(apiLabel(20)).toBe('API 20+');
  });

  // Decorator schema validation
  it('every decorator should have required fields', () => {
    for (const d of getDecorators()) {
      expect(d.name).toBeTruthy();
      expect(d.name.startsWith('@')).toBe(true);
      expect(typeof d.minApi).toBe('number');
      expect(d.en).toBeTruthy();
      expect(d.zh).toBeTruthy();
      expect(d.docUrl).toBeTruthy();
      expect(['component', 'state', 'style', 'concurrency', 'ability', 'common']).toContain(d.category);
      expect(['v1', 'v2', 'common']).toContain(d.stateModel);
    }
  });

  // Component schema validation
  it('every component should have required fields', () => {
    for (const c of getComponents()) {
      expect(c.name).toBeTruthy();
      expect(typeof c.minApi).toBe('number');
      expect(c.en).toBeTruthy();
      expect(c.zh).toBeTruthy();
      expect(c.docUrl).toBeTruthy();
      expect(['layout', 'basic', 'media', 'canvas', 'menu']).toContain(c.category);
      expect(typeof c.hasChildren).toBe('boolean');
    }
  });
});

// =========================================================================
// PART 3: Snippets — Boundary Tests
// =========================================================================

describe('stress: snippet boundary coverage', () => {
  const arktsSnippetsPath = join(__dirname, '..', 'snippets', 'arkts.snippets.json');
  const cangjieSnippetsPath = join(__dirname, '..', 'snippets', 'cangjie.snippets.json');

  describe('ArkTS snippets integrity', () => {
    const snippets = JSON.parse(readFileSync(arktsSnippetsPath, 'utf8'));

    it('should have at least 80 snippets', () => {
      expect(Object.keys(snippets).length).toBeGreaterThanOrEqual(80);
    });

    it('should have unique prefixes', () => {
      const prefixes = Object.values(snippets).map((s: any) => s.prefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });

    it('should have no empty bodies', () => {
      for (const [name, snippet] of Object.entries(snippets) as [string, any][]) {
        if (typeof snippet.body === 'string') {
          expect(snippet.body.length).toBeGreaterThan(0);
        } else {
          expect(snippet.body.length).toBeGreaterThan(0);
        }
      }
    });

    // New snippets from this iteration
    const newPrefixes = ['listpage', 'detailpage', 'emptystate', 'loginpage', 'fileio', 'navdest', 'symbolglyph', 'track', 'mediacachedimg', 'foldsplit'];
    for (const prefix of newPrefixes) {
      it(`should have new snippet with prefix "${prefix}"`, () => {
        const found = Object.values(snippets).some((s: any) => s.prefix === prefix);
        expect(found).toBe(true);
      });
    }

    it('listpage snippet should contain Navigation and Refresh', () => {
      const snippet = Object.values(snippets).find((s: any) => s.prefix === 'listpage') as any;
      const body = Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body;
      expect(body).toContain('Navigation');
      expect(body).toContain('Refresh');
      expect(body).toContain('ForEach');
    });

    it('fileio snippet should use getContext sandbox API', () => {
      const snippet = Object.values(snippets).find((s: any) => s.prefix === 'fileio') as any;
      const body = Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body;
      expect(body).toContain('getContext');
      expect(body).toContain('filesDir');
      expect(body).toContain('fileIo');
    });
  });

  describe('Cangjie snippets integrity', () => {
    it('cangjie snippets file should exist', () => {
      expect(existsSync(cangjieSnippetsPath)).toBe(true);
    });

    const snippets = JSON.parse(readFileSync(cangjieSnippetsPath, 'utf8'));

    it('should have at least 10 snippets', () => {
      expect(Object.keys(snippets).length).toBeGreaterThanOrEqual(10);
    });

    it('should have unique prefixes', () => {
      const prefixes = Object.values(snippets).map((s: any) => s.prefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });

    const requiredPrefixes = ['main', 'func', 'class', 'struct', 'enum', 'interface', 'match', 'let', 'var', 'spawn'];
    for (const prefix of requiredPrefixes) {
      it(`should have snippet with prefix "${prefix}"`, () => {
        const found = Object.values(snippets).some((s: any) => s.prefix === prefix);
        expect(found).toBe(true);
      });
    }

    for (const [name, snippet] of Object.entries(snippets) as [string, any][]) {
      it(`"${name}" should have prefix, body, and description`, () => {
        expect(snippet.prefix).toBeTruthy();
        expect(snippet.body).toBeTruthy();
        expect(snippet.description).toBeTruthy();
      });
    }
  });
});

// =========================================================================
// PART 4: Cangjie Language Files — Boundary Tests
// =========================================================================

describe('stress: Cangjie language files integrity', () => {
  const grammarPath = join(__dirname, '..', 'syntaxes', 'cangjie.tmLanguage.json');
  const langConfigPath = join(__dirname, '..', 'cangjie-language-configuration.json');

  it('grammar file should exist', () => {
    expect(existsSync(grammarPath)).toBe(true);
  });

  it('grammar should be valid JSON', () => {
    expect(() => JSON.parse(readFileSync(grammarPath, 'utf8'))).not.toThrow();
  });

  it('grammar should have correct scopeName', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    expect(grammar.scopeName).toBe('source.cangjie');
  });

  it('grammar should have keyword patterns', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    expect(grammar.repository.keywords).toBeDefined();
    const patterns = grammar.repository.keywords.patterns;
    expect(patterns.length).toBeGreaterThanOrEqual(3);
  });

  it('grammar should define all Cangjie keywords', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    const allPatterns = grammar.repository.keywords.patterns.map((p: any) => p.match).join('|');
    const requiredKeywords = ['func', 'class', 'struct', 'enum', 'interface', 'let', 'var', 'match', 'if', 'else', 'while', 'for', 'return', 'import', 'spawn', 'macro'];
    for (const kw of requiredKeywords) {
      expect(allPatterns).toContain(kw);
    }
  });

  it('grammar should have built-in type patterns', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    const typePattern = grammar.repository.types.patterns[0].match;
    const requiredTypes = ['Bool', 'Int64', 'Float64', 'String', 'Unit', 'Nothing', 'Rune'];
    for (const t of requiredTypes) {
      expect(typePattern).toContain(t);
    }
  });

  it('grammar should have annotation support', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    expect(grammar.repository.annotations).toBeDefined();
  });

  it('grammar should have string patterns with interpolation', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    const stringPatterns = grammar.repository.strings.patterns;
    expect(stringPatterns.length).toBeGreaterThanOrEqual(2);
  });

  it('grammar should support nested block comments', () => {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
    const commentPatterns = grammar.repository.comments.patterns;
    const blockComment = commentPatterns.find((p: any) => p.name?.includes('block'));
    expect(blockComment).toBeDefined();
    expect(blockComment.patterns).toBeDefined(); // nested comments support
  });

  it('language config should exist', () => {
    expect(existsSync(langConfigPath)).toBe(true);
  });

  it('language config should be valid JSON', () => {
    expect(() => JSON.parse(readFileSync(langConfigPath, 'utf8'))).not.toThrow();
  });

  it('language config should have comment rules', () => {
    const config = JSON.parse(readFileSync(langConfigPath, 'utf8'));
    expect(config.comments.lineComment).toBe('//');
    expect(config.comments.blockComment).toEqual(['/*', '*/']);
  });

  it('language config should have brackets', () => {
    const config = JSON.parse(readFileSync(langConfigPath, 'utf8'));
    expect(config.brackets.length).toBeGreaterThanOrEqual(3);
  });

  it('language config should have auto-closing pairs', () => {
    const config = JSON.parse(readFileSync(langConfigPath, 'utf8'));
    expect(config.autoClosingPairs.length).toBeGreaterThanOrEqual(5);
  });
});

// =========================================================================
// PART 5: package.json — Cangjie Registration
// =========================================================================

describe('stress: package.json Cangjie registration', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

  it('should register Cangjie language', () => {
    const cjLang = pkg.contributes.languages.find((l: any) => l.id === 'cangjie');
    expect(cjLang).toBeDefined();
    expect(cjLang.extensions).toContain('.cj');
    expect(cjLang.aliases).toContain('Cangjie');
    expect(cjLang.aliases).toContain('仓颉');
  });

  it('should register Cangjie grammar', () => {
    const cjGrammar = pkg.contributes.grammars.find((g: any) => g.language === 'cangjie');
    expect(cjGrammar).toBeDefined();
    expect(cjGrammar.scopeName).toBe('source.cangjie');
  });

  it('should register Cangjie snippets', () => {
    const cjSnippets = pkg.contributes.snippets.find((s: any) => s.language === 'cangjie');
    expect(cjSnippets).toBeDefined();
    expect(cjSnippets.path).toContain('cangjie');
  });

  it('ArkTS language registration should still exist', () => {
    const arkts = pkg.contributes.languages.find((l: any) => l.id === 'arkts');
    expect(arkts).toBeDefined();
    expect(arkts.extensions).toContain('.ets');
  });
});

// =========================================================================
// PART 6: DIAG_CODES completeness
// =========================================================================

describe('stress: DIAG_CODES completeness', () => {
  it('should have DEPRECATED_ROUTER code', () => {
    expect(DIAG_CODES.DEPRECATED_ROUTER).toBe('arkts-deprecated-router');
  });

  it('should have SANDBOX_HARDCODED_PATH code', () => {
    expect(DIAG_CODES.SANDBOX_HARDCODED_PATH).toBe('arkts-sandbox-hardcoded-path');
  });

  it('should have at least 16 diagnostic codes', () => {
    expect(Object.keys(DIAG_CODES).length).toBeGreaterThanOrEqual(16);
  });

  it('all codes should be unique', () => {
    const codes = Object.values(DIAG_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('all codes should start with arkts-', () => {
    for (const code of Object.values(DIAG_CODES)) {
      expect(code).toMatch(/^arkts-/);
    }
  });
});
