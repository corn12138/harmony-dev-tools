import { describe, it, expect } from 'vitest';
import { provideHover } from '../src/language/hoverProvider';

function mockDocument(text: string) {
  return {
    getText: (range: any) => {
      if (range) return text;
      return text;
    },
    getWordRangeAtPosition: (position: any, regex?: RegExp) => {
      const match = text.match(regex ?? /@\w+/);
      if (!match || match.index === undefined) return undefined;
      return {
        start: { line: 0, character: match.index },
        end: { line: 0, character: match.index + match[0].length },
      };
    },
    lineAt: () => ({ text }),
  } as any;
}

const mockPosition = { line: 0, character: 1 } as any;
const dummyToken = { isCancellationRequested: false } as any;

describe('hoverProvider', () => {
  describe('V1 decorators', () => {
    it('should provide hover for @Component', () => {
      const doc = mockDocument('@Component');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeDefined();
    });

    it('should provide hover for @State', () => {
      const doc = mockDocument('@State');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeDefined();
    });
  });

  describe('V2 decorators (API 12+)', () => {
    const v2Decorators = ['@ComponentV2', '@Local', '@Param', '@Once', '@Event', '@Monitor', '@Computed', '@Provider', '@Consumer', '@ObservedV2', '@Trace'];

    for (const dec of v2Decorators) {
      it(`should provide hover for ${dec}`, () => {
        const doc = mockDocument(dec);
        const hover = provideHover(doc, mockPosition, dummyToken);
        expect(hover).toBeDefined();
      });
    }
  });

  describe('API 13+ decorators', () => {
    it('should provide hover for @Require', () => {
      const doc = mockDocument('@Require');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeDefined();
    });
  });

  describe('API 14+ decorators', () => {
    it('should provide hover for @Type', () => {
      const doc = mockDocument('@Type');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeDefined();
    });
  });

  describe('common decorators', () => {
    it('should provide hover for @Builder', () => {
      const doc = mockDocument('@Builder');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeDefined();
    });

    it('should provide hover for @Sendable', () => {
      const doc = mockDocument('@Sendable');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should return undefined for unknown decorators', () => {
      const doc = mockDocument('@UnknownDecorator');
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeUndefined();
    });

    it('should return undefined for non-decorator text', () => {
      const doc = {
        getText: () => 'plain text',
        getWordRangeAtPosition: () => undefined,
      } as any;
      const hover = provideHover(doc, mockPosition, dummyToken);
      expect(hover).toBeUndefined();
    });
  });
});
