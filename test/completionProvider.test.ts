import { describe, it, expect, vi } from 'vitest';
import { provideCompletionItems } from '../src/language/completionProvider';

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

describe('completionProvider', () => {
  describe('decorator completions', () => {
    it('should provide V1 decorator completions after @', () => {
      const items = provideCompletionItems(
        mockDocument('@'),
        mockPosition(0, 1),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('Component');
      expect(labels).toContain('State');
      expect(labels).toContain('Entry');
    });

    it('should provide V2 decorator completions after @', () => {
      const items = provideCompletionItems(
        mockDocument('@'),
        mockPosition(0, 1),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('ComponentV2');
      expect(labels).toContain('Local');
      expect(labels).toContain('Param');
      expect(labels).toContain('Monitor');
      expect(labels).toContain('Computed');
    });

    it('should provide API 13+ decorator @Require after @', () => {
      const items = provideCompletionItems(
        mockDocument('@'),
        mockPosition(0, 1),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('Require');
    });

    it('should provide API 14+ decorator @Type after @', () => {
      const items = provideCompletionItems(
        mockDocument('@'),
        mockPosition(0, 1),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('Type');
    });

    it('should provide API 18+ decorator @ReusableV2 after @', () => {
      const items = provideCompletionItems(
        mockDocument('@'),
        mockPosition(0, 1),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('ReusableV2');
    });

    it('should provide @Sendable after @', () => {
      const items = provideCompletionItems(
        mockDocument('@'),
        mockPosition(0, 1),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('Sendable');
    });
  });

  describe('component completions', () => {
    it('should provide ArkUI component completions', () => {
      const items = provideCompletionItems(
        mockDocument('  Co'),
        mockPosition(0, 4),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('Column');
      expect(labels).toContain('Row');
      expect(labels).toContain('Text');
      expect(labels).toContain('Button');
    });

    it('should include API 12+ components', () => {
      const items = provideCompletionItems(
        mockDocument('  Ca'),
        mockPosition(0, 4),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('CalendarPicker');
      expect(labels).toContain('NodeContainer');
      expect(labels).toContain('SymbolGlyph');
      expect(labels).toContain('WithTheme');
    });

    it('should include API 13+ components', () => {
      const items = provideCompletionItems(
        mockDocument('  Is'),
        mockPosition(0, 4),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('IsolatedComponent');
      expect(labels).toContain('Chip');
      expect(labels).toContain('SegmentButton');
    });

    it('should include API 14+ components', () => {
      const items = provideCompletionItems(
        mockDocument('  Ef'),
        mockPosition(0, 4),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('EffectComponent');
    });
  });

  describe('lifecycle completions', () => {
    it('should provide standard lifecycle methods', () => {
      const items = provideCompletionItems(
        mockDocument('  about'),
        mockPosition(0, 7),
        dummyToken,
        dummyContext,
      );
      const labels = items.map(i => i.label);
      expect(labels).toContain('aboutToAppear');
      expect(labels).toContain('aboutToDisappear');
      expect(labels).toContain('onPageShow');
    });

    it('should provide reuse lifecycle methods', () => {
      const items = provideCompletionItems(
        mockDocument('  about'),
        mockPosition(0, 7),
        dummyToken,
        dummyContext,
      );
      const byLabel = new Map(items.map(i => [String(i.label), i]));
      expect(byLabel.has('aboutToReuse')).toBe(true);
      expect(byLabel.has('aboutToRecycle')).toBe(true);
      expect(String(byLabel.get('aboutToReuse')?.documentation)).toContain('@ReusableV2');
    });

    it('should provide onWillApplyTheme (API 12+)', () => {
      const items = provideCompletionItems(
        mockDocument('  on'),
        mockPosition(0, 4),
        dummyToken,
        dummyContext,
      );
      const byLabel = new Map(items.map(i => [String(i.label), i]));
      expect(byLabel.has('onWillApplyTheme')).toBe(true);
      expect(String(byLabel.get('onWillApplyTheme')?.documentation)).toContain('API 16');
      expect(String(byLabel.get('onWillApplyTheme')?.documentation)).toContain('ThemeControl.setDefaultTheme');
    });
  });
});
