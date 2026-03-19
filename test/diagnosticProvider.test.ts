import { describe, it, expect } from 'vitest';
import { analyzeText, extractBuildBlocks, DIAG_CODES } from '../src/language/diagnosticProvider';

// We mock vscode.DiagnosticSeverity as plain numbers matching the enum
// 0=Error, 1=Warning, 2=Information, 3=Hint

describe('diagnosticProvider — analyzeText', () => {
  // -------------------------------------------------------------------
  // Rule 1: ArkTS strict type rules
  // -------------------------------------------------------------------
  describe('any/unknown type detection', () => {
    it('should detect `: any` type annotation', () => {
      const code = 'let data: any = null;';
      const diags = analyzeText(code);
      const anyDiag = diags.find((d) => d.code === DIAG_CODES.ANY_TYPE);
      expect(anyDiag).toBeDefined();
      expect(anyDiag!.message).toContain('any');
      expect(anyDiag!.line).toBe(0);
    });

    it('should detect `: unknown` type annotation', () => {
      const code = 'function parse(input: unknown): string { return ""; }';
      const diags = analyzeText(code);
      const unknownDiag = diags.find((d) => d.code === DIAG_CODES.UNKNOWN_TYPE);
      expect(unknownDiag).toBeDefined();
      expect(unknownDiag!.message).toContain('unknown');
    });

    it('should detect `as any` cast', () => {
      const code = 'const val = someObj as any;';
      const diags = analyzeText(code);
      const asAnyDiag = diags.find((d) => d.code === DIAG_CODES.AS_ANY);
      expect(asAnyDiag).toBeDefined();
      expect(asAnyDiag!.message).toContain('as any');
    });

    it('should not flag comments containing any/unknown', () => {
      const code = '// This uses any type for legacy reasons';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.ANY_TYPE)).toHaveLength(0);
    });

    it('should not flag `as any` in comments', () => {
      const code = '// cast as any is bad';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.AS_ANY)).toHaveLength(0);
    });

    it('should detect multiple any types in separate lines', () => {
      const code = 'let a: any = 1;\nlet b: any = 2;';
      const diags = analyzeText(code);
      const anyDiags = diags.filter((d) => d.code === DIAG_CODES.ANY_TYPE);
      expect(anyDiags).toHaveLength(2);
      expect(anyDiags[0].line).toBe(0);
      expect(anyDiags[1].line).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // Rule 2: State management traps
  // -------------------------------------------------------------------
  describe('state management traps', () => {
    it('should warn @State with Array type (shallow observation)', () => {
      const code = '@Component\nstruct MyPage {\n  @State items: Array<string> = [];\n}';
      const diags = analyzeText(code);
      const shallow = diags.find((d) => d.code === DIAG_CODES.STATE_SHALLOW);
      expect(shallow).toBeDefined();
      expect(shallow!.message).toContain('浅观察');
    });

    it('should warn @State with array literal type', () => {
      const code = '@Component\nstruct Page {\n  @State list: string[] = [];\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.STATE_SHALLOW)).toBe(true);
    });

    it('should warn @State with custom class type', () => {
      const code = '@Component\nstruct Page {\n  @State user: UserModel = new UserModel();\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.STATE_SHALLOW)).toBe(true);
    });

    it('should NOT warn @State with primitive types', () => {
      const code = '@Component\nstruct Page {\n  @State count: number = 0;\n  @State name: string = "";\n}';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.STATE_SHALLOW)).toHaveLength(0);
    });

    it('should detect V1/V2 decorator mixing', () => {
      const code = '@Component\nstruct A {\n  @State val: string = "";\n}\n@ComponentV2\nstruct B {\n  @Local val: string = "";\n}';
      const diags = analyzeText(code);
      const mix = diags.find((d) => d.code === DIAG_CODES.V1_V2_MIX);
      expect(mix).toBeDefined();
      expect(mix!.message).toContain('V1');
      expect(mix!.message).toContain('V2');
    });

    it('should NOT flag pure V2 code', () => {
      const code = '@ComponentV2\nstruct Page {\n  @Local count: number = 0;\n  @Param title: string = "";\n}';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.V1_V2_MIX)).toHaveLength(0);
    });

    it('should NOT flag pure V1 code', () => {
      const code = '@Component\nstruct Page {\n  @State count: number = 0;\n  @Prop title: string = "";\n}';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.V1_V2_MIX)).toHaveLength(0);
    });

    it('should detect @Link inside @ComponentV2 block', () => {
      const code = '@ComponentV2\nstruct Page {\n  @Link value: string;\n}';
      const diags = analyzeText(code);
      const linkDiag = diags.find((d) => d.code === DIAG_CODES.LINK_IN_V2);
      expect(linkDiag).toBeDefined();
      expect(linkDiag!.message).toContain('@Param');
    });

    it('should NOT flag @Link in V1 component', () => {
      const code = '@Component\nstruct Child {\n  @Link value: string;\n}';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.LINK_IN_V2)).toHaveLength(0);
    });

    it('should warn when @ReusableV2 component is used directly inside Repeat.template', () => {
      const code = [
        '@ComponentV2',
        '@ReusableV2',
        'struct ReusableCard {',
        '  build() {',
        '    Text("item")',
        '  }',
        '}',
        '@ComponentV2',
        'struct HostPage {',
        '  build() {',
        '    Repeat<string>(this.items)',
        '      .each((item) => item)',
        '      .template("default", (item: string) => {',
        '        ReusableCard()',
        '      })',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      const reusableDiag = diags.find((d) => d.code === DIAG_CODES.REUSABLE_V2_REPEAT_TEMPLATE);
      expect(reusableDiag).toBeDefined();
      expect(reusableDiag!.message).toContain('Repeat.template');
      expect(reusableDiag!.message).toContain('ReusableCard');
    });

    it('should NOT flag normal @ComponentV2 child usage inside Repeat.template', () => {
      const code = [
        '@ComponentV2',
        'struct PlainCard {',
        '  build() {',
        '    Text("item")',
        '  }',
        '}',
        '@ComponentV2',
        'struct HostPage {',
        '  build() {',
        '    Repeat<string>(this.items)',
        '      .each((item) => item)',
        '      .template("default", (item: string) => {',
        '        PlainCard()',
        '      })',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.REUSABLE_V2_REPEAT_TEMPLATE)).toHaveLength(0);
    });

    it('should NOT flag @ReusableV2 component usage outside Repeat.template', () => {
      const code = [
        '@ComponentV2',
        '@ReusableV2',
        'struct ReusableCard {',
        '  build() {',
        '    Text("item")',
        '  }',
        '}',
        '@ComponentV2',
        'struct HostPage {',
        '  build() {',
        '    Column() {',
        '      ReusableCard()',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.REUSABLE_V2_REPEAT_TEMPLATE)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // Rule 3: Performance anti-patterns
  // -------------------------------------------------------------------
  describe('performance anti-patterns', () => {
    it('should suggest LazyForEach when ForEach is used', () => {
      const code = 'build() {\n  Column() {\n    ForEach(this.items, (item) => {\n      Text(item)\n    })\n  }\n}';
      const diags = analyzeText(code);
      const fePerf = diags.find((d) => d.code === DIAG_CODES.FOREACH_PERF);
      expect(fePerf).toBeDefined();
      expect(fePerf!.message).toContain('LazyForEach');
    });

    it('should NOT flag LazyForEach usage', () => {
      const code = 'LazyForEach(this.dataSource, (item) => {\n  Text(item.name)\n})';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.FOREACH_PERF)).toHaveLength(0);
    });

    it('should detect fetch() in build()', () => {
      const code = 'build() {\n  fetch("http://api.example.com")\n}';
      const diags = analyzeText(code);
      const heavy = diags.find((d) => d.code === DIAG_CODES.BUILD_HEAVY);
      expect(heavy).toBeDefined();
      expect(heavy!.message).toContain('Network requests');
    });

    it('should detect setTimeout in build()', () => {
      const code = 'build() {\n  setTimeout(() => {}, 100)\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('setTimeout'))).toBe(true);
    });

    it('should detect console.log in build()', () => {
      const code = 'build() {\n  console.log("rendering")\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('console'))).toBe(true);
    });

    it('should detect JSON.parse in build()', () => {
      const code = 'build() {\n  const data = JSON.parse(this.raw)\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('JSON'))).toBe(true);
    });

    it('should detect await in build()', () => {
      const code = 'build() {\n  await loadData()\n}';
      const diags = analyzeText(code);
      expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('async/await'))).toBe(true);
    });

    it('should NOT flag heavy patterns outside build()', () => {
      const code = 'aboutToAppear() {\n  fetch("http://api.example.com")\n  console.log("init")\n}';
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.BUILD_HEAVY)).toHaveLength(0);
    });

    it('should report the exact column for heavy patterns in nested build blocks', () => {
      const code = [
        'build() {',
        '  Column() {',
        '    console.log("rendering")',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      const heavy = diags.find((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('console'));
      expect(heavy).toBeDefined();
      expect(heavy!.line).toBe(2);
      expect(heavy!.colStart).toBe(4);
      expect(heavy!.colEnd).toBe(16);
    });

    it('should warn when ThemeControl.setDefaultTheme is called inside build()', () => {
      const code = [
        '@Entry',
        '@Component',
        'struct Page {',
        '  build() {',
        '    ThemeControl.setDefaultTheme(AppTheme)',
        '    Column() {}',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      const themeDiag = diags.find((d) => d.code === DIAG_CODES.THEMECONTROL_IN_BUILD);
      expect(themeDiag).toBeDefined();
      expect(themeDiag!.message).toContain('onWindowStageCreate');
    });

    it('should not warn when ThemeControl.setDefaultTheme is outside build()', () => {
      const code = [
        'ThemeControl.setDefaultTheme(AppTheme)',
        '@Entry',
        '@Component',
        'struct Page {',
        '  build() {',
        '    Column() {}',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.THEMECONTROL_IN_BUILD)).toHaveLength(0);
    });

    it('should inform when an instantiated CustomTheme class has no colors override', () => {
      const code = [
        'class EmptyTheme implements CustomTheme {',
        '}',
        '@Entry',
        '@Component',
        'struct Page {',
        '  @State customTheme: CustomTheme = new EmptyTheme();',
        '  build() {',
        '    WithTheme({ theme: this.customTheme }) {',
        '      Column() {}',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      const customThemeDiag = diags.find((d) => d.code === DIAG_CODES.CUSTOM_THEME_NO_COLORS);
      expect(customThemeDiag).toBeDefined();
      expect(customThemeDiag!.message).toContain('colors');
      expect(customThemeDiag!.message).toContain('EmptyTheme');
    });

    it('should not inform when CustomTheme overrides colors', () => {
      const code = [
        'class AppTheme implements CustomTheme {',
        '  public colors: AppColors = new AppColors();',
        '}',
        '@Entry',
        '@Component',
        'struct Page {',
        '  @State customTheme: CustomTheme = new AppTheme();',
        '  build() {',
        '    WithTheme({ theme: this.customTheme }) {',
        '      Column() {}',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.CUSTOM_THEME_NO_COLORS)).toHaveLength(0);
    });

    it('should not inform when empty CustomTheme class is never instantiated', () => {
      const code = [
        'class EmptyTheme implements CustomTheme {',
        '}',
        '@Entry',
        '@Component',
        'struct Page {',
        '  build() {',
        '    Column() {}',
        '  }',
        '}',
      ].join('\n');
      const diags = analyzeText(code);
      expect(diags.filter((d) => d.code === DIAG_CODES.CUSTOM_THEME_NO_COLORS)).toHaveLength(0);
    });
  });
});

describe('api-level compatibility diagnostics', () => {
  it('should warn when WithTheme is used inside a V2 component below API 16', () => {
    const code = [
      '@ComponentV2',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ colorMode: ThemeColorMode.SYSTEM }) {',
      '      Text("hello")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, 15);
    expect(diags.some((d) => d.code === DIAG_CODES.API_LEVEL && d.message.includes('WithTheme') && d.message.includes('API 16+'))).toBe(true);
  });

  it('should not warn when WithTheme is used inside a V2 component on API 16+', () => {
    const code = [
      '@ComponentV2',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ colorMode: ThemeColorMode.SYSTEM }) {',
      '      Text("hello")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, 16);
    expect(diags.some((d) => d.code === DIAG_CODES.API_LEVEL && d.message.includes('WithTheme'))).toBe(false);
  });

  it('should not warn when WithTheme is used in a V1 component below API 16', () => {
    const code = [
      '@Component',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ colorMode: ThemeColorMode.SYSTEM }) {',
      '      Text("hello")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, 15);
    expect(diags.some((d) => d.code === DIAG_CODES.API_LEVEL && d.message.includes('WithTheme') && d.message.includes('API 16+'))).toBe(false);
  });

  it('should warn when onWillApplyTheme is used inside a V2 component below API 16', () => {
    const code = [
      '@ComponentV2',
      'struct ThemedPage {',
      '  onWillApplyTheme(theme: Theme) {',
      '    console.info(theme)',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, 15);
    expect(diags.some((d) => d.code === DIAG_CODES.API_LEVEL && d.message.includes('onWillApplyTheme') && d.message.includes('API 16+'))).toBe(true);
  });

  it('should not warn when onWillApplyTheme is used inside a V2 component on API 16+', () => {
    const code = [
      '@ComponentV2',
      'struct ThemedPage {',
      '  onWillApplyTheme(theme: Theme) {',
      '    console.info(theme)',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, 16);
    expect(diags.some((d) => d.code === DIAG_CODES.API_LEVEL && d.message.includes('onWillApplyTheme'))).toBe(false);
  });

  it('should warn when WithTheme colorMode is used without dark.json resources', () => {
    const code = [
      '@Entry',
      '@Component',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ colorMode: ThemeColorMode.DARK }) {',
      '      Text("hello")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, undefined, { hasDarkThemeResource: false });
    expect(diags.some((d) => d.code === DIAG_CODES.WITH_THEME_DARK_RESOURCE && d.message.includes('dark.json'))).toBe(true);
  });

  it('should not warn when WithTheme colorMode is used and dark.json resources exist', () => {
    const code = [
      '@Entry',
      '@Component',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ colorMode: ThemeColorMode.DARK }) {',
      '      Text("hello")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, undefined, { hasDarkThemeResource: true });
    expect(diags.filter((d) => d.code === DIAG_CODES.WITH_THEME_DARK_RESOURCE)).toHaveLength(0);
  });

  it('should not warn about dark.json when WithTheme only sets theme', () => {
    const code = [
      '@Entry',
      '@Component',
      'struct ThemedPage {',
      '  @State customTheme: CustomTheme = new AppTheme();',
      '  build() {',
      '    WithTheme({ theme: this.customTheme }) {',
      '      Text("hello")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const diags = analyzeText(code, undefined, { hasDarkThemeResource: false });
    expect(diags.filter((d) => d.code === DIAG_CODES.WITH_THEME_DARK_RESOURCE)).toHaveLength(0);
  });
});

describe('extractBuildBlocks', () => {
  it('should extract a single build block', () => {
    const code = 'struct Page {\n  build() {\n    Column() {\n      Text("hello")\n    }\n  }\n}';
    const blocks = extractBuildBlocks(code);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(1);
    expect(blocks[0].content).toContain('Column');
  });

  it('should extract multiple build blocks from different structs', () => {
    const code = 'struct A {\n  build() {\n    Text("A")\n  }\n}\nstruct B {\n  build() {\n    Text("B")\n  }\n}';
    const blocks = extractBuildBlocks(code);
    expect(blocks).toHaveLength(2);
  });

  it('should handle nested braces correctly', () => {
    const code = 'build() {\n  Column() {\n    Row() {\n      if (true) {\n        Text("deep")\n      }\n    }\n  }\n}';
    const blocks = extractBuildBlocks(code);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain('deep');
  });

  it('should return empty array when no build() found', () => {
    const code = 'struct NoBuilder {\n  render() {\n    Text("x")\n  }\n}';
    expect(extractBuildBlocks(code)).toHaveLength(0);
  });
});

describe('DIAG_CODES', () => {
  it('should have unique code values', () => {
    const codes = Object.values(DIAG_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should all start with arkts-', () => {
    for (const code of Object.values(DIAG_CODES)) {
      expect(code).toMatch(/^arkts-/);
    }
  });
});

describe('edge cases', () => {
  it('should not false-positive @Observed as V1 when @ObservedV2 is used', () => {
    const code = '@ComponentV2\nstruct Page {\n  @ObservedV2 model: Model;\n}';
    const diags = analyzeText(code);
    expect(diags.filter((d) => d.code === DIAG_CODES.V1_V2_MIX)).toHaveLength(0);
  });

  it('should not false-positive @Provide as V1 when @Provider is used', () => {
    const code = '@ComponentV2\nstruct Page {\n  @Provider() theme: Theme;\n}';
    const diags = analyzeText(code);
    expect(diags.filter((d) => d.code === DIAG_CODES.V1_V2_MIX)).toHaveLength(0);
  });

  it('should not false-positive @Consume as V1 when @Consumer is used', () => {
    const code = '@ComponentV2\nstruct Child {\n  @Consumer() theme: Theme;\n}';
    const diags = analyzeText(code);
    expect(diags.filter((d) => d.code === DIAG_CODES.V1_V2_MIX)).toHaveLength(0);
  });

  it('should handle @State with Map type', () => {
    const code = '@Component\nstruct Page {\n  @State cache: Map<string, number> = new Map();\n}';
    const diags = analyzeText(code);
    expect(diags.some((d) => d.code === DIAG_CODES.STATE_SHALLOW)).toBe(true);
  });

  it('should handle @State with Record type', () => {
    const code = '@Component\nstruct Page {\n  @State dict: Record<string, any> = {};\n}';
    const diags = analyzeText(code);
    expect(diags.some((d) => d.code === DIAG_CODES.STATE_SHALLOW)).toBe(true);
  });

  it('should handle empty file', () => {
    expect(analyzeText('')).toHaveLength(0);
  });

  it('should handle file with only comments', () => {
    const code = '// This is a comment\n/* block */\n// another comment';
    expect(analyzeText(code)).toHaveLength(0);
  });

  it('should handle while loop in build()', () => {
    const code = 'build() {\n  while (true) { break; }\n}';
    const diags = analyzeText(code);
    expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('while'))).toBe(true);
  });

  it('should detect setInterval in build()', () => {
    const code = 'build() {\n  setInterval(() => {}, 1000)\n}';
    const diags = analyzeText(code);
    expect(diags.some((d) => d.code === DIAG_CODES.BUILD_HEAVY && d.message.includes('setInterval'))).toBe(true);
  });

  it('should not flag ForEach in comments', () => {
    const code = '// ForEach(items, (item) => {})';
    const diags = analyzeText(code);
    expect(diags.filter((d) => d.code === DIAG_CODES.FOREACH_PERF)).toHaveLength(0);
  });
});
