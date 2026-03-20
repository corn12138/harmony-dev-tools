import { beforeEach, describe, expect, it, vi } from 'vitest';

function createArktsDocument(text: string, filePath = '/workspace/demo/entry/src/main/ets/pages/Index.ets') {
  const lines = text.split('\n');

  const positionAt = (offset: number) => {
    let consumed = 0;
    for (let line = 0; line < lines.length; line += 1) {
      const lineLength = lines[line].length;
      const nextConsumed = consumed + lineLength;
      if (offset <= nextConsumed) {
        return { line, character: offset - consumed };
      }
      consumed = nextConsumed + 1;
    }

    return {
      line: Math.max(lines.length - 1, 0),
      character: lines.at(-1)?.length ?? 0,
    };
  };

  return {
    uri: { fsPath: filePath, toString: () => filePath },
    languageId: 'arkts',
    lineAt(position: { line: number }) {
      return { text: lines[position.line] ?? '' };
    },
    getText(range?: { start: { line: number; character: number }; end: { line: number; character: number } }) {
      if (!range) {
        return text;
      }

      const startOffset = lines
        .slice(0, range.start.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + range.start.character;
      const endOffset = lines
        .slice(0, range.end.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + range.end.character;
      return text.slice(startOffset, endOffset);
    },
    getWordRangeAtPosition(position: { line: number; character: number }, pattern: RegExp) {
      const lineStart = lines
        .slice(0, position.line)
        .reduce((sum, line) => sum + line.length + 1, 0);
      const absoluteOffset = lineStart + position.character;
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;

      for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
        const start = match.index ?? 0;
        const fullText = match[0] ?? '';
        const end = start + fullText.length;
        if (absoluteOffset < start || absoluteOffset > end) {
          continue;
        }

        return {
          start: positionAt(start),
          end: positionAt(end),
        };
      }

      return undefined;
    },
    positionAt,
  };
}

describe('resource providers', () => {
  beforeEach(async () => {
    vi.resetModules();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    vscode.workspace.workspaceFolders = [
      {
        name: 'demo',
        uri: vscode.Uri.file('/workspace/demo'),
        index: 0,
      },
    ] as any;
    vscode.workspace.textDocuments = [];
  });

  it('dedupes concurrent resource initialization requests', async () => {
    const vscode = await import('vscode');
    const calls: string[] = [];

    vscode.workspace.findFiles = vi.fn(async (pattern: any) => {
      calls.push(typeof pattern === 'string' ? pattern : pattern.pattern);
      return [];
    }) as any;

    const { ResourceIndexer } = await import('../src/resource/resourceIndexer');
    const indexer = new ResourceIndexer();

    await Promise.all([
      indexer.ensureInitialized(),
      indexer.ensureInitialized(),
      indexer.ensureInitialized(),
    ]);

    expect(calls).toEqual([
      '**/resources/base/element/*.json',
      '**/resources/base/media/*',
      '**/resources/base/profile/*.json',
    ]);

    indexer.dispose();
  });

  it('provides resource completions with documentation from indexed resources', async () => {
    const vscode = await import('vscode');

    vscode.workspace.findFiles = vi.fn(async (pattern: any) => {
      const value = typeof pattern === 'string' ? pattern : pattern.pattern;
      if (value === '**/resources/base/element/*.json') {
        return [vscode.Uri.file('/workspace/demo/entry/src/main/resources/base/element/string.json')];
      }

      return [];
    }) as any;

    vscode.workspace.fs.readFile = vi.fn(async () => Buffer.from(JSON.stringify({
      string: [{ name: 'title', value: 'Hello Harmony' }],
    }))) as any;

    const { ResourceCompletionProvider } = await import('../src/resource/resourceCompletion');
    const provider = new ResourceCompletionProvider();
    const document = createArktsDocument("Text($r('app.str");

    const items = await provider.provideCompletionItems(document as any, new vscode.Position(0, 16));

    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('app.string.title');
    expect(items[0].documentation?.value).toContain('Hello Harmony');
  });

  it('resolves resource definitions to the indexed file', async () => {
    const vscode = await import('vscode');
    const resourceFile = vscode.Uri.file('/workspace/demo/entry/src/main/resources/base/element/string.json');

    vscode.workspace.findFiles = vi.fn(async (pattern: any) => {
      const value = typeof pattern === 'string' ? pattern : pattern.pattern;
      if (value === '**/resources/base/element/*.json') {
        return [resourceFile];
      }

      return [];
    }) as any;

    vscode.workspace.fs.readFile = vi.fn(async () => Buffer.from(JSON.stringify({
      string: [{ name: 'title', value: 'Hello Harmony' }],
    }))) as any;

    const { ResourceDefinitionProvider } = await import('../src/resource/resourceDefinition');
    const provider = new ResourceDefinitionProvider();
    const source = "Text($r('app.string.title'));";
    const document = createArktsDocument(source);
    const position = new vscode.Position(0, source.indexOf('app.string.title') + 3);

    const definition = await provider.provideDefinition(document as any, position);

    expect(definition).toBeDefined();
    expect((definition as any).uri.fsPath).toBe(resourceFile.fsPath);
  });

  it('reports only missing app resources and ignores sys resources', async () => {
    const vscode = await import('vscode');
    const diagnosticSets: any[] = [];

    vscode.workspace.findFiles = vi.fn(async () => []) as any;
    vscode.languages.createDiagnosticCollection = vi.fn(() => ({
      set: vi.fn((uri: any, diagnostics: any[]) => {
        diagnosticSets.push({ uri, diagnostics });
      }),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    })) as any;

    const { ResourceDiagnosticProvider } = await import('../src/resource/resourceDefinition');
    const provider = new ResourceDiagnosticProvider();
    const document = createArktsDocument(`
      Text($r('app.string.missing'))
      Text($r('sys.color.ohos_id_color_foreground'))
    `);

    await provider.validate(document as any);

    expect(diagnosticSets).toHaveLength(1);
    expect(diagnosticSets[0].diagnostics).toHaveLength(1);
    expect(diagnosticSets[0].diagnostics[0].message).toContain('app.string.missing');

    provider.dispose();
  });
});
