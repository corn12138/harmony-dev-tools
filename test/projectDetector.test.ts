import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/project/fileTracker', () => ({
  HarmonyProjectFileTracker: class {
    async rebuild(): Promise<any> {
      return {
        rootPath: '/workspace/demo',
        modules: ['entry'],
        files: [],
        counts: {},
      };
    }

    dispose(): void {}
  },
}));

function createModuleContext(eventBus: any): any {
  return {
    extensionContext: {},
    eventBus,
    registry: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('project detector', () => {
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
    vscode.workspace.fs.stat = vi.fn(async (uri: any) => {
      if (
        uri.fsPath === '/workspace/demo/build-profile.json5'
        || uri.fsPath === '/workspace/demo/entry/src/main/module.json5'
      ) {
        return { type: vscode.FileType.File };
      }

      throw new Error(`ENOENT: ${uri.fsPath}`);
    });
    vscode.workspace.fs.readDirectory = vi.fn(async (uri: any) => {
      if (uri.fsPath === '/workspace/demo') {
        return [
          ['entry', vscode.FileType.Directory],
          ['AppScope', vscode.FileType.Directory],
        ];
      }

      return [];
    });
    vscode.workspace.fs.readFile = vi.fn(async (uri: any) => {
      if (uri.fsPath === '/workspace/demo/AppScope/app.json5') {
        return Buffer.from("{ bundleName: 'com.demo.app', label: 'Demo App' }");
      }

      throw new Error(`ENOENT: ${uri.fsPath}`);
    });
  });

  it('waits for setContext before finishing activation', async () => {
    const vscode = await import('vscode');
    const originalExecuteCommand = vscode.commands.executeCommand;
    let releaseSetContext: (() => void) | undefined;
    const setContextPending = new Promise<void>((resolve) => {
      releaseSetContext = resolve;
    });

    vscode.commands.executeCommand = vi.fn(async (command: string, ...args: any[]) => {
      if (command === 'setContext') {
        await setContextPending;
        return undefined;
      }

      return originalExecuteCommand(command, ...args);
    }) as any;

    const { ProjectDetectorModule } = await import('../src/project/projectDetector');
    const eventBus = {
      emit: vi.fn(),
      on: vi.fn(() => ({ dispose: () => {} })),
    };
    const module = new ProjectDetectorModule();

    const activation = module.activate(createModuleContext(eventBus));
    await Promise.resolve();

    expect(module.isActive).toBe(false);

    releaseSetContext?.();
    await activation;

    expect(module.isActive).toBe(true);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'harmony.isHarmonyProject',
      true,
    );
  });
});
