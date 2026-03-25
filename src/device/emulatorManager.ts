import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { buildHdcTargetArgs, execHdc, listHdcTargets } from '../utils/hdc';
import { shouldUseBatchShell } from '../utils/commandShell';
import {
  getDevEcoStudioSearchPaths,
  getEmulatorSearchPaths,
  getSdkPath,
  getSdkSearchPaths,
  resolveEmulatorPath,
} from '../utils/config';
import {
  getEmulatorDeployedRoots as getPlatformEmulatorDeployedRoots,
  getEmulatorImageRootCandidates,
  getEmulatorSearchDirs as getPlatformEmulatorSearchDirs,
} from '../utils/toolPaths';
import { setActiveDeviceId } from './devices';
import { COMMANDS } from '../utils/constants';
import { summarizeEmulatorLaunchFailure, type EmulatorLaunchFailure } from './emulatorSupport';

export interface EmulatorInfo {
  name: string;
  dir: string;
  platform: string;
  running: boolean;
  deviceId?: string;
  launchRoot?: string;
  imageRoot?: string;
}

export interface EnsureEmulatorTargetOptions {
  preferredName?: string;
  forcePick?: boolean;
  waitForShellReady?: boolean;
}

export interface EnsuredEmulatorTarget {
  emulatorName: string;
  deviceId: string;
  launchedNow: boolean;
}

let runningProcess: ChildProcess | undefined;
let runningEmulatorSession: { name: string; deviceId?: string } | undefined;
let ensureTargetPromise: Promise<EnsuredEmulatorTarget | undefined> | undefined;
let emulatorOutputChannel: vscode.OutputChannel | undefined;
const execFileAsync = promisify(execFile);
const FALLBACK_EMULATOR_ARGS = ['-hvd'];

export function isEmulatorTarget(target: string): boolean {
  return target.includes('127.0.0.1') || target.includes('localhost') || target.includes('emulator');
}

/**
 * Detect installed DevEco Studio emulator images across platforms.
 */
export function detectEmulators(): EmulatorInfo[] {
  const emulators: EmulatorInfo[] = [];
  const dirs = getEmulatorSearchDirs();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const emuDir = path.join(dir, entry.name);
        const configFile = path.join(emuDir, 'config.ini');
        const hasConfig = fs.existsSync(configFile);
        const hasImages = fs.existsSync(path.join(emuDir, 'system.img')) ||
                          fs.existsSync(path.join(emuDir, 'data'));

        if (hasConfig || hasImages) {
          let platform = 'unknown';
          if (hasConfig) {
            try {
              const config = fs.readFileSync(configFile, 'utf8');
              const platMatch = config.match(/hw\.cpu\.arch\s*=\s*(\S+)/);
              if (platMatch) platform = platMatch[1];
            } catch { /* ignore */ }
          }

          const launchMetadata = resolveEmulatorLaunchMetadata({
            name: entry.name,
            dir: emuDir,
          });

          emulators.push({
            name: entry.name,
            dir: emuDir,
            platform,
            running: false,
            deviceId: undefined,
            launchRoot: launchMetadata.launchRoot,
            imageRoot: launchMetadata.imageRoot,
          });
        }
      }
    } catch { /* skip inaccessible directories */ }
  }

  return emulators;
}

export function parseListedEmulators(stdout: string): EmulatorInfo[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((name) => ({
      name,
      dir: '',
      platform: 'unknown',
      running: false,
      deviceId: undefined,
    }));
}

export function getEmulatorLaunchArgs(emulator: EmulatorInfo): string[] {
  if (emulator.launchRoot && emulator.imageRoot) {
    return [
      ...FALLBACK_EMULATOR_ARGS,
      emulator.name,
      '-path',
      emulator.launchRoot,
      '-imageRoot',
      emulator.imageRoot,
    ];
  }

  return [...FALLBACK_EMULATOR_ARGS, emulator.name];
}

async function detectEmulatorsWithFallback(): Promise<EmulatorInfo[]> {
  const detected = detectEmulators();
  if (detected.length > 0) {
    return detected;
  }

  const binary = await findEmulatorBinary();
  if (!binary) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(binary, ['-list'], {
      timeout: 5000,
      shell: shouldUseBatchShell(binary),
      encoding: 'utf8',
    });
    return parseListedEmulators(stdout);
  } catch {
    return [];
  }
}

function getEmulatorSearchDirs(): string[] {
  return getPlatformEmulatorSearchDirs({
    platform: process.platform,
    env: process.env,
    emulatorSearchPaths: getEmulatorSearchPaths(),
  });
}

function getEmulatorDeployedRoots(): string[] {
  return getPlatformEmulatorDeployedRoots({
    platform: process.platform,
    env: process.env,
    emulatorSearchPaths: getEmulatorSearchPaths(),
  });
}

/**
 * Find the emulator executable binary.
 */
function findEmulatorBinary(): Promise<string | null> {
  return resolveEmulatorPath();
}

interface EmulatorLaunchDetails {
  binary: string;
  args: string[];
  launchRoot?: string;
  imageRoot?: string;
  diagnostics: string[];
}

function resolveEmulatorLaunch(binary: string, emulator: EmulatorInfo): EmulatorLaunchDetails {
  const hydrated = hydrateEmulatorLaunchMetadata(emulator);
  const normalizedBinary = normalizeEmulatorBinary(binary);
  const diagnostics: string[] = [];

  if (hydrated.launchRoot && hydrated.imageRoot) {
    diagnostics.push('使用 DevEco 实例元数据启动模拟器。');
    return {
      binary: normalizedBinary,
      args: getEmulatorLaunchArgs(hydrated),
      launchRoot: hydrated.launchRoot,
      imageRoot: hydrated.imageRoot,
      diagnostics,
    };
  }

  if (hydrated.launchRoot && !hydrated.imageRoot) {
    diagnostics.push('已找到模拟器实例目录，但未解析到 imageRoot；回退为仅使用 -hvd 启动。');
  } else if (!hydrated.launchRoot && hydrated.dir) {
    diagnostics.push('未解析到模拟器 deployed 根目录；回退为仅使用 -hvd 启动。');
  }

  return {
    binary: normalizedBinary,
    args: getEmulatorLaunchArgs(hydrated),
    launchRoot: hydrated.launchRoot,
    imageRoot: hydrated.imageRoot,
    diagnostics,
  };
}

function hydrateEmulatorLaunchMetadata(emulator: EmulatorInfo): EmulatorInfo {
  if (emulator.launchRoot && emulator.imageRoot) {
    return emulator;
  }

  return {
    ...emulator,
    ...resolveEmulatorLaunchMetadata(emulator),
  };
}

function resolveEmulatorLaunchMetadata(
  emulator: Pick<EmulatorInfo, 'name' | 'dir'>,
): Pick<EmulatorInfo, 'launchRoot' | 'imageRoot'> {
  const metadataFromDir = readLaunchMetadataFromInstanceDir(emulator.dir);
  if (metadataFromDir.launchRoot && metadataFromDir.imageRoot) {
    return metadataFromDir;
  }

  const deployedRoots = collectDeployedRootCandidates(emulator.dir);
  const metadataFromLists = findLaunchMetadataInLists(emulator.name, deployedRoots);
  if (metadataFromLists.launchRoot && metadataFromLists.imageRoot) {
    return metadataFromLists;
  }

  return {
    launchRoot: metadataFromDir.launchRoot ?? metadataFromLists.launchRoot,
    imageRoot: metadataFromDir.imageRoot ?? metadataFromLists.imageRoot,
  };
}

function normalizeEmulatorBinary(binary: string): string {
  if (process.platform !== 'darwin') {
    return binary;
  }

  const canonical = path.join(path.dirname(binary), 'Emulator');
  return fs.existsSync(canonical) ? canonical : binary;
}

function collectDeployedRootCandidates(emulatorDir: string): string[] {
  const candidates: string[] = [];
  if (emulatorDir) {
    candidates.push(path.dirname(emulatorDir));
  }
  candidates.push(...getEmulatorDeployedRoots());
  return uniqueExistingDirectories(candidates);
}

function readLaunchMetadataFromInstanceDir(
  emulatorDir: string,
): Pick<EmulatorInfo, 'launchRoot' | 'imageRoot'> {
  if (!emulatorDir) {
    return {};
  }

  const config = readEmulatorConfig(path.join(emulatorDir, 'config.ini'));
  if (!config) {
    return {};
  }

  const instancePath = resolveExistingDirectory(config.instancePath, emulatorDir);
  const launchRoot = resolveExistingDirectory(
    instancePath ? path.dirname(instancePath) : undefined,
    path.dirname(emulatorDir),
  );
  const imageRoot = resolveImageRoot(config.imageSubPath);

  return {
    launchRoot,
    imageRoot,
  };
}

function findLaunchMetadataInLists(
  emulatorName: string,
  deployedRoots: string[],
): Pick<EmulatorInfo, 'launchRoot' | 'imageRoot'> {
  for (const deployedRoot of deployedRoots) {
    const listsPath = path.join(deployedRoot, 'lists.json');
    if (!fs.existsSync(listsPath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(listsPath, 'utf8')) as Array<{
        name?: string;
        path?: string;
        imageDir?: string;
      }>;
      const record = parsed.find((entry) => entry.name === emulatorName || path.basename(entry.path ?? '') === emulatorName);
      if (!record) {
        continue;
      }

      const launchRoot = resolveExistingDirectory(
        record.path ? path.dirname(record.path) : undefined,
        deployedRoot,
      );
      const imageRoot = resolveImageRoot(record.imageDir);
      if (launchRoot || imageRoot) {
        return { launchRoot, imageRoot };
      }
    } catch {
      // ignore malformed lists.json and continue searching
    }
  }

  return {};
}

function readEmulatorConfig(configPath: string): Record<string, string> | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  try {
    const config: Record<string, string> = {};
    const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key) {
        config[key] = value;
      }
    }
    return config;
  } catch {
    return undefined;
  }
}

function resolveImageRoot(imageSubPath: string | undefined): string | undefined {
  if (!imageSubPath) {
    return undefined;
  }

  for (const candidate of getEmulatorImageRootCandidates({
    platform: process.platform,
    env: process.env,
    sdkPath: getSdkPath(),
    sdkSearchPaths: getSdkSearchPaths(),
    devEcoStudioSearchPaths: getDevEcoStudioSearchPaths(),
  })) {
    if (fs.existsSync(path.join(candidate, imageSubPath))) {
      return candidate;
    }
  }

  return undefined;
}

function resolveExistingDirectory(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return undefined;
}

function uniqueExistingDirectories(candidates: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }
    try {
      if (!fs.statSync(candidate).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    const normalized = path.normalize(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(candidate);
    }
  }

  return results;
}

export async function launchEmulator(preferredName?: string): Promise<EnsuredEmulatorTarget | undefined> {
  const target = await ensureEmulatorTarget({
    preferredName,
    forcePick: !preferredName,
    waitForShellReady: false,
  });

  if (!target) {
    return undefined;
  }

  void vscode.window.showInformationMessage(
    `Emulator "${target.emulatorName}" is running.`,
    'Open Device Mirror',
  ).then((action) => {
    if (action === 'Open Device Mirror') {
      void vscode.commands.executeCommand(COMMANDS.DEVICE_MIRROR, target.deviceId);
    }
  });

  return target;
}

export async function ensureEmulatorTarget(
  options: EnsureEmulatorTargetOptions = {},
): Promise<EnsuredEmulatorTarget | undefined> {
  if (ensureTargetPromise) {
    return ensureTargetPromise;
  }

  ensureTargetPromise = ensureEmulatorTargetInternal(options).finally(() => {
    ensureTargetPromise = undefined;
  });
  return ensureTargetPromise;
}

async function ensureEmulatorTargetInternal(
  options: EnsureEmulatorTargetOptions,
): Promise<EnsuredEmulatorTarget | undefined> {
  const emulators = await getEmulatorStatus();
  if (emulators.length === 0) {
    await showMissingEmulatorsMessage();
    return undefined;
  }

  const selected = await selectEmulatorForTarget(emulators, options);
  if (!selected) {
    return undefined;
  }

  const hintedRunningTarget = await tryAlreadyRunningTargetHint(resolveLoopbackEmulatorTargetHint(selected));
  if (hintedRunningTarget) {
    finalizeEmulatorTarget(selected.name, hintedRunningTarget);
    return {
      emulatorName: selected.name,
      deviceId: hintedRunningTarget,
      launchedNow: false,
    };
  }

  if (selected.running && selected.deviceId) {
    if (options.waitForShellReady !== false) {
      const shellReady = await waitForDeviceShellReady(selected.deviceId);
      if (!shellReady) {
        vscode.window.showErrorMessage(
          `Emulator "${selected.name}" is online in HDC, but shell did not become ready within 45 seconds.`,
        );
        return undefined;
      }
    }

    finalizeEmulatorTarget(selected.name, selected.deviceId);
    return {
      emulatorName: selected.name,
      deviceId: selected.deviceId,
      launchedNow: false,
    };
  }

  const launchReadyEmulator = hydrateEmulatorLaunchMetadata(selected);

  const binary = await findEmulatorBinary();
  if (!binary) {
    const configured = await promptManualEmulatorConfiguration();
    if (!configured) {
      return undefined;
    }
    return startEmulatorProcess(configured, launchReadyEmulator, options);
  }

  return startEmulatorProcess(binary, launchReadyEmulator, options);
}

async function startEmulatorProcess(
  binary: string,
  emulator: EmulatorInfo,
  options: EnsureEmulatorTargetOptions,
): Promise<EnsuredEmulatorTarget | undefined> {
  try {
    const launch = resolveEmulatorLaunch(binary, emulator);
    const outputChannel = getEmulatorOutputChannel();
    const baselineTargets: string[] = await listHdcTargets(3000).catch(() => []);
    runningEmulatorSession = { name: emulator.name };
    let detectedTarget: string | undefined;
    let launchFailure: EmulatorLaunchFailure | undefined;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let alreadyRunningHint = false;
    let alreadyRunningTargetHint: string | undefined;
    const captureAlreadyRunningHint = () => {
      const alreadyRunning = isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer);
      alreadyRunningHint = alreadyRunningHint || alreadyRunning;
      if (alreadyRunningHint && !alreadyRunningTargetHint) {
        alreadyRunningTargetHint = resolveLoopbackEmulatorTargetHint(emulator);
      }
    };
    const flushLaunchOutput = async () => {
      await sleep(250);
      captureAlreadyRunningHint();
    };

    outputChannel.clear();
    outputChannel.appendLine(`[cmd] ${launch.binary} ${launch.args.join(' ')}`);
    outputChannel.appendLine(`[emulator] ${emulator.name}`);
    if (emulator.dir) {
      outputChannel.appendLine(`[image] ${emulator.dir}`);
    }
    if (launch.launchRoot) {
      outputChannel.appendLine(`[launchRoot] ${launch.launchRoot}`);
    }
    if (launch.imageRoot) {
      outputChannel.appendLine(`[imageRoot] ${launch.imageRoot}`);
    }
    for (const detail of launch.diagnostics) {
      outputChannel.appendLine(`[diagnostic] ${detail}`);
    }
    outputChannel.appendLine('');

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS', cancellable: true },
      async (progress, token) => {
        progress.report({ message: `Starting emulator "${emulator.name}"...` });

        runningProcess = spawn(launch.binary, launch.args, {
          shell: shouldUseBatchShell(launch.binary),
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        runningProcess.stdout?.on('data', (chunk) => {
          const text = chunkToString(chunk);
          stdoutBuffer = appendLaunchBuffer(stdoutBuffer, text);
          captureAlreadyRunningHint();
          if (text.trim()) {
            outputChannel.appendLine(`[stdout] ${text.trimEnd()}`);
          }
        });
        runningProcess.stderr?.on('data', (chunk) => {
          const text = chunkToString(chunk);
          stderrBuffer = appendLaunchBuffer(stderrBuffer, text);
          captureAlreadyRunningHint();
          if (text.trim()) {
            outputChannel.appendLine(`[stderr] ${text.trimEnd()}`);
          }
        });
        runningProcess.on('error', (err) => {
          launchFailure = {
            emulatorName: emulator.name,
            binaryPath: launch.binary,
            message: err.message,
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
            platform: process.platform,
          };
        });

        runningProcess.on('exit', (code) => {
          const alreadyRunning = alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer);
          if (code !== 0 && code !== null && !alreadyRunning) {
            launchFailure = {
              emulatorName: emulator.name,
              binaryPath: launch.binary,
              code,
              stdout: stdoutBuffer,
              stderr: stderrBuffer,
              platform: process.platform,
            };
          }
          runningProcess = undefined;
          if (runningEmulatorSession?.name === emulator.name) {
            runningEmulatorSession = undefined;
          }
        });

        for (let i = 0; i < 30; i++) {
          if (token.isCancellationRequested) {
            runningProcess?.kill();
            runningProcess = undefined;
            runningEmulatorSession = undefined;
            return;
          }
          if (!runningProcess) {
            await flushLaunchOutput();
            if (alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer) || alreadyRunningTargetHint) {
              try {
                const hintedTarget = await tryAlreadyRunningTargetHint(alreadyRunningTargetHint, outputChannel);
                if (hintedTarget) {
                  detectedTarget = hintedTarget;
                  progress.report({ message: 'Emulator already running, reusing hinted HDC target...' });
                  return;
                }
                const existingTarget = await waitForExistingEmulatorTarget(
                  emulator,
                  outputChannel,
                  15_000,
                  alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer),
                );
                if (existingTarget) {
                  detectedTarget = existingTarget;
                  progress.report({ message: 'Emulator already running, reusing HDC target...' });
                  return;
                }
              } catch {
                // keep waiting below; HDC may not have caught up yet
              }
              await sleep(2000);
              continue;
            }
            if (!launchFailure) {
              launchFailure = {
                emulatorName: emulator.name,
                binaryPath: launch.binary,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                platform: process.platform,
              };
            }
            return;
          }
          await sleep(2000);
          if (!runningProcess) {
            await flushLaunchOutput();
            if (alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer) || alreadyRunningTargetHint) {
              try {
                const hintedTarget = await tryAlreadyRunningTargetHint(alreadyRunningTargetHint, outputChannel);
                if (hintedTarget) {
                  detectedTarget = hintedTarget;
                  progress.report({ message: 'Emulator already running, reusing hinted HDC target...' });
                  return;
                }
                const existingTarget = await waitForExistingEmulatorTarget(
                  emulator,
                  outputChannel,
                  15_000,
                  alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer),
                );
                if (existingTarget) {
                  detectedTarget = existingTarget;
                  progress.report({ message: 'Emulator already running, reusing HDC target...' });
                  return;
                }
              } catch {
                // keep falling through to the normal failure path
              }
            }
            if (!launchFailure) {
              launchFailure = {
                emulatorName: emulator.name,
                binaryPath: launch.binary,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                platform: process.platform,
              };
            }
            return;
          }
          try {
            const onlineTargets = await listHdcTargets(3000);
            const emulatorTarget = resolveLaunchedEmulatorTarget(baselineTargets, onlineTargets)
              ?? await resolveExistingEmulatorTarget(
                emulator,
                onlineTargets,
                alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer),
              );

            if (emulatorTarget) {
              if (options.waitForShellReady !== false) {
                progress.report({ message: 'Emulator online, waiting for shell...' });
                const shellReady = await waitForDeviceShellReady(emulatorTarget);
                if (!shellReady) {
                  vscode.window.showErrorMessage(
                    `Emulator "${emulator.name}" is online in HDC, but shell did not become ready within 45 seconds.`,
                  );
                  return;
                }
              }

              detectedTarget = emulatorTarget;
              progress.report({ message: 'Emulator online!' });
              return;
            }
          } catch { /* keep waiting */ }
        }

        vscode.window.showWarningMessage(
          'Emulator started but device not detected via HDC. It may still be booting.'
        );
      }
    );

    await flushLaunchOutput();
    if (!detectedTarget) {
      const hintedTarget = await tryAlreadyRunningTargetHint(alreadyRunningTargetHint, outputChannel);
      if (hintedTarget) {
        finalizeEmulatorTarget(emulator.name, hintedTarget);
        return {
          emulatorName: emulator.name,
          deviceId: hintedTarget,
          launchedNow: false,
        };
      }
      detectedTarget = await waitForExistingEmulatorTarget(
        emulator,
        outputChannel,
        5_000,
        alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer),
      );
      if (detectedTarget) {
        finalizeEmulatorTarget(emulator.name, detectedTarget);
        return {
          emulatorName: emulator.name,
          deviceId: detectedTarget,
          launchedNow: false,
        };
      }
    }

    if (!detectedTarget) {
      if (launchFailure) {
        outputChannel.show();
        presentEmulatorLaunchFailure(launchFailure, outputChannel);
      }
      return undefined;
    }

    finalizeEmulatorTarget(emulator.name, detectedTarget);
    return {
      emulatorName: emulator.name,
      deviceId: detectedTarget,
      launchedNow: !(alreadyRunningHint || isAlreadyRunningLaunchOutput(stdoutBuffer, stderrBuffer)),
    };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start emulator: ${err}`);
    return undefined;
  }
}

export async function stopEmulator(): Promise<void> {
  if (runningProcess) {
    runningProcess.kill();
    runningProcess = undefined;
    runningEmulatorSession = undefined;
    vscode.window.showInformationMessage('Emulator process terminated.');
    return;
  }

  vscode.window.showInformationMessage('No emulator process launched by the extension is currently running.');
}

/**
 * Get a list of emulators with their running status for the TreeView.
 */
export async function getEmulatorStatus(): Promise<EmulatorInfo[]> {
  const emulators = await detectEmulatorsWithFallback();

  let onlineDevices: string[] = [];
  try {
    onlineDevices = await listHdcTargets(3000);
  } catch { /* ignore */ }

  const onlineEmulators = onlineDevices.filter(isEmulatorTarget);
  const onlineEmulatorNames = onlineEmulators.length > 1
    ? await resolveOnlineEmulatorNames(onlineEmulators)
    : new Map<string, string>();
  const preferredDeviceId = runningEmulatorSession?.deviceId && onlineEmulators.includes(runningEmulatorSession.deviceId)
    ? runningEmulatorSession.deviceId
    : (onlineEmulators.length === 1 ? onlineEmulators[0] : undefined);

  for (const emu of emulators) {
    if (runningEmulatorSession?.name === emu.name && preferredDeviceId) {
      emu.running = true;
      emu.deviceId = preferredDeviceId;
      continue;
    }

    if (!runningEmulatorSession && emulators.length === 1 && onlineEmulators.length === 1) {
      emu.running = true;
      emu.deviceId = onlineEmulators[0];
      continue;
    }

    const matchedByBridgePort = resolveExistingEmulatorTargetByBridgePort(emu, onlineEmulators);
    if (matchedByBridgePort) {
      emu.running = true;
      emu.deviceId = matchedByBridgePort;
      continue;
    }

    const matchedTarget = findNamedOnlineEmulatorTarget(emu.name, onlineEmulatorNames);
    if (matchedTarget) {
      emu.running = true;
      emu.deviceId = matchedTarget;
      continue;
    }

    emu.running = false;
    emu.deviceId = undefined;
  }

  return emulators;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getEmulatorOutputChannel(): vscode.OutputChannel {
  if (!emulatorOutputChannel) {
    emulatorOutputChannel = vscode.window.createOutputChannel('HarmonyOS Emulator');
  }
  return emulatorOutputChannel;
}

async function selectEmulatorForTarget(
  emulators: EmulatorInfo[],
  options: EnsureEmulatorTargetOptions,
): Promise<EmulatorInfo | undefined> {
  const selectedByName = options.preferredName
    ? emulators.find((emulator) => emulator.name === options.preferredName)
    : undefined;
  if (selectedByName) {
    return selectedByName;
  }

  if (options.preferredName) {
    vscode.window.showWarningMessage(`Emulator not found: ${options.preferredName}`);
    return undefined;
  }

  const onlineTargets = await listHdcTargets(3000).catch(() => []);
  const runningEmulators = emulators.filter((emulator) => emulator.running && emulator.deviceId);
  if (!options.forcePick && runningEmulators.length === 1 && onlineTargets.length === 1) {
    return runningEmulators[0];
  }

  if (!options.forcePick && emulators.length === 1) {
    return emulators[0];
  }

  const sorted = [...emulators].sort((left, right) => {
    if (left.running !== right.running) {
      return left.running ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  const picked = await vscode.window.showQuickPick(
    sorted.map((emulator) => ({
      label: emulator.name,
      description: emulator.running
        ? `Running${emulator.deviceId ? ` · ${emulator.deviceId}` : ''}`
        : `Stopped · ${emulator.platform}`,
      detail: emulator.dir || undefined,
      emulator,
    })),
    { placeHolder: 'Select an emulator to launch and run on' },
  );

  return picked?.emulator;
}

function resolveLaunchedEmulatorTarget(
  baselineTargets: string[],
  onlineTargets: string[],
): string | undefined {
  const newEmulators = onlineTargets
    .filter((target) => !baselineTargets.includes(target))
    .filter(isEmulatorTarget);
  if (newEmulators.length === 1) {
    return newEmulators[0];
  }

  const allEmulators = onlineTargets.filter(isEmulatorTarget);
  return allEmulators.length === 1 ? allEmulators[0] : undefined;
}

async function resolveOnlineEmulatorNames(targets: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  await Promise.all(targets.map(async (target) => {
    try {
      const { stdout } = await execHdc(
        [...buildHdcTargetArgs(target), 'shell', 'param', 'get', 'const.product.model'],
        { timeout: 5000 },
      );
      const name = stdout.trim();
      if (name) {
        resolved.set(target, name);
      }
    } catch {
      // ignore targets that cannot report a model name yet
    }
  }));

  return resolved;
}

function findNamedOnlineEmulatorTarget(
  emulatorName: string,
  onlineNames: Map<string, string>,
): string | undefined {
  for (const [target, name] of onlineNames.entries()) {
    if (name === emulatorName) {
      return target;
    }
  }

  return undefined;
}

function resolveExistingEmulatorTargetByBridgePort(
  emulator: Pick<EmulatorInfo, 'dir'>,
  onlineTargets: string[],
): string | undefined {
  const port = readEmulatorBridgePort(emulator.dir);
  if (!port) {
    return undefined;
  }

  return onlineTargets.find((target) => {
    const normalized = target.replace(/^::ffff:/, '');
    return (normalized.startsWith('127.0.0.1:') || normalized.startsWith('localhost:'))
      && normalized.endsWith(`:${port}`);
  });
}

function readEmulatorBridgePort(emulatorDir: string): string | undefined {
  if (!emulatorDir) {
    return undefined;
  }

  const candidates = [
    path.join(emulatorDir, 'qemu.log'),
    path.join(emulatorDir, 'Log', 'qemu.log'),
  ]
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({ path: candidate, mtimeMs: fs.statSync(candidate).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const candidate of candidates) {
    try {
      const port = extractLastBridgePort(fs.readFileSync(candidate.path, 'utf8'));
      if (port) {
        return port;
      }
    } catch {
      // ignore unreadable logs and continue
    }
  }

  return undefined;
}

function extractLastBridgePort(contents: string): string | undefined {
  const matches = [...contents.matchAll(/listen bridge socket port\s+(\d+)/gi)];
  return matches.length > 0 ? matches[matches.length - 1]?.[1] : undefined;
}

function resolveLoopbackEmulatorTargetHint(emulator: Pick<EmulatorInfo, 'dir'>): string | undefined {
  const port = readEmulatorBridgePort(emulator.dir);
  return port ? `127.0.0.1:${port}` : undefined;
}

async function tryAlreadyRunningTargetHint(
  targetHint: string | undefined,
  outputChannel?: vscode.OutputChannel,
): Promise<string | undefined> {
  if (!targetHint) {
    return undefined;
  }

  outputChannel?.appendLine(`[diagnostic] Reuse probe hinted target: ${targetHint}`);
  console.info(`[HarmonyOS Emulator] reuse probe hinted target: ${targetHint}`);
  const shellReady = await waitForDeviceShellReady(targetHint, 10_000);
  if (!shellReady) {
    outputChannel?.appendLine(`[diagnostic] Reuse probe hinted target not shell-ready: ${targetHint}`);
    console.warn(`[HarmonyOS Emulator] reuse probe hinted target not shell-ready: ${targetHint}`);
    return undefined;
  }

  outputChannel?.appendLine(`[diagnostic] Reuse probe shell-ready target: ${targetHint}`);
  console.info(`[HarmonyOS Emulator] reuse probe shell-ready target: ${targetHint}`);
  return targetHint;
}

async function resolveExistingEmulatorTarget(
  emulator: Pick<EmulatorInfo, 'name' | 'dir'>,
  onlineTargets: string[],
  preferNameLookup = true,
): Promise<string | undefined> {
  const emulatorTargets = onlineTargets.filter(isEmulatorTarget);
  if (emulatorTargets.length === 0) {
    return undefined;
  }

  const matchedByBridgePort = resolveExistingEmulatorTargetByBridgePort(emulator, emulatorTargets);
  if (matchedByBridgePort) {
    return matchedByBridgePort;
  }

  const onlineNames = await resolveOnlineEmulatorNames(emulatorTargets);
  const matchedByName = findNamedOnlineEmulatorTarget(emulator.name, onlineNames);
  if (matchedByName) {
    return matchedByName;
  }

  return emulatorTargets.length === 1 && !preferNameLookup
    ? emulatorTargets[0]
    : undefined;
}

async function waitForExistingEmulatorTarget(
  emulator: Pick<EmulatorInfo, 'name' | 'dir'>,
  outputChannel?: vscode.OutputChannel,
  timeoutMs = 15_000,
  preferNameLookup = true,
): Promise<string | undefined> {
  const startedAt = Date.now();
  const bridgePort = readEmulatorBridgePort(emulator.dir);
  if (bridgePort) {
    outputChannel?.appendLine(`[diagnostic] Reuse probe bridge port: ${bridgePort}`);
    console.info(`[HarmonyOS Emulator] reuse probe bridge port: ${bridgePort}`);
  }
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const onlineTargets = await listHdcTargets(3000);
      const emulatorTargets = onlineTargets.filter(isEmulatorTarget);
      outputChannel?.appendLine(
        `[diagnostic] Reuse probe HDC targets: ${emulatorTargets.join(', ') || '[none]'}`,
      );
      console.info(`[HarmonyOS Emulator] reuse probe HDC targets: ${emulatorTargets.join(', ') || '[none]'}`);
      const matched = await resolveExistingEmulatorTarget(emulator, onlineTargets, preferNameLookup);
      if (matched) {
        outputChannel?.appendLine(`[diagnostic] Reuse probe matched target: ${matched}`);
        console.info(`[HarmonyOS Emulator] reuse probe matched target: ${matched}`);
        return matched;
      }
    } catch (error) {
      outputChannel?.appendLine(
        `[diagnostic] Reuse probe HDC failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.warn(
        `[HarmonyOS Emulator] reuse probe HDC failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await sleep(2000);
  }

  return undefined;
}

function isAlreadyRunningLaunchOutput(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return combined.includes('the emulator already exists')
    || combined.includes('already exists')
    || combined.includes('already running');
}

async function waitForDeviceShellReady(deviceId: string, timeoutMs = 45_000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await execHdc([...buildHdcTargetArgs(deviceId), 'shell', 'pwd'], { timeout: 5000 });
      return true;
    } catch {
      await sleep(2000);
    }
  }

  return false;
}

function finalizeEmulatorTarget(emulatorName: string, deviceId: string): void {
  runningEmulatorSession = { name: emulatorName, deviceId };
  setActiveDeviceId(deviceId);
  void vscode.commands.executeCommand(COMMANDS.VIEW_DEVICES);
}

async function showMissingEmulatorsMessage(): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    'No emulator images found. Create one in DevEco Studio first (Tools > Device Manager > New Emulator).',
    'Open DevEco Studio Docs',
  );
  if (action === 'Open DevEco Studio Docs') {
    void vscode.env.openExternal(vscode.Uri.parse(
      'https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-emulator-create-0000001053466519',
    ));
  }
}

async function promptManualEmulatorConfiguration(): Promise<string | undefined> {
  const action = await vscode.window.showErrorMessage(
    'Emulator executable not found. Configure harmony.emulatorPath or make sure DevEco Studio is installed.',
    'Configure Manually',
  );
  if (action !== 'Configure Manually') {
    return undefined;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    openLabel: 'Select Emulator Executable',
  });
  if (!picked?.[0]) {
    return undefined;
  }

  await vscode.workspace.getConfiguration('harmony').update('emulatorPath', picked[0].fsPath, true);
  return picked[0].fsPath;
}

function presentEmulatorLaunchFailure(
  failure: EmulatorLaunchFailure,
  outputChannel: vscode.OutputChannel,
): void {
  const summary = summarizeEmulatorLaunchFailure(failure);
  for (const detail of summary.details) {
    outputChannel.appendLine(`[diagnostic] ${detail}`);
  }

  void vscode.window.showErrorMessage(
    summary.message,
    'Check Environment',
    'Open Emulator Log',
  ).then(async (action) => {
    if (action === 'Check Environment') {
      await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
      return;
    }

    if (action === 'Open Emulator Log') {
      outputChannel.show();
    }
  });
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  return Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
}

function appendLaunchBuffer(current: string, next: string): string {
  const combined = `${current}${next}`;
  return combined.length > 4096 ? combined.slice(combined.length - 4096) : combined;
}
