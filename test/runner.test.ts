import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveHvigorExecution = vi.fn();
const mockResolveAssembleHapPreflight = vi.fn();
const mockFormatHvigorProjectSetupIssue = vi.fn(() => 'broken hvigor');

vi.mock('../src/utils/hvigor', () => ({
  resolveHvigorExecution: mockResolveHvigorExecution,
  formatHvigorProjectSetupIssue: mockFormatHvigorProjectSetupIssue,
}));

vi.mock('../src/build/preflight', () => ({
  resolveAssembleHapPreflight: mockResolveAssembleHapPreflight,
}));

describe('build runner hvigor fallback', () => {
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
  });

  it('executes Build HAP with an externally resolved hvigor command', async () => {
    const vscode = await import('vscode');
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
        warnings: ['broken local wrapper'],
      },
      warnings: ['broken local wrapper'],
    });

    const { buildHap } = await import('../src/build/runner');
    await buildHap();

    const tasks = (vscode as any).__getExecutedTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].execution.commandLine).toBe(
      "'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' assembleHap --no-daemon",
    );
    expect(tasks[0].execution.options.cwd).toBe('/workspace/demo');
  });

  it('executes Clean with the resolved external hvigor command', async () => {
    const vscode = await import('vscode');
    mockResolveHvigorExecution.mockResolvedValue({
      command: "'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' clean --no-daemon",
      executablePath: '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw',
      source: 'external',
      projectSetup: {
        executablePath: '/workspace/demo/hvigorw',
        exists: false,
        missingRuntimePaths: [],
        warnings: [],
      },
      warnings: [],
    });

    const { cleanBuild } = await import('../src/build/runner');
    await cleanBuild();

    const tasks = (vscode as any).__getExecutedTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].execution.commandLine).toBe(
      "'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' clean --no-daemon",
    );
  });

  it('pins cmd.exe for Windows shell tasks when using an external hvigor batch file', async () => {
    const vscode = await import('vscode');
    mockResolveAssembleHapPreflight.mockResolvedValue({
      hvigorExecution: {
        command: '"C:\\Program Files\\Huawei\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat" assembleHap --no-daemon',
        executablePath: 'C:\\Program Files\\Huawei\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat',
        source: 'external',
        projectSetup: {
          executablePath: '/workspace/demo/hvigorw.bat',
          exists: false,
          missingRuntimePaths: [],
          warnings: [],
        },
        warnings: [],
        shellPath: 'cmd.exe',
      },
      warnings: [],
    });

    const { buildHap } = await import('../src/build/runner');
    await buildHap();

    const tasks = (vscode as any).__getExecutedTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].execution.options.shellPath).toBe('cmd.exe');
  });

  it('shows a preflight error and skips task execution when no hvigor is available', async () => {
    const vscode = await import('vscode');
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
      },
      blockingMessage: 'broken signing',
      warnings: [],
    });

    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage');
    const { buildHap } = await import('../src/build/runner');
    await buildHap();

    expect(errorSpy).toHaveBeenCalledWith('broken signing');
    expect((vscode as any).__getExecutedTasks()).toHaveLength(0);
  });
});
