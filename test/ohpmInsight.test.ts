import { describe, it, expect } from 'vitest';
import { analyzeDependencies, DepIssue, compareVersions, KNOWN_PACKAGES, parseBaseVersion } from '../src/project/ohpmInsight';

describe('ohpmInsight — compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('should return -1 when a < b', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
  });

  it('should return 1 when a > b', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  it('should handle different length versions', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
  });

  it('should strip leading non-numeric chars', () => {
    expect(compareVersions('^1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('~1.0.0', '1.0.1')).toBe(-1);
  });
});

describe('ohpmInsight — parseBaseVersion', () => {
  it('should strip caret', () => {
    expect(parseBaseVersion('^1.2.3')).toBe('1.2.3');
  });

  it('should strip tilde', () => {
    expect(parseBaseVersion('~2.0.0')).toBe('2.0.0');
  });

  it('should strip >=', () => {
    expect(parseBaseVersion('>=1.0.0')).toBe('1.0.0');
  });

  it('should return plain version unchanged', () => {
    expect(parseBaseVersion('3.0.1')).toBe('3.0.1');
  });
});

describe('ohpmInsight — analyzeDependencies', () => {
  const mockPackages: Record<string, { latest: string; description: string }> = {
    '@ohos/axios': { latest: '2.2.6', description: 'HTTP client' },
    '@ohos/lottie': { latest: '2.0.14', description: 'Lottie animations' },
  };

  it('should detect outdated dependency', () => {
    const text = [
      '{',
      '  "dependencies": {',
      '    "@ohos/axios": "^2.0.0"',
      '  }',
      '}',
    ].join('\n');
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(1);
    expect(issues[0].packageName).toBe('@ohos/axios');
    expect(issues[0].severity).toBe('outdated');
    expect(issues[0].latestVersion).toBe('2.2.6');
  });

  it('should NOT flag up-to-date dependency', () => {
    const text = [
      '{',
      '  "dependencies": {',
      '    "@ohos/axios": "^2.2.6"',
      '  }',
      '}',
    ].join('\n');
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(0);
  });

  it('should handle devDependencies section', () => {
    const text = [
      '{',
      '  "devDependencies": {',
      '    "@ohos/lottie": "1.0.0"',
      '  }',
      '}',
    ].join('\n');
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(1);
    expect(issues[0].packageName).toBe('@ohos/lottie');
  });

  it('should ignore unknown packages', () => {
    const text = [
      '{',
      '  "dependencies": {',
      '    "@my/custom-lib": "1.0.0"',
      '  }',
      '}',
    ].join('\n');
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(0);
  });

  it('should handle multiple dependencies with mixed status', () => {
    const text = [
      '{',
      '  "dependencies": {',
      '    "@ohos/axios": "^1.0.0",',
      '    "@ohos/lottie": "^2.0.14"',
      '  }',
      '}',
    ].join('\n');
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(1);
    expect(issues[0].packageName).toBe('@ohos/axios');
  });

  it('should return correct line numbers', () => {
    const text = [
      '{',           // line 0
      '  "dependencies": {',  // line 1
      '    "@ohos/axios": "^1.0.0"',  // line 2
      '  }',         // line 3
      '}',           // line 4
    ].join('\n');
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues[0].line).toBe(2);
  });

  it('should handle empty dependencies', () => {
    const text = '{\n  "dependencies": {\n  }\n}';
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(0);
  });

  it('should handle file with no dependency sections', () => {
    const text = '{\n  "name": "myapp",\n  "version": "1.0.0"\n}';
    const issues = analyzeDependencies(text, mockPackages);
    expect(issues).toHaveLength(0);
  });
});

describe('ohpmInsight — KNOWN_PACKAGES', () => {
  it('should contain popular packages', () => {
    expect(KNOWN_PACKAGES['@ohos/hypium']).toBeDefined();
    expect(KNOWN_PACKAGES['@ohos/axios']).toBeDefined();
    expect(KNOWN_PACKAGES['@ohos/lottie']).toBeDefined();
  });

  it('should have valid version strings', () => {
    for (const [name, info] of Object.entries(KNOWN_PACKAGES)) {
      expect(info.latest).toMatch(/^\d+\.\d+\.\d+$/);
      expect(info.description.length).toBeGreaterThan(0);
    }
  });
});
