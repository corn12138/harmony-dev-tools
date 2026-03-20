import * as vscode from 'vscode';
import { HarmonyEventBus } from '../core/eventBus';
import { CONFIG_FILES, ETS_EXTENSION } from '../utils/constants';

export const TRACKED_FILE_KINDS = [
  'arkts',
  'buildProfile',
  'ohPackage',
  'moduleJson',
  'appJson',
  'hvigorConfig',
  'hvigorScript',
  'resource',
] as const;

export type HarmonyTrackedFileKind = typeof TRACKED_FILE_KINDS[number];
export type HarmonyFileChangeType = 'created' | 'changed' | 'deleted';

export interface HarmonyTrackedFile {
  path: string;
  kind: HarmonyTrackedFileKind;
  module?: string;
}

export interface HarmonyProjectFileIndex {
  rootPath: string;
  modules: string[];
  files: HarmonyTrackedFile[];
  counts: Record<HarmonyTrackedFileKind, number>;
}

const TRACKED_PATTERNS = [
  '**/*.ets',
  '**/oh-package.json5',
  '**/src/main/module.json5',
  'AppScope/app.json5',
  'build-profile.json5',
  'hvigor/hvigor-config.json5',
  'hvigorw',
  'hvigorw.bat',
  '**/src/main/resources/**',
] as const;

export function createEmptyTrackedFileCounts(): Record<HarmonyTrackedFileKind, number> {
  return {
    arkts: 0,
    buildProfile: 0,
    ohPackage: 0,
    moduleJson: 0,
    appJson: 0,
    hvigorConfig: 0,
    hvigorScript: 0,
    resource: 0,
  };
}

export function normalizeFsPath(fsPath: string): string {
  return fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function classifyHarmonyFile(rootPath: string, fsPath: string): HarmonyTrackedFile | undefined {
  const normalizedRoot = normalizeFsPath(rootPath);
  const normalizedFile = normalizeFsPath(fsPath);
  const rootPrefix = `${normalizedRoot}/`;

  if (!normalizedFile.startsWith(rootPrefix)) {
    return undefined;
  }

  const relativePath = normalizedFile.slice(rootPrefix.length);
  if (!relativePath) {
    return undefined;
  }

  if (relativePath === CONFIG_FILES.BUILD_PROFILE) {
    return { path: normalizedFile, kind: 'buildProfile' };
  }

  if (relativePath === CONFIG_FILES.OH_PACKAGE) {
    return { path: normalizedFile, kind: 'ohPackage' };
  }

  if (relativePath === `AppScope/${CONFIG_FILES.APP_JSON}`) {
    return { path: normalizedFile, kind: 'appJson' };
  }

  if (relativePath === `hvigor/${CONFIG_FILES.HVIGOR_CONFIG}`) {
    return { path: normalizedFile, kind: 'hvigorConfig' };
  }

  if (relativePath === 'hvigorw' || relativePath === 'hvigorw.bat') {
    return { path: normalizedFile, kind: 'hvigorScript' };
  }

  const parts = relativePath.split('/');
  const moduleName = parts[0];

  if (parts.length >= 2 && parts[1] === CONFIG_FILES.OH_PACKAGE) {
    return { path: normalizedFile, kind: 'ohPackage', module: moduleName };
  }

  if (
    parts.length >= 4
    && parts[1] === 'src'
    && parts[2] === 'main'
    && parts[3] === CONFIG_FILES.MODULE_JSON
  ) {
    return { path: normalizedFile, kind: 'moduleJson', module: moduleName };
  }

  if (
    parts.length >= 5
    && parts[1] === 'src'
    && parts[2] === 'main'
    && parts[3] === 'ets'
    && normalizedFile.endsWith(ETS_EXTENSION)
  ) {
    return { path: normalizedFile, kind: 'arkts', module: moduleName };
  }

  if (
    parts.length >= 5
    && parts[1] === 'src'
    && parts[2] === 'main'
    && parts[3] === 'resources'
  ) {
    return { path: normalizedFile, kind: 'resource', module: moduleName };
  }

  return undefined;
}

export function summarizeTrackedFiles(rootPath: string, files: HarmonyTrackedFile[]): HarmonyProjectFileIndex {
  const deduped = new Map<string, HarmonyTrackedFile>();
  for (const file of files) {
    deduped.set(normalizeFsPath(file.path), {
      ...file,
      path: normalizeFsPath(file.path),
    });
  }

  const normalizedFiles = Array.from(deduped.values()).sort((a, b) => a.path.localeCompare(b.path));
  const counts = createEmptyTrackedFileCounts();
  const modules = new Set<string>();

  for (const file of normalizedFiles) {
    counts[file.kind] += 1;
    if (file.module) {
      modules.add(file.module);
    }
  }

  return {
    rootPath: normalizeFsPath(rootPath),
    modules: Array.from(modules).sort(),
    files: normalizedFiles,
    counts,
  };
}

export class HarmonyProjectFileTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private index?: HarmonyProjectFileIndex;
  private rebuildVersion = 0;

  constructor(
    private readonly rootUri: vscode.Uri,
    private readonly eventBus?: HarmonyEventBus,
  ) {
    for (const pattern of TRACKED_PATTERNS) {
      this.disposables.push(this.createWatcher(pattern));
    }
  }

  getIndex(): HarmonyProjectFileIndex | undefined {
    return this.index;
  }

  async rebuild(): Promise<HarmonyProjectFileIndex> {
    const rebuildVersion = ++this.rebuildVersion;
    const fileMap = new Map<string, HarmonyTrackedFile>();

    for (const pattern of TRACKED_PATTERNS) {
      const matches = await vscode.workspace.findFiles(
        new vscode.RelativePattern(this.rootUri, pattern),
        '**/node_modules/**'
      );
      if (!this.isLatestRebuild(rebuildVersion)) {
        return this.index ?? summarizeTrackedFiles(this.rootUri.fsPath, Array.from(fileMap.values()));
      }

      for (const uri of matches) {
        const tracked = classifyHarmonyFile(this.rootUri.fsPath, uri.fsPath);
        if (tracked) {
          fileMap.set(normalizeFsPath(tracked.path), tracked);
        }
      }
    }

    const nextIndex = summarizeTrackedFiles(this.rootUri.fsPath, Array.from(fileMap.values()));
    if (!this.isLatestRebuild(rebuildVersion)) {
      return this.index ?? nextIndex;
    }

    this.index = nextIndex;
    this.eventBus?.emit('project:indexUpdated', this.index);
    return this.index;
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private createWatcher(pattern: string): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.rootUri, pattern));
    watcher.onDidCreate((uri) => void this.handleFileEvent('created', uri));
    watcher.onDidChange((uri) => void this.handleFileEvent('changed', uri));
    watcher.onDidDelete((uri) => void this.handleFileEvent('deleted', uri));
    return watcher;
  }

  private async handleFileEvent(change: HarmonyFileChangeType, uri: vscode.Uri): Promise<void> {
    const tracked = classifyHarmonyFile(this.rootUri.fsPath, uri.fsPath);
    if (!tracked) {
      return;
    }

    this.eventBus?.emit('project:fileChanged', {
      file: tracked.path,
      kind: tracked.kind,
      change,
      module: tracked.module,
    });

    if (tracked.kind === 'buildProfile' || tracked.kind === 'ohPackage' || tracked.kind === 'moduleJson' || tracked.kind === 'appJson') {
      this.eventBus?.emit('project:configChanged', {
        file: tracked.path,
        type: tracked.kind,
      });
    }

    await this.rebuild();
  }

  private isLatestRebuild(rebuildVersion: number): boolean {
    return rebuildVersion === this.rebuildVersion;
  }
}
