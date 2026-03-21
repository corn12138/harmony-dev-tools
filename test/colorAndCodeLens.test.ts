import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const actual = await vi.importActual<any>('vscode');
  return {
    ...actual,
    Color: class Color {
      constructor(
        public red: number,
        public green: number,
        public blue: number,
        public alpha: number
      ) {}
    },
    ColorInformation: class ColorInformation {
      constructor(public range: any, public color: any) {}
    },
    ColorPresentation: class ColorPresentation {
      constructor(public label: string) {}
    },
  };
});

import * as vscode from 'vscode';
import { provideDocumentColors, provideColorPresentations } from '../src/language/colorProvider';
import { provideCodeLenses } from '../src/language/codeLensProvider';

const cancelNone = { isCancellationRequested: false };

function createDoc(text: string, uriPath = '/mock/Doc.ets') {
  return {
    uri: vscode.Uri.file(uriPath),
    getText: () => text,
    positionAt: (offset: number) => {
      let line = 0;
      let col = 0;
      for (let i = 0; i < offset; i++) {
        if (text[i] === '\n') {
          line++;
          col = 0;
        } else {
          col++;
        }
      }
      return new vscode.Position(line, col);
    },
  };
}

describe('colorProvider — provideDocumentColors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect 6-digit hex color \'#FF0000\'', () => {
    const doc = createDoc("const c = '#FF0000';");
    const infos = provideDocumentColors(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    expect(infos).toHaveLength(1);
    expect(infos[0].color.red).toBeCloseTo(1);
    expect(infos[0].color.green).toBeCloseTo(0);
    expect(infos[0].color.blue).toBeCloseTo(0);
    expect(infos[0].color.alpha).toBe(1);
    expect(infos[0].range.start.line).toBe(0);
    expect(infos[0].range.start.character).toBe(10);
    expect(infos[0].range.end.character).toBe(19);
  });

  it('should detect 8-digit hex color \'#80FF0000\' (with alpha)', () => {
    const doc = createDoc("fill: '#80FF0000'");
    const infos = provideDocumentColors(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    expect(infos).toHaveLength(1);
    expect(infos[0].color.alpha).toBeCloseTo(128 / 255);
    expect(infos[0].color.red).toBeCloseTo(1);
    expect(infos[0].color.green).toBeCloseTo(0);
    expect(infos[0].color.blue).toBeCloseTo(0);
  });

  it('should NOT match 7-digit hex (invalid length)', () => {
    const doc = createDoc("x = '#FF00000'");
    const infos = provideDocumentColors(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    expect(infos).toHaveLength(0);
  });

  it('should detect named colors like Color.Red, Color.Blue', () => {
    const doc = createDoc('bg = Color.Red\nfg = Color.Blue');
    const infos = provideDocumentColors(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const rangesText = infos.map((info) => {
      const start = offsetAt(doc as any, info.range.start);
      const end = offsetAt(doc as any, info.range.end);
      return doc.getText().slice(start, end);
    });
    expect(rangesText).toContain('Color.Red');
    expect(rangesText).toContain('Color.Blue');
    const red = infos.find((_, idx) => rangesText[idx] === 'Color.Red');
    const blue = infos.find((_, idx) => rangesText[idx] === 'Color.Blue');
    expect(red?.color.red).toBeCloseTo(1);
    expect(blue?.color.blue).toBeCloseTo(1);
  });

  it('should NOT match Color.Grey in Color.Greyish (word boundary)', () => {
    const doc = createDoc('let x = Color.Greyish');
    const infos = provideDocumentColors(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const labels = infos.map((info) => {
      const start = offsetAt(doc as any, info.range.start);
      const end = offsetAt(doc as any, info.range.end);
      return doc.getText().slice(start, end);
    });
    expect(labels.some((s) => s === 'Color.Grey')).toBe(false);
  });

  it('should handle file with no colors', () => {
    const doc = createDoc('struct Empty {}\n// no literals here');
    expect(provideDocumentColors(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken)).toEqual([]);
  });
});

function offsetAt(
  doc: { getText: () => string },
  pos: { line: number; character: number }
): number {
  const text = doc.getText();
  let offset = 0;
  let line = 0;
  while (line < pos.line && offset < text.length) {
    if (text[offset] === '\n') {
      line++;
    }
    offset++;
  }
  return offset + pos.character;
}

describe('colorProvider — provideColorPresentations', () => {
  it('returns 6-digit hex when fully opaque', () => {
    const color = new vscode.Color(1, 0, 0, 1);
    const pres = provideColorPresentations(
      color,
      { document: createDoc('') as vscode.TextDocument, range: new vscode.Range(0, 0, 0, 0) },
      cancelNone as vscode.CancellationToken
    );
    expect(pres).toHaveLength(1);
    expect(pres[0].label).toBe("'#FF0000'");
  });

  it('returns 8-digit hex when alpha < 1', () => {
    const color = new vscode.Color(1, 0, 0, 128 / 255);
    const pres = provideColorPresentations(
      color,
      { document: createDoc('') as vscode.TextDocument, range: new vscode.Range(0, 0, 0, 0) },
      cancelNone as vscode.CancellationToken
    );
    expect(pres[0].label).toBe("'#80FF0000'");
  });
});

describe('codeLensProvider — provideCodeLenses', () => {
  it('should create lens for @Component + struct', () => {
    const doc = createDoc('@Component\nstruct MyPage { }');
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].command?.command).toBe('editor.action.findReferences');
    const pos = lenses[0].command?.arguments?.[1] as vscode.Position;
    expect(pos.line).toBe(1);
    expect(pos.character).toBe('struct MyPage { }'.indexOf('MyPage'));
  });

  it('should create lens for @Component(...) with parameters', () => {
    const doc = createDoc('@Component({ storage: LocalStorage })\nstruct RoutedPage { }');
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    expect(lenses.length).toBeGreaterThanOrEqual(1);
    const refLens = lenses.find((l) => l.command?.command === 'editor.action.findReferences');
    expect(refLens).toBeDefined();
    const pos = refLens!.command?.arguments?.[1] as vscode.Position;
    expect(pos.line).toBe(1);
    expect(pos.character).toBe('struct RoutedPage { }'.indexOf('RoutedPage'));
  });

  it('should create lens for @Entry', () => {
    const doc = createDoc('@Entry\n@Component\nstruct A {}');
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const entry = lenses.find((l) => l.command?.title === '$(globe) Entry Page');
    expect(entry).toBeDefined();
    expect(entry!.range.start.line).toBe(0);
  });

  it('should create lens for @Entry(...) with parameters', () => {
    const doc = createDoc('@Entry({ route: "home" })\n@Component\nstruct Home {}');
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const entry = lenses.find((l) => l.range.start.line === 0 && l.command?.title === '$(globe) Entry Page');
    expect(entry).toBeDefined();
  });

  it('should create lens for @Builder function', () => {
    const doc = createDoc('@Builder rowItem() {\n  Text("hi")\n}');
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const b = lenses.find((l) => String(l.command?.title).includes('usage'));
    expect(b).toBeDefined();
    expect(b!.command?.command).toBe('editor.action.findReferences');
  });

  it('should calculate correct column numbers using raw lines (not trimmed)', () => {
    const next = '    struct   MyStruct { }';
    const doc = createDoc(`@Component\n${next}`);
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const pos = lenses[0].command?.arguments?.[1] as vscode.Position;
    expect(pos.line).toBe(1);
    expect(pos.character).toBe(next.indexOf('MyStruct'));
  });

  it('should handle file with no decorators', () => {
    expect(provideCodeLenses(createDoc('let x = 1') as vscode.TextDocument, cancelNone as vscode.CancellationToken)).toEqual([]);
  });

  it('should handle @Builder with $ in name (escapeRegExp)', () => {
    const doc = createDoc('@Builder foo$bar() {\n}\n\nfoo$bar()');
    const lenses = provideCodeLenses(doc as vscode.TextDocument, cancelNone as vscode.CancellationToken);
    const b = lenses.find((l) => String(l.command?.title).includes('usage'));
    expect(b).toBeDefined();
    const pos = b!.command?.arguments?.[1] as vscode.Position;
    expect(pos.character).toBe(doc.getText().split('\n')[0].indexOf('foo$bar'));
  });
});
