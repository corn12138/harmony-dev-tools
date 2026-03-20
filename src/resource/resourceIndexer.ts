import * as vscode from 'vscode';
import * as path from 'path';

export interface ResourceEntry {
  /** e.g. 'app.string.hello_world' */
  key: string;
  /** e.g. 'string', 'media', 'color', 'float' */
  type: string;
  /** Resource name */
  name: string;
  /** File URI containing this resource */
  fileUri: vscode.Uri;
  /** Value (for string/color/float; undefined for media) */
  value?: string;
}

export class ResourceIndexer implements vscode.Disposable {
  private resources = new Map<string, ResourceEntry>();
  private disposables: vscode.Disposable[] = [];
  private _onDidUpdate = new vscode.EventEmitter<void>();
  private initialized = false;
  private initializing?: Promise<void>;
  private rebuildVersion = 0;
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor() {
    // Watch resource files
    const watcher = vscode.workspace.createFileSystemWatcher('**/resources/**/*.json');
    watcher.onDidChange(() => this.rebuild());
    watcher.onDidCreate(() => this.rebuild());
    watcher.onDidDelete(() => this.rebuild());
    this.disposables.push(watcher, this._onDidUpdate);

    // Watch media files
    const mediaWatcher = vscode.workspace.createFileSystemWatcher('**/resources/**/media/*');
    mediaWatcher.onDidCreate(() => this.rebuild());
    mediaWatcher.onDidDelete(() => this.rebuild());
    this.disposables.push(mediaWatcher);
  }

  async rebuild(): Promise<void> {
    const rebuildVersion = ++this.rebuildVersion;
    this.initializing = undefined;
    const nextResources = new Map<string, ResourceEntry>();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      if (!this.isLatestRebuild(rebuildVersion)) {
        return;
      }
      this.resources = nextResources;
      this.initialized = true;
      this._onDidUpdate.fire();
      return;
    }

    for (const folder of folders) {
      // Scan element JSON files (string.json, color.json, float.json, etc.)
      const elementFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/resources/base/element/*.json'),
        '**/node_modules/**'
      );
      if (!this.isLatestRebuild(rebuildVersion)) {
        return;
      }
      for (const uri of elementFiles) {
        await this.indexElementFile(uri, nextResources);
        if (!this.isLatestRebuild(rebuildVersion)) {
          return;
        }
      }

      // Scan media directory
      const mediaFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/resources/base/media/*'),
        '**/node_modules/**'
      );
      if (!this.isLatestRebuild(rebuildVersion)) {
        return;
      }
      for (const uri of mediaFiles) {
        const name = path.basename(uri.fsPath, path.extname(uri.fsPath));
        const key = `app.media.${name}`;
        nextResources.set(key, { key, type: 'media', name, fileUri: uri });
      }

      // Scan profile directory
      const profileFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/resources/base/profile/*.json'),
        '**/node_modules/**'
      );
      if (!this.isLatestRebuild(rebuildVersion)) {
        return;
      }
      for (const uri of profileFiles) {
        const name = path.basename(uri.fsPath, '.json');
        const key = `app.profile.${name}`;
        nextResources.set(key, { key, type: 'profile', name, fileUri: uri });
      }
    }

    if (!this.isLatestRebuild(rebuildVersion)) {
      return;
    }

    this.resources = nextResources;
    this.initialized = true;
    this._onDidUpdate.fire();
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initializing) {
      const rebuildPromise = this.rebuild();
      let trackedPromise: Promise<void>;
      trackedPromise = rebuildPromise.finally(() => {
        if (this.initializing === trackedPromise) {
          this.initializing = undefined;
        }
      });
      this.initializing = trackedPromise;
    }

    await this.initializing;
  }

  private async indexElementFile(
    uri: vscode.Uri,
    target: Map<string, ResourceEntry>,
  ): Promise<void> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf8');
      const json = JSON.parse(text);

      // Determine type from filename: string.json → 'string', color.json → 'color'
      const type = path.basename(uri.fsPath, '.json');

      const entries: { name: string; value: string }[] = json[type] ?? [];
      for (const entry of entries) {
        const key = `app.${type}.${entry.name}`;
        target.set(key, {
          key,
          type,
          name: entry.name,
          fileUri: uri,
          value: entry.value,
        });
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  private isLatestRebuild(rebuildVersion: number): boolean {
    return rebuildVersion === this.rebuildVersion;
  }

  getAll(): ResourceEntry[] {
    return Array.from(this.resources.values());
  }

  get(key: string): ResourceEntry | undefined {
    return this.resources.get(key);
  }

  getByType(type: string): ResourceEntry[] {
    return this.getAll().filter((r) => r.type === type);
  }

  has(key: string): boolean {
    return this.resources.has(key);
  }

  get size(): number {
    return this.resources.size;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.resources.clear();
    this.initialized = false;
    this.initializing = undefined;
  }
}

/** Singleton — lazily created on first use */
let _instance: ResourceIndexer | undefined;

export function getResourceIndexer(): ResourceIndexer {
  if (!_instance) {
    _instance = new ResourceIndexer();
  }
  return _instance;
}
