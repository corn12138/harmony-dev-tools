import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WebView DevTools browser resolver', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const vscode = await import('vscode');
    (vscode as any).__reset();
  });

  it('builds Mac and Windows candidate paths for Chrome and Edge', async () => {
    const { getDevToolsBrowserCandidatePaths } = await import('../src/webview/browser');
    const macCandidates = getDevToolsBrowserCandidatePaths('darwin', {
      HOME: '/Users/tester',
    } as NodeJS.ProcessEnv);
    expect(macCandidates.some((item) => item.executablePath.includes('Google Chrome.app'))).toBe(true);
    expect(macCandidates.some((item) => item.executablePath.includes('Microsoft Edge.app'))).toBe(true);

    const winCandidates = getDevToolsBrowserCandidatePaths('win32', {
      USERPROFILE: 'C:\\Users\\tester',
      LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    } as NodeJS.ProcessEnv);
    expect(winCandidates.some((item) => item.executablePath.endsWith('\\Chrome\\Application\\chrome.exe'))).toBe(true);
    expect(winCandidates.some((item) => item.executablePath.endsWith('\\Edge\\Application\\msedge.exe'))).toBe(true);
  });

  it('resolves an explicitly configured Edge browser path', async () => {
    const vscode = await import('vscode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-devtools-browser-'));
    try {
      const edgePath = path.join(root, process.platform === 'win32' ? 'msedge.exe' : 'msedge');
      fs.writeFileSync(edgePath, '', 'utf8');
      await vscode.workspace.getConfiguration('harmony').update('devToolsBrowserPath', edgePath, true);

      const { resolveDevToolsBrowser } = await import('../src/webview/browser');
      const resolved = await resolveDevToolsBrowser();
      expect(resolved.executablePath).toBe(edgePath);
      expect(resolved.kind).toBe('edge');
      expect(resolved.inspectUrl).toBe('edge://inspect/#devices');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a missing configured browser path before falling back', async () => {
    const vscode = await import('vscode');
    await vscode.workspace.getConfiguration('harmony').update('devToolsBrowserPath', '/tmp/missing-browser', true);

    const { resolveDevToolsBrowser } = await import('../src/webview/browser');
    const resolved = await resolveDevToolsBrowser();
    expect(resolved.warnings.some((warning) => warning.includes('Configured WebView DevTools browser was not found'))).toBe(true);
    expect(['auto', 'system']).toContain(resolved.source);
  });
});
