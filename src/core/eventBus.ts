import * as vscode from 'vscode';

export interface HarmonyEvents {
  'project:detected': { rootPath: string; modules: string[] };
  'project:configChanged': { file: string; type: string };
  'project:fileChanged': { file: string; kind: string; change: 'created' | 'changed' | 'deleted'; module?: string };
  'project:indexUpdated': {
    rootPath: string;
    modules: string[];
    files: Array<{ path: string; kind: string; module?: string }>;
    counts: Record<string, number>;
  };
  'build:started': { task: string; module?: string };
  'build:completed': { task: string; success: boolean; duration: number };
  'build:error': { message: string; file?: string; line?: number };
  'device:connected': { id: string; name: string; type: string };
  'device:disconnected': { id: string };
  'device:appInstalled': { deviceId: string; bundleName: string };
  'resource:changed': { type: string; path: string };
  'resource:indexRebuilt': { count: number };
  'language:diagnostics': { file: string; errors: number; warnings: number };
  'extension:activated': { id: string };
  'extension:registered': { point: string; contributor: string };
}

type EventKey = keyof HarmonyEvents;

export class HarmonyEventBus implements vscode.Disposable {
  private emitters = new Map<string, vscode.EventEmitter<any>>();
  private disposables: vscode.Disposable[] = [];
  private patternListeners: Array<{ prefix: string; listener: (event: string, data: any) => void; disposed: boolean }> = [];

  on<K extends EventKey>(
    event: K,
    listener: (data: HarmonyEvents[K]) => void
  ): vscode.Disposable {
    const emitter = this.getOrCreateEmitter(event);
    const disposable = emitter.event(listener);
    this.disposables.push(disposable);
    return disposable;
  }

  emit<K extends EventKey>(event: K, data: HarmonyEvents[K]): void {
    this.emitters.get(event)?.fire(data);
  }

  onPattern(
    pattern: string,
    listener: (event: string, data: any) => void
  ): vscode.Disposable {
    const prefix = pattern.replace('*', '');
    const childDisposables: vscode.Disposable[] = [];

    for (const [key, emitter] of this.emitters) {
      if (key.startsWith(prefix)) {
        childDisposables.push(emitter.event((data) => listener(key, data)));
      }
    }

    const entry = { prefix, listener, disposed: false };
    this.patternListeners.push(entry);

    const disposable = {
      dispose: () => {
        entry.disposed = true;
        childDisposables.forEach((d) => d.dispose());
        const idx = this.patternListeners.indexOf(entry);
        if (idx >= 0) this.patternListeners.splice(idx, 1);
      },
    };
    this.disposables.push(disposable);
    return disposable;
  }

  private getOrCreateEmitter(event: string): vscode.EventEmitter<any> {
    let emitter = this.emitters.get(event);
    if (!emitter) {
      emitter = new vscode.EventEmitter();
      this.emitters.set(event, emitter);

      for (const entry of this.patternListeners) {
        if (!entry.disposed && event.startsWith(entry.prefix)) {
          const sub = emitter.event((data) => entry.listener(event, data));
          this.disposables.push(sub);
        }
      }
    }
    return emitter;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.emitters.forEach((e) => e.dispose());
    this.emitters.clear();
    this.patternListeners.length = 0;
  }
}

export const eventBus = new HarmonyEventBus();
