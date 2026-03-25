import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveHvigorExecution = vi.fn();
const mockFormatHvigorProjectSetupIssue = vi.fn(() => 'broken hvigor');
const mockResolveAssembleHapPreflight = vi.fn();

vi.mock('../src/utils/hvigor', () => ({
  resolveHvigorExecution: mockResolveHvigorExecution,
  formatHvigorProjectSetupIssue: mockFormatHvigorProjectSetupIssue,
}));

vi.mock('../src/build/preflight', () => ({
  resolveAssembleHapPreflight: mockResolveAssembleHapPreflight,
}));

describe('hvigor task provider', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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
      if (uri.fsPath === '/workspace/demo/hvigorfile.ts') {
        return { type: vscode.FileType.File };
      }
      throw new Error(`ENOENT: ${uri.fsPath}`);
    });
  });

  it('provides tasks using the resolved external hvigor command', async () => {
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: "'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' assembleHap --no-daemon",
        executablePath: '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw',
        source: 'external',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw',
          exists: true,
          missingRuntimePaths: ['/workspace/demo/hvigor/hvigor-wrapper.js'],
          warnings: [],
        },
        warnings: [],
        shellPath: 'cmd.exe',
      },
      warnings: [],
    });
    mockResolveHvigorExecution.mockResolvedValue({
      command: "'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' clean --no-daemon",
      executablePath: '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw',
      source: 'external',
      projectSetup: {
        executablePath: '/workspace/demo/hvigorw',
        exists: true,
        missingRuntimePaths: [],
        warnings: [],
      },
      warnings: [],
      shellPath: 'cmd.exe',
    });

    const { HvigorTaskProvider } = await import('../src/build/taskProvider');
    const provider = new HvigorTaskProvider();
    const tasks = await provider.provideTasks();

    expect(tasks).toHaveLength(4);
    expect(tasks[0].execution.commandLine).toContain('hvigorw');
    expect(tasks[0].execution.options.shellPath).toBe('cmd.exe');
  });

  it('skips tasks when neither local nor external hvigor is usable', async () => {
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: 'chmod +x ./hvigorw 2>/dev/null && ./hvigorw assembleHap --no-daemon',
        executablePath: undefined,
        source: 'project',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw',
          exists: false,
          missingRuntimePaths: [],
          warnings: [],
        },
        warnings: [],
        shellPath: undefined,
      },
      blockingMessage: 'broken signing',
      warnings: [],
    });
    mockResolveHvigorExecution.mockResolvedValue({
      command: 'chmod +x ./hvigorw 2>/dev/null && ./hvigorw assembleHap --no-daemon',
      executablePath: undefined,
      source: 'project',
      projectSetup: {
        executablePath: '/workspace/demo/hvigorw',
        exists: false,
        missingRuntimePaths: [],
        warnings: [],
      },
      warnings: [],
      shellPath: undefined,
    });

    const { HvigorTaskProvider } = await import('../src/build/taskProvider');
    const provider = new HvigorTaskProvider();
    const tasks = await provider.provideTasks();

    expect(tasks).toHaveLength(0);
  });
});
