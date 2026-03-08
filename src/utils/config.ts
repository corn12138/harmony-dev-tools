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

// Cached resolved HDC path to avoid repeated filesystem scans
let resolvedHdcPath: string | null = null;

/**
 * Auto-detect HDC executable.
 * Priority: user config > PATH > well-known SDK locations (Mac/Win/Linux).
 * Caches the result for the session. Returns the full path or 'hdc' as fallback.
 */
export async function resolveHdcPath(): Promise<string> {
  // 1. User explicitly configured path
  const configured = getHdcPath();
  if (configured && fs.existsSync(configured)) {
    resolvedHdcPath = configured;
    return configured;
  }

  // 2. Return cached result if already resolved
  if (resolvedHdcPath) return resolvedHdcPath;

  // 3. Try system PATH (which/where)
  try {
    const cmd = process.platform === 'win32' ? 'where hdc' : 'which hdc';
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    const found = stdout.trim().split('\n')[0].trim();
    if (found && fs.existsSync(found)) {
      resolvedHdcPath = found;
      return found;
    }
  } catch {
    // not in PATH, continue searching
  }

  // 4. Scan well-known SDK locations
  const candidates = getHdcCandidatePaths();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      resolvedHdcPath = candidate;
      return candidate;
    }
  }

  // 5. Fallback — return 'hdc' and let the caller handle the error
  return 'hdc';
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
      resolvedHdcPath = hdcPath;
      vscode.window.showInformationMessage(`HDC path saved: ${hdcPath}`);
      return hdcPath;
    }
  } else if (action === 'Open Settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'harmony.hdcPath');
  }

  return null;
}
