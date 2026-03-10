import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const snippetsPath = join(__dirname, '..', 'snippets', 'arkts.snippets.json');
const snippets = JSON.parse(readFileSync(snippetsPath, 'utf8'));

describe('arkts.snippets.json', () => {
  it('should be valid JSON', () => {
    expect(snippets).toBeTruthy();
    expect(typeof snippets).toBe('object');
  });

  it('should have at least 50 snippets', () => {
    const count = Object.keys(snippets).length;
    expect(count).toBeGreaterThanOrEqual(50);
  });

  describe('each snippet structure', () => {
    for (const [name, snippet] of Object.entries(snippets) as [string, any][]) {
      it(`"${name}" should have prefix and body`, () => {
        expect(snippet.prefix).toBeTruthy();
        expect(snippet.body).toBeTruthy();
        expect(snippet.description).toBeTruthy();
      });

      it(`"${name}" body should be string or array`, () => {
        const bodyIsValid = typeof snippet.body === 'string' || Array.isArray(snippet.body);
        expect(bodyIsValid).toBe(true);
      });
    }
  });

  describe('V1 snippets', () => {
    const requiredPrefixes = ['entry', 'comp', 'col', 'row', 'txt', 'btn', 'img', 'input', 'list', 'state', 'prop', 'link'];
    for (const prefix of requiredPrefixes) {
      it(`should have snippet with prefix "${prefix}"`, () => {
        const found = Object.values(snippets).some((s: any) => s.prefix === prefix);
        expect(found).toBe(true);
      });
    }
  });

  describe('V2 snippets (API 12+)', () => {
    const v2Prefixes = ['entryv2', 'compv2', 'local', 'param', 'event', 'monitor', 'computed', 'observedv2', 'providerv2', 'appstoragev2'];
    for (const prefix of v2Prefixes) {
      it(`should have V2 snippet with prefix "${prefix}"`, () => {
        const found = Object.values(snippets).some((s: any) => s.prefix === prefix);
        expect(found).toBe(true);
      });
    }
  });

  describe('API 13+ snippets', () => {
    it('should have @Require snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'require');
      expect(found).toBe(true);
    });

    it('should have Chip snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'chip');
      expect(found).toBe(true);
    });

    it('should have SegmentButton snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'segment');
      expect(found).toBe(true);
    });
  });

  describe('API 14+ snippets', () => {
    it('should have @Type snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'type');
      expect(found).toBe(true);
    });

    it('should have makeObserved snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'makeobs');
      expect(found).toBe(true);
    });

    it('should have drag events snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'drag');
      expect(found).toBe(true);
    });
  });

  describe('modern pattern snippets', () => {
    it('should have @Sendable snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'sendable');
      expect(found).toBe(true);
    });

    it('should have NavPathStack snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'navstack');
      expect(found).toBe(true);
    });

    it('should have PersistenceV2 snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'persistv2');
      expect(found).toBe(true);
    });

    it('should have UIContext animateTo snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'uianimate');
      expect(found).toBe(true);
    });

    it('should have Repeat snippet', () => {
      const found = Object.values(snippets).some((s: any) => s.prefix === 'repeat');
      expect(found).toBe(true);
    });
  });
});
