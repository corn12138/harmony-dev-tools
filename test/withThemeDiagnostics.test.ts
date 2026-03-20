import { describe, expect, it } from 'vitest';
import { findWithThemeColorModeUsages } from '../src/language/withThemeDiagnostics';

describe('withThemeDiagnostics', () => {
  it('should collect multiple WithTheme colorMode usages without hanging', () => {
    const code = [
      '@Component',
      'struct ThemedPage {',
      '  build() {',
      '    Column() {',
      '      WithTheme({ colorMode: ThemeColorMode.DARK }) {',
      '        Text("dark")',
      '      }',
      '      WithTheme({ colorMode: ThemeColorMode.SYSTEM, theme: this.theme }) {',
      '        Text("system")',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');

    const usages = findWithThemeColorModeUsages(code);
    expect(usages).toHaveLength(2);
    expect(usages[0].line).toBe(4);
    expect(usages[1].line).toBe(7);
  });

  it('should ignore WithTheme usages without colorMode', () => {
    const code = [
      '@Component',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ theme: this.customTheme }) {',
      '      Text("custom")',
      '    }',
      '  }',
      '}',
    ].join('\n');

    expect(findWithThemeColorModeUsages(code)).toHaveLength(0);
  });

  it('should ignore light-only colorMode overrides', () => {
    const code = [
      '@Component',
      'struct ThemedPage {',
      '  build() {',
      '    WithTheme({ colorMode: ThemeColorMode.LIGHT }) {',
      '      Text("light")',
      '    }',
      '  }',
      '}',
    ].join('\n');

    expect(findWithThemeColorModeUsages(code)).toHaveLength(0);
  });
});
