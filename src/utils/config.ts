import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildCommandLineToolCandidates,
  buildHdcSdkCandidates,
  getCommandLineToolRoots,
  getEmulatorBinaryCandidatePaths,
  getHvigorCandidatePaths,
  getSdkRootCandidates,
  type HarmonyToolName,
} from './toolPaths';

export function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('harmony').get<T>(key, defaultValue);
}

export function getSdkPath(): string {
  return getConfig<string>('sdkPath', '');
}

export function getSdkSearchPaths(): string[] {
  return getConfigPathArray('sdkSearchPaths');
}

export function getHdcPath(): string {
  return getConfig<string>('hdcPath', '');
}

export function getCommandLineToolsSearchPaths(): string[] {
  return getConfigPathArray('commandLineToolsSearchPaths');
}

export function getHvigorPath(): string {
  return getConfig<string>('hvigorPath', '');
}

export function getEmulatorPath(): string {
  return getConfig<string>('emulatorPath', '');
}

export function getEmulatorSearchPaths(): string[] {
  return getConfigPathArray('emulatorSearchPaths');
}

export function getDevEcoStudioSearchPaths(): string[] {
  return getConfigPathArray('devEcoStudioSearchPaths');
}

function getConfigPathArray(key: string): string[] {
  const value = getConfig<unknown>(key, []);
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

interface ResolvedToolPathEntry {
  path: string;
  source: 'auto' | 'config';
}

const resolvedToolPaths = new Map<HarmonyToolName, ResolvedToolPathEntry>();

/**
 * Auto-detect HDC executable.
 * Priority: user config > PATH > well-known SDK locations (Mac/Win/Linux).
 * Caches the result for the session. Returns the full path or 'hdc' as fallback.
 */
export async function resolveHdcPath(): Promise<string> {
  // 1. User explicitly configured path
  const configured = getHdcPath();
  if (configured && fs.existsSync(configured)) {
    resolvedToolPaths.set('hdc', { path: configured, source: 'config' });
    return configured;
  }

  if (!configured) {
    clearResolvedToolPathCache('hdc', 'config');
  }

  const resolved = await resolveToolPath('hdc');
  return resolved ?? 'hdc';
}

/**
 * Auto-detect hvigor executable.
 * Priority: user config > PATH > well-known DevEco Studio locations.
 * Returns the full path or null when unavailable.
 */
export async function resolveHvigorPath(): Promise<string | null> {
  const configured = getHvigorPath();
  if (configured && fs.existsSync(configured)) {
    resolvedToolPaths.set('hvigor', { path: configured, source: 'config' });
    return configured;
  }

  if (!configured) {
    clearResolvedToolPathCache('hvigor', 'config');
  }

  return resolveToolPath('hvigor');
}

export async function resolveEmulatorPath(): Promise<string | null> {
  const configured = getEmulatorPath();
  if (configured && fs.existsSync(configured)) {
    resolvedToolPaths.set('emulator', { path: configured, source: 'config' });
    return configured;
  }

  if (!configured) {
    clearResolvedToolPathCache('emulator', 'config');
  }

  return resolveToolPath('emulator');
}

/**
 * Resolve a tool from PATH, known SDK roots, or HarmonyOS command-line-tools.
 */
export async function resolveToolPath(toolName: HarmonyToolName): Promise<string | null> {
  const cached = resolvedToolPaths.get(toolName);
  if (cached?.path && fs.existsSync(cached.path)) {
    return cached.path;
  }
  if (cached) {
    resolvedToolPaths.delete(toolName);
  }

  const executableName = toolName === 'hvigor'
    ? 'hvigorw'
    : toolName === 'emulator'
      ? 'emulator'
    : toolName;
  const configuredCandidates = getToolCandidates(toolName, true);
  for (const candidate of configuredCandidates) {
    if (fs.existsSync(candidate)) {
      resolvedToolPaths.set(toolName, { path: candidate, source: 'config' });
      return candidate;
    }
  }

  const fromPath = toolName === 'emulator'
    ? null
    : await resolveExecutableFromPath(executableName);
  if (fromPath) {
    resolvedToolPaths.set(toolName, { path: fromPath, source: 'auto' });
    return fromPath;
  }

  for (const candidate of getToolCandidates(toolName, false)) {
    if (fs.existsSync(candidate)) {
      resolvedToolPaths.set(toolName, { path: candidate, source: 'auto' });
      return candidate;
    }
  }

  return null;
}

/**
 * Returns candidate HDC paths based on platform and common SDK install locations.
 * Sorted by SDK version (higher first) so the latest SDK is preferred.
 */
function getHdcCandidatePaths(configuredOnly = false): string[] {
  const candidates: string[] = [];
  const hdcBin = process.platform === 'win32' ? 'hdc.exe' : 'hdc';
  const sdkRoots = getSdkRootCandidates({
    platform: process.platform,
    env: process.env,
    sdkPath: getSdkPath(),
    sdkSearchPaths: getSdkSearchPaths(),
    devEcoStudioSearchPaths: getDevEcoStudioSearchPaths(),
    configuredOnly,
  });
  for (const root of sdkRoots) {
    candidates.push(...findHdcInSdkRoot(root, hdcBin));
  }

  candidates.push(...getCommandLineToolCandidatePaths('hdc', configuredOnly));
  return candidates;
}

/**
 * Given an SDK root (e.g. ~/Library/OpenHarmony/Sdk), find hdc inside
 * <version>/toolchains/hdc. Returns paths sorted by version descending.
 */
function findHdcInSdkRoot(sdkRoot: string, hdcBin: string): string[] {
  try {
    if (!fs.existsSync(sdkRoot)) return [];
    const hmscoreRoot = path.join(sdkRoot, 'hmscore');
    const directCandidates = [
      path.join(sdkRoot, 'toolchains', hdcBin),
      path.join(sdkRoot, 'default', 'openharmony', 'toolchains', hdcBin),
      path.join(sdkRoot, 'default', 'harmonyos', 'toolchains', hdcBin),
      path.join(sdkRoot, 'default', 'hms', 'toolchains', hdcBin),
    ];
    const versionedCandidates = buildHdcSdkCandidates(sdkRoot, fs.readdirSync(sdkRoot), process.platform)
      .filter((candidate) => candidate.endsWith(hdcBin));
    const hmscoreCandidates = fs.existsSync(hmscoreRoot)
      ? buildHdcSdkCandidates(hmscoreRoot, fs.readdirSync(hmscoreRoot), process.platform)
          .filter((candidate) => candidate.endsWith(hdcBin))
      : [];
    return Array.from(new Set([
      ...directCandidates,
      ...versionedCandidates,
      ...hmscoreCandidates,
    ]));
  } catch {
    return [];
  }
}

function getCommandLineToolCandidatePaths(
  toolName: 'hdc' | 'sdkmgr' | 'ohpm' | 'codelinter',
  configuredOnly = false,
): string[] {
  return buildCommandLineToolCandidates(
    toolName,
    getCommandLineToolRoots({
      platform: process.platform,
      env: process.env,
      sdkPath: getSdkPath(),
      commandLineToolSearchPaths: getCommandLineToolsSearchPaths(),
      sdkSearchPaths: getSdkSearchPaths(),
      devEcoStudioSearchPaths: getDevEcoStudioSearchPaths(),
      configuredOnly,
    }),
    process.platform,
  );
}

function getToolCandidates(toolName: HarmonyToolName, configuredOnly: boolean): string[] {
  if (toolName === 'hdc') {
    return getHdcCandidatePaths(configuredOnly);
  }

  if (toolName === 'hvigor') {
    return getHvigorCandidatePaths({
      platform: process.platform,
      env: process.env,
      sdkPath: getSdkPath(),
      sdkSearchPaths: getSdkSearchPaths(),
      commandLineToolSearchPaths: getCommandLineToolsSearchPaths(),
      devEcoStudioSearchPaths: getDevEcoStudioSearchPaths(),
      configuredOnly,
    });
  }

  if (toolName === 'emulator') {
    return getEmulatorBinaryCandidatePaths({
      platform: process.platform,
      env: process.env,
      sdkPath: getSdkPath(),
      sdkSearchPaths: getSdkSearchPaths(),
      emulatorSearchPaths: getEmulatorSearchPaths(),
      devEcoStudioSearchPaths: getDevEcoStudioSearchPaths(),
      configuredOnly,
    });
  }

  return getCommandLineToolCandidatePaths(toolName, configuredOnly);
}

async function resolveExecutableFromPath(toolName: string): Promise<string | null> {
  const pathEnv = process.env.PATH?.trim();
  if (!pathEnv) {
    return null;
  }

  const searchDirs = pathEnv
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);

  if (process.platform === 'win32') {
    const hasExtension = /\.[^./\\]+$/.test(toolName);
    const extensions = hasExtension
      ? ['']
      : (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .map((entry) => entry.trim())
          .filter(Boolean);

    for (const directory of searchDirs) {
      for (const extension of extensions) {
        const candidate = path.join(directory, hasExtension ? toolName : `${toolName}${extension.toLowerCase()}`);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  for (const directory of searchDirs) {
    const candidate = path.join(directory, toolName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
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
      resolvedToolPaths.set('hdc', { path: hdcPath, source: 'config' });
      vscode.window.showInformationMessage(`HDC path saved: ${hdcPath}`);
      return hdcPath;
    }
  } else if (action === 'Open Settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'harmony.hdcPath');
  }

  return null;
}

export function clearResolvedToolPathCache(
  toolName?: HarmonyToolName,
  source?: ResolvedToolPathEntry['source'],
): void {
  if (!toolName) {
    resolvedToolPaths.clear();
    return;
  }

  const cached = resolvedToolPaths.get(toolName);
  if (!cached) {
    return;
  }

  if (!source || cached.source === source) {
    resolvedToolPaths.delete(toolName);
  }
}

export function registerToolPathCacheInvalidation(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      event.affectsConfiguration('harmony.sdkPath')
      || event.affectsConfiguration('harmony.sdkSearchPaths')
      || event.affectsConfiguration('harmony.hdcPath')
      || event.affectsConfiguration('harmony.commandLineToolsSearchPaths')
      || event.affectsConfiguration('harmony.hvigorPath')
      || event.affectsConfiguration('harmony.emulatorPath')
      || event.affectsConfiguration('harmony.emulatorSearchPaths')
      || event.affectsConfiguration('harmony.devEcoStudioSearchPaths')
    ) {
      clearResolvedToolPathCache();
    }
  });
}
