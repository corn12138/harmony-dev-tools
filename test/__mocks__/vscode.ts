/**
 * Minimal vscode module mock for unit tests.
 * Only stubs the APIs actually used by the modules under test.
 */

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class MarkdownString {
  value = '';
  appendCodeblock(code: string, lang?: string) {
    this.value += `\`\`\`${lang ?? ''}\n${code}\n\`\`\`\n`;
  }
  appendMarkdown(md: string) {
    this.value += md;
  }
}

export class CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: any;
  sortText?: string;
  constructor(label: string, kind?: CompletionItemKind) {
    this.label = label;
    this.kind = kind;
  }
}

export class SnippetString {
  value: string;
  constructor(value: string) {
    this.value = value;
  }
}

export class Range {
  start: any;
  end: any;
  constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
    this.start = { line: startLine, character: startChar };
    this.end = { line: endLine, character: endChar };
  }
}

export class Position {
  line: number;
  character: number;
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

export class Hover {
  contents: any;
  range: any;
  constructor(contents: any, range?: any) {
    this.contents = contents;
    this.range = range;
  }
}

export class Uri {
  fsPath: string;
  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }
  static file(path: string) {
    return new Uri(path);
  }
  static joinPath(base: Uri, ...pathSegments: string[]) {
    return new Uri(base.fsPath + '/' + pathSegments.join('/'));
  }
}

export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration: (_section?: string) => ({
    get: (_key: string, defaultValue?: any) => defaultValue,
  }),
  findFiles: async () => [],
  fs: {
    readFile: async (_uri: any) => Buffer.from(''),
  },
  asRelativePath: (uri: any) => (typeof uri === 'string' ? uri : uri.fsPath),
};

export const window = {
  showInformationMessage: async (..._args: any[]) => undefined,
  showWarningMessage: async (..._args: any[]) => undefined,
  showErrorMessage: async (..._args: any[]) => undefined,
  createOutputChannel: (_name: string) => ({
    clear: () => {},
    appendLine: (_line: string) => {},
    show: () => {},
  }),
};

export const languages = {
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  registerHoverProvider: () => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
};
