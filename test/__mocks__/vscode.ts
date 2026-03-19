/**
 * Rich vscode module mock for unit and smoke tests.
 * It covers the extension activation surface: command registration,
 * tree views, status bar items, debug/task providers, and basic editor types.
 */

type DisposableLike = { dispose(): void };

const registeredCommands = new Map<string, (...args: any[]) => any>();
const executedCommands: Array<{ command: string; args: any[] }> = [];
const createdTreeViews: Array<{ id: string; options: any }> = [];
const debugSessions: Array<{ folder: any; config: any }> = [];
const statusBarItems: MockStatusBarItem[] = [];
let nextQuickPickResult: any = undefined;

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

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export const ProgressLocation = {
  Notification: 1,
};

export const TaskGroup = {
  Build: { id: 'build' },
  Clean: { id: 'clean' },
  Test: { id: 'test' },
};

export const TaskScope = {
  Workspace: 'workspace',
};

export const CodeActionKind = {
  QuickFix: 'quickfix',
};

export class Disposable {
  constructor(private readonly onDispose: () => void = () => {}) {}

  dispose(): void {
    this.onDispose();
  }

  static from(...items: Array<DisposableLike | undefined>): Disposable {
    return new Disposable(() => {
      for (const item of items) {
        item?.dispose();
      }
    });
  }
}

export class EventEmitter<T> {
  private listeners = new Set<(value: T) => void>();

  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };

  fire(value: T): void {
    for (const listener of Array.from(this.listeners)) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class MarkdownString {
  value = '';

  appendCodeblock(code: string, lang?: string): void {
    this.value += `\`\`\`${lang ?? ''}\n${code}\n\`\`\`\n`;
  }

  appendMarkdown(md: string): void {
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
  constructor(public readonly value: string) {}
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  start: Position;
  end: Position;

  constructor(startLineOrPosition: number | Position, startCharOrPosition: number | Position, endLine?: number, endChar?: number) {
    if (startLineOrPosition instanceof Position && startCharOrPosition instanceof Position) {
      this.start = startLineOrPosition;
      this.end = startCharOrPosition;
      return;
    }

    this.start = new Position(startLineOrPosition as number, startCharOrPosition as number);
    this.end = new Position(endLine ?? startLineOrPosition as number, endChar ?? startCharOrPosition as number);
  }
}

export class Selection extends Range {}

export class Hover {
  constructor(public readonly contents: any, public readonly range?: any) {}
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class Uri {
  constructor(public readonly fsPath: string) {}

  static file(path: string): Uri {
    return new Uri(path);
  }

  static parse(path: string): Uri {
    return new Uri(path.replace(/^file:\/\//, ''));
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return new Uri([base.fsPath, ...pathSegments].join('/').replace(/\/+/g, '/'));
  }

  toString(): string {
    return this.fsPath;
  }
}

export class TreeItem {
  resourceUri?: Uri;
  description?: string;
  iconPath?: any;
  contextValue?: string;
  tooltip?: string;
  command?: any;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {}
}

export class ShellExecution {
  constructor(public readonly commandLine: string, public readonly options?: any) {}
}

export class Task {
  group?: any;

  constructor(
    public readonly definition: any,
    public readonly scope: any,
    public readonly name: string,
    public readonly source: string,
    public readonly execution: any,
    public readonly problemMatchers?: any,
  ) {}
}

export class CodeLens {
  constructor(public readonly range: Range, public readonly command?: any) {}
}

export class Diagnostic {
  code?: string | number;
  source?: string;

  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: DiagnosticSeverity,
  ) {}
}

export class WorkspaceEdit {
  readonly edits: Array<{ type: 'insert' | 'replace' | 'delete'; uri: Uri; payload: any }> = [];

  insert(uri: Uri, position: Position, text: string): void {
    this.edits.push({ type: 'insert', uri, payload: { position, text } });
  }

  replace(uri: Uri, range: Range, text: string): void {
    this.edits.push({ type: 'replace', uri, payload: { range, text } });
  }

  delete(uri: Uri, range: Range): void {
    this.edits.push({ type: 'delete', uri, payload: { range } });
  }
}

export class CodeAction {
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: any;
  isPreferred?: boolean;

  constructor(public readonly title: string, public readonly kind?: string) {}
}

export class RelativePattern {
  constructor(public readonly base: Uri, public readonly pattern: string) {}
}

export class DebugAdapterInlineImplementation {
  constructor(public readonly implementation: any) {}
}

class MockDiagnosticCollection {
  private readonly items = new Map<string, Diagnostic[]>();

  set(uri: Uri, diagnostics: Diagnostic[]): void {
    this.items.set(uri.toString(), diagnostics);
  }

  delete(uri: Uri): void {
    this.items.delete(uri.toString());
  }

  clear(): void {
    this.items.clear();
  }

  dispose(): void {
    this.items.clear();
  }
}

class MockOutputChannel {
  readonly lines: string[] = [];

  clear(): void {
    this.lines.length = 0;
  }

  append(value: string): void {
    this.lines.push(value);
  }

  appendLine(value: string): void {
    this.lines.push(value);
  }

  show(): void {}

  dispose(): void {
    this.lines.length = 0;
  }
}

class MockStatusBarItem {
  text = '';
  tooltip?: string;
  command?: string;
  visible = false;

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  dispose(): void {
    this.visible = false;
  }
}

function noopDisposable(): Disposable {
  return new Disposable();
}

function createEventRegistration(): Disposable {
  return noopDisposable();
}

export const workspace = {
  workspaceFolders: [] as any[],
  getConfiguration: (_section?: string) => ({
    get: (_key: string, defaultValue?: any) => defaultValue,
  }),
  findFiles: async () => [],
  getWorkspaceFolder: (uri: Uri) =>
    workspace.workspaceFolders.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath)),
  onDidOpenTextDocument: () => createEventRegistration(),
  onDidSaveTextDocument: () => createEventRegistration(),
  onDidChangeTextDocument: () => createEventRegistration(),
  onDidChangeWorkspaceFolders: () => createEventRegistration(),
  onDidChangeConfiguration: () => createEventRegistration(),
  fs: {
    stat: async (_uri: Uri) => ({ type: FileType.File }),
    readFile: async (_uri: Uri) => Buffer.from(''),
    readDirectory: async (_uri: Uri) => [],
  },
  asRelativePath: (uri: Uri | string) => (typeof uri === 'string' ? uri : uri.fsPath),
};

export const window = {
  activeTextEditor: undefined as any,
  showInformationMessage: async (..._args: any[]) => undefined,
  showWarningMessage: async (..._args: any[]) => undefined,
  showErrorMessage: async (..._args: any[]) => undefined,
  showQuickPick: async (items: any) => {
    const resolvedItems = await Promise.resolve(items);
    if (nextQuickPickResult !== undefined) {
      const result = nextQuickPickResult;
      nextQuickPickResult = undefined;
      return result;
    }

    return Array.isArray(resolvedItems) ? resolvedItems[0] : undefined;
  },
  createOutputChannel: (_name: string) => new MockOutputChannel(),
  createTreeView: (id: string, options: any) => {
    const treeView = {
      id,
      options,
      dispose: () => {},
    };
    createdTreeViews.push({ id, options });
    return treeView;
  },
  createStatusBarItem: (_alignment?: StatusBarAlignment, _priority?: number) => {
    const item = new MockStatusBarItem();
    statusBarItems.push(item);
    return item;
  },
  withProgress: async (_options: any, task: (progress: any, token: any) => any) =>
    task(
      { report: (_value: any) => {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => noopDisposable(),
      },
    ),
};

export const languages = {
  registerCompletionItemProvider: () => noopDisposable(),
  registerHoverProvider: () => noopDisposable(),
  registerCodeLensProvider: () => noopDisposable(),
  registerColorProvider: () => noopDisposable(),
  registerDefinitionProvider: () => noopDisposable(),
  registerCodeActionsProvider: () => noopDisposable(),
  createDiagnosticCollection: () => new MockDiagnosticCollection(),
};

export const commands = {
  registerCommand: (command: string, handler: (...args: any[]) => any) => {
    registeredCommands.set(command, handler);
    return new Disposable(() => registeredCommands.delete(command));
  },
  executeCommand: async (command: string, ...args: any[]) => {
    executedCommands.push({ command, args });
    return registeredCommands.get(command)?.(...args);
  },
};

export const debug = {
  registerDebugConfigurationProvider: () => noopDisposable(),
  registerDebugAdapterDescriptorFactory: () => noopDisposable(),
  startDebugging: async (folder: any, config: any) => {
    debugSessions.push({ folder, config });
    return true;
  },
};

export const tasks = {
  registerTaskProvider: () => noopDisposable(),
};

export const env = {
  clipboard: {
    writeText: async (_value: string) => {},
  },
  openExternal: async (_uri: Uri) => true,
};

export function __getRegisteredCommands(): string[] {
  return Array.from(registeredCommands.keys());
}

export function __getExecutedCommands(): Array<{ command: string; args: any[] }> {
  return executedCommands.slice();
}

export function __getCreatedTreeViews(): Array<{ id: string; options: any }> {
  return createdTreeViews.slice();
}

export function __getDebugSessions(): Array<{ folder: any; config: any }> {
  return debugSessions.slice();
}

export function __getStatusBarItems(): MockStatusBarItem[] {
  return statusBarItems.slice();
}

export function __setQuickPickResult(value: any): void {
  nextQuickPickResult = value;
}

export function __reset(): void {
  registeredCommands.clear();
  executedCommands.length = 0;
  createdTreeViews.length = 0;
  debugSessions.length = 0;
  statusBarItems.length = 0;
  nextQuickPickResult = undefined;
  workspace.workspaceFolders = [];
  window.activeTextEditor = undefined;
}
