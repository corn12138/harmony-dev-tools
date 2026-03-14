import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('harmony').get<T>(key, defaultValue);
}

export function getSdkPath(): string {
  return getConfig<string>('sdkPath', '');
}

export function getHdcPath(): string {
  return getConfig<string>('hdcPath', '');
}

const resolvedToolPaths = new Map<string, string>();

/**
 * Auto-detect HDC executable.
 * Priority: user config > PATH > well-known SDK locations (Mac/Win/Linux).
 * Caches the result for the session. Returns the full path or 'hdc' as fallback.
 */
export async function resolveHdcPath(): Promise<string> {
  // 1. User explicitly configured path
  const configured = getHdcPath();
  if (configured && fs.existsSync(configured)) {
    resolvedToolPaths.set('hdc', configured);
    return configured;
  }

  const resolved = await resolveToolPath('hdc');
  return resolved ?? 'hdc';
}

/**
 * Resolve a tool from PATH, known SDK roots, or HarmonyOS command-line-tools.
 */
export async function resolveToolPath(toolName: 'hdc' | 'sdkmgr' | 'ohpm' | 'codelinter'): Promise<string | null> {
  const cached = resolvedToolPaths.get(toolName);
  if (cached) {
    return cached;
  }

  const fromPath = await resolveExecutableFromPath(toolName);
  if (fromPath) {
    resolvedToolPaths.set(toolName, fromPath);
    return fromPath;
  }

  const candidates = toolName === 'hdc'
    ? getHdcCandidatePaths()
    : getCommandLineToolCandidatePaths(toolName);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      resolvedToolPaths.set(toolName, candidate);
      return candidate;
    }
  }

  return null;
}

/**
 * Returns candidate HDC paths based on platform and common SDK install locations.
 * Sorted by SDK version (higher first) so the latest SDK is preferred.
 */
function getHdcCandidatePaths(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates: string[] = [];
  const hdcBin = process.platform === 'win32' ? 'hdc.exe' : 'hdc';

  if (process.platform === 'darwin') {
    // macOS: DevEco Studio & OpenHarmony SDK
    const sdkRoots = [
      path.join(home, 'Library', 'OpenHarmony', 'Sdk'),
      path.join(home, 'Library', 'Huawei', 'Sdk'),
      path.join(home, 'Library', 'HarmonyOS', 'Sdk'),
      '/Applications/DevEco-Studio.app/Contents/sdk',
    ];
    for (const root of sdkRoots) {
      candidates.push(...findHdcInSdkRoot(root, hdcBin));
    }
  } else if (process.platform === 'win32') {
    // Windows: DevEco Studio & OpenHarmony SDK
    const sdkRoots = [
      path.join(home, 'AppData', 'Local', 'OpenHarmony', 'Sdk'),
      path.join(home, 'AppData', 'Local', 'Huawei', 'Sdk'),
      path.join(home, 'AppData', 'Local', 'HarmonyOS', 'Sdk'),
      'C:\\DevEcoStudio\\sdk',
      'C:\\Program Files\\Huawei\\DevEco Studio\\sdk',
    ];
    for (const root of sdkRoots) {
      candidates.push(...findHdcInSdkRoot(root, hdcBin));
    }
  } else {
    // Linux
    const sdkRoots = [
      path.join(home, 'OpenHarmony', 'Sdk'),
      path.join(home, 'Huawei', 'Sdk'),
      path.join(home, 'HarmonyOS', 'Sdk'),
    ];
    for (const root of sdkRoots) {
      candidates.push(...findHdcInSdkRoot(root, hdcBin));
    }
  }

  candidates.push(...getCommandLineToolCandidatePaths('hdc'));
  return candidates;
}

/**
 * Given an SDK root (e.g. ~/Library/OpenHarmony/Sdk), find hdc inside
 * <version>/toolchains/hdc. Returns paths sorted by version descending.
 */
function findHdcInSdkRoot(sdkRoot: string, hdcBin: string): string[] {
  try {
    if (!fs.existsSync(sdkRoot)) return [];
    const versions = fs.readdirSync(sdkRoot)
      .filter((d) => /^\d+$/.test(d))
      .sort((a, b) => Number(b) - Number(a)); // highest version first
    return versions.map((v) => path.join(sdkRoot, v, 'toolchains', hdcBin));
  } catch {
    return [];
  }
}

function getCommandLineToolCandidatePaths(toolName: 'hdc' | 'sdkmgr' | 'ohpm' | 'codelinter'): string[] {
  const candidates: string[] = [];
  const binaryNames = process.platform === 'win32'
    ? [`${toolName}.exe`, `${toolName}.cmd`, `${toolName}.bat`]
    : [toolName];

  for (const root of getCommandLineToolRoots()) {
    for (const binaryName of binaryNames) {
      candidates.push(path.join(root, 'bin', binaryName));
      candidates.push(path.join(root, 'tools', binaryName));
      candidates.push(path.join(root, 'sdk', 'default', 'openharmony', 'toolchains', binaryName));
      candidates.push(path.join(root, 'sdk', 'default', 'harmonyos', 'toolchains', binaryName));
      candidates.push(path.join(root, 'sdk', 'default', 'openharmony', 'toolchains', toolName, 'bin', binaryName));
      candidates.push(path.join(root, 'sdk', 'default', 'harmonyos', 'toolchains', toolName, 'bin', binaryName));
    }
  }

  return Array.from(new Set(candidates));
}

function getCommandLineToolRoots(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roots: string[] = [];

  if (process.platform === 'darwin') {
    roots.push(
      path.join(home, 'Library', 'Harmony', 'command-line-tools'),
      path.join(home, 'Library', 'Huawei', 'command-line-tools'),
      path.join(home, 'Library', 'HarmonyOS', 'command-line-tools'),
      path.join(home, 'Library', 'OpenHarmony', 'command-line-tools'),
      '/Applications/DevEco-Studio.app/Contents/command-line-tools',
    );
  } else if (process.platform === 'win32') {
    roots.push(
      path.join(localAppData, 'Harmony', 'command-line-tools'),
      path.join(localAppData, 'Huawei', 'command-line-tools'),
      path.join(localAppData, 'HarmonyOS', 'command-line-tools'),
      path.join(localAppData, 'OpenHarmony', 'command-line-tools'),
      'C:\\DevEcoStudio\\command-line-tools',
      'C:\\Program Files\\Huawei\\DevEco Studio\\command-line-tools',
    );
  } else {
    roots.push(
      path.join(home, 'Harmony', 'command-line-tools'),
      path.join(home, 'Huawei', 'command-line-tools'),
      path.join(home, 'HarmonyOS', 'command-line-tools'),
      path.join(home, 'OpenHarmony', 'command-line-tools'),
    );
  }

  const configuredSdk = getSdkPath();
  if (configuredSdk) {
    roots.push(
      path.join(configuredSdk, '..', '..', 'command-line-tools'),
      path.join(configuredSdk, '..', 'command-line-tools'),
    );
  }

  return Array.from(new Set(roots.map((root) => path.resolve(root))));
}

async function resolveExecutableFromPath(toolName: string): Promise<string | null> {
  try {
    const cmd = process.platform === 'win32' ? `where ${toolName}` : `which ${toolName}`;
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    const found = stdout.trim().split('\n')[0].trim();
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {
    // not in PATH, continue searching
  }

  return null;
}

/**
 * Prompt user to configure HDC path when auto-detection fails.
 */
export async function promptHdcConfiguration(): Promise<string | null> {
  const action = await vscode.window.showErrorMessage(
    'HDC not found. HDC is required for device operations.\n'
    + 'Install HarmonyOS SDK or configure the path manually.',
    'Browse for HDC',
    'Open Settings'
  );

  if (action === 'Browse for HDC') {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: 'Select HDC executable',
      filters: process.platform === 'win32'
        ? { 'Executable': ['exe'] }
        : undefined,
    });
    if (picked?.[0]) {
      const hdcPath = picked[0].fsPath;
      await vscode.workspace.getConfiguration('harmony').update('hdcPath', hdcPath, true);
      resolvedToolPaths.set('hdc', hdcPath);
      vscode.window.showInformationMessage(`HDC path saved: ${hdcPath}`);
      return hdcPath;
    }
  } else if (action === 'Open Settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'harmony.hdcPath');
  }

  return null;
}
