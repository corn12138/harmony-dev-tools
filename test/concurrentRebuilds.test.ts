import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonyEventBus } from '../src/core/eventBus';
import { HarmonyProjectFileTracker } from '../src/project/fileTracker';
import { ResourceIndexer } from '../src/resource/resourceIndexer';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('concurrent rebuild guards', () => {
  beforeEach(async () => {
    const vscode = await import('vscode');
    (vscode as any).__reset();
    vscode.workspace.workspaceFolders = [
      {
        name: 'demo',
        uri: vscode.Uri.file('/workspace/demo'),
        index: 0,
      },
    ] as any;
  });

  it('keeps the newest resource index when rebuilds finish out of order', async () => {
    const vscode = await import('vscode');
    const firstElementBatch = createDeferred<any[]>();
    let elementBatchCount = 0;

    vscode.workspace.findFiles = vi.fn(async (pattern: any) => {
      const value = typeof pattern === 'string' ? pattern : pattern.pattern;
      if (value === '**/resources/base/element/*.json') {
        elementBatchCount += 1;
        if (elementBatchCount === 1) {
          return firstElementBatch.promise;
        }

        return [vscode.Uri.file('/workspace/demo/feature/src/main/resources/base/element/string.json')];
      }

      return [];
    }) as any;

    vscode.workspace.fs.readFile = vi.fn(async (uri: any) => {
      if (uri.fsPath.includes('/entry/')) {
        return Buffer.from(JSON.stringify({
          string: [{ name: 'legacy_title', value: 'Legacy' }],
        }));
      }

      return Buffer.from(JSON.stringify({
        string: [{ name: 'current_title', value: 'Current' }],
      }));
    }) as any;

    const indexer = new ResourceIndexer();
    const updateSizes: number[] = [];
    indexer.onDidUpdate(() => {
      updateSizes.push(indexer.size);
    });

    const first = indexer.rebuild();
    await Promise.resolve();

    const second = indexer.rebuild();
    await second;

    expect(indexer.has('app.string.current_title')).toBe(true);
    expect(indexer.has('app.string.legacy_title')).toBe(false);

    firstElementBatch.resolve([
      vscode.Uri.file('/workspace/demo/entry/src/main/resources/base/element/string.json'),
    ]);
    await first;

    expect(indexer.has('app.string.current_title')).toBe(true);
    expect(indexer.has('app.string.legacy_title')).toBe(false);
    expect(updateSizes).toEqual([1]);

    indexer.dispose();
  });

  it('keeps the newest tracked project index when rebuilds finish out of order', async () => {
    const vscode = await import('vscode');
    const firstArktsBatch = createDeferred<any[]>();
    let arktsBatchCount = 0;

    vscode.workspace.findFiles = vi.fn(async (pattern: any) => {
      const value = typeof pattern === 'string' ? pattern : pattern.pattern;
      if (value === '**/*.ets') {
        arktsBatchCount += 1;
        if (arktsBatchCount === 1) {
          return firstArktsBatch.promise;
        }

        return [vscode.Uri.file('/workspace/demo/feature/src/main/ets/pages/NewPage.ets')];
      }

      return [];
    }) as any;

    const eventBus = new HarmonyEventBus();
    const emittedIndexes: string[][] = [];
    eventBus.on('project:indexUpdated', (data) => {
      emittedIndexes.push(data.files.map((file) => file.path));
    });

    const tracker = new HarmonyProjectFileTracker(vscode.Uri.file('/workspace/demo'), eventBus);
    const first = tracker.rebuild();
    await Promise.resolve();

    const second = tracker.rebuild();
    await second;

    expect(tracker.getIndex()?.files.map((file) => file.path)).toEqual([
      '/workspace/demo/feature/src/main/ets/pages/NewPage.ets',
    ]);

    firstArktsBatch.resolve([
      vscode.Uri.file('/workspace/demo/entry/src/main/ets/pages/OldPage.ets'),
    ]);
    await first;

    expect(tracker.getIndex()?.files.map((file) => file.path)).toEqual([
      '/workspace/demo/feature/src/main/ets/pages/NewPage.ets',
    ]);
    expect(emittedIndexes).toEqual([
      ['/workspace/demo/feature/src/main/ets/pages/NewPage.ets'],
    ]);

    tracker.dispose();
    eventBus.dispose();
  });
});
