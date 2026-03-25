import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { shouldUseBatchShell } from '../utils/commandShell';

const CHROME_INSPECT_URL = 'chrome://inspect/#devices';
const EDGE_INSPECT_URL = 'edge://inspect/#devices';

export type DevToolsBrowserKind = 'chrome' | 'edge' | 'system';

export interface DevToolsBrowserResolution {
  executablePath?: string;
  kind: DevToolsBrowserKind;
  source: 'config' | 'auto' | 'system';
  displayName: string;
  inspectUrl: string;
  warnings: string[];
}

export function getDevToolsBrowserPath(): string {
  return vscode.workspace.getConfiguration('harmony').get<string>('devToolsBrowserPath', '');
}

export function getDevToolsBrowserCandidatePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Array<{ executablePath: string; kind: Exclude<DevToolsBrowserKind, 'system'> }> {
  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  const home = env.HOME || env.USERPROFILE || '';
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  if (platform === 'darwin') {
    return [
      {
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        kind: 'chrome',
      },
      {
        executablePath: platformPath.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        kind: 'chrome',
      },
      {
        executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        kind: 'edge',
      },
      {
        executablePath: platformPath.join(home, 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
        kind: 'edge',
      },
    ];
  }

  if (platform === 'win32') {
    return [
      {
        executablePath: platformPath.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        kind: 'chrome',
      },
      {
        executablePath: platformPath.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        kind: 'chrome',
      },
      {
        executablePath: platformPath.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        kind: 'chrome',
      },
      {
        executablePath: platformPath.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        kind: 'edge',
      },
      {
        executablePath: platformPath.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        kind: 'edge',
      },
      {
        executablePath: platformPath.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        kind: 'edge',
      },
    ];
  }

  return [
    {
      executablePath: '/usr/bin/google-chrome',
      kind: 'chrome',
    },
    {
      executablePath: '/usr/bin/microsoft-edge',
      kind: 'edge',
    },
  ];
}

export async function resolveDevToolsBrowser(): Promise<DevToolsBrowserResolution> {
  const configured = getDevToolsBrowserPath();
  const warnings: string[] = [];

  if (configured) {
    if (fs.existsSync(configured)) {
      return buildBrowserResolution(configured, 'config');
    }
    warnings.push(`Configured WebView DevTools browser was not found: ${configured}`);
  }

  for (const candidate of getDevToolsBrowserCandidatePaths()) {
    if (!fs.existsSync(candidate.executablePath)) {
      continue;
    }
    return buildBrowserResolution(candidate.executablePath, 'auto', warnings);
  }

  return {
    kind: 'system',
    source: 'system',
    displayName: 'System Browser',
    inspectUrl: CHROME_INSPECT_URL,
    warnings,
  };
}

export async function openUrlInDevToolsBrowser(
  url: string,
  browser: DevToolsBrowserResolution,
): Promise<boolean> {
  const executablePath = browser.executablePath;
  if (!executablePath) {
    return vscode.env.openExternal(vscode.Uri.parse(url));
  }

  return new Promise<boolean>((resolve) => {
    const child = spawn(executablePath, [url], {
      detached: true,
      stdio: 'ignore',
      shell: shouldUseBatchShell(executablePath),
    }) as ChildProcess;

    let settled = false;
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    child.once('error', () => {
      void vscode.env.openExternal(vscode.Uri.parse(url))
        .then((result) => finish(result), () => finish(false));
    });
    child.once('spawn', () => {
      child.unref();
      finish(true);
    });

    if (child.pid) {
      queueMicrotask(() => {
        child.unref();
        finish(true);
      });
    }
  });
}

function buildBrowserResolution(
  executablePath: string,
  source: 'config' | 'auto',
  inheritedWarnings: string[] = [],
): DevToolsBrowserResolution {
  const kind = detectDevToolsBrowserKind(executablePath);
  return {
    executablePath,
    kind,
    source,
    displayName: kind === 'edge' ? 'Microsoft Edge' : 'Google Chrome',
    inspectUrl: kind === 'edge' ? EDGE_INSPECT_URL : CHROME_INSPECT_URL,
    warnings: inheritedWarnings,
  };
}

function detectDevToolsBrowserKind(executablePath: string): Exclude<DevToolsBrowserKind, 'system'> {
  const normalized = executablePath.toLowerCase();
  return normalized.includes('edge') ? 'edge' : 'chrome';
}
