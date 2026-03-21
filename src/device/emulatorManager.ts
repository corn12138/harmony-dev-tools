import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { listHdcTargets } from '../utils/hdc';

export interface EmulatorInfo {
  name: string;
  dir: string;
  platform: string;
  running: boolean;
  deviceId?: string;
}

let runningProcess: ChildProcess | undefined;
let runningEmulatorSession: { name: string; deviceId?: string } | undefined;
const execAsync = promisify(exec);

function isEmulatorTarget(target: string): boolean {
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

          emulators.push({
            name: entry.name,
            dir: emuDir,
            platform,
            running: false,
            deviceId: undefined,
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
  return ['-hvd', emulator.name];
}

async function detectEmulatorsWithFallback(): Promise<EmulatorInfo[]> {
  const detected = detectEmulators();
  if (detected.length > 0) {
    return detected;
  }

  const binary = findEmulatorBinary();
  if (!binary) {
    return [];
  }

  try {
    const { stdout } = await execAsync(`"${binary}" -list`, { timeout: 5000 });
    return parseListedEmulators(stdout);
  } catch {
    return [];
  }
}

function getEmulatorSearchDirs(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dirs: string[] = [];

  if (process.platform === 'darwin') {
    dirs.push(
      path.join(home, 'Library', 'Huawei', 'DevEcoStudio', 'emulator'),
      path.join(home, 'Library', 'Huawei', 'Sdk', 'hms', 'emulator'),
      path.join(home, '.DevEcoStudio', 'avd'),
      path.join(home, 'Library', 'OpenHarmony', 'emulator'),
    );
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    dirs.push(
      path.join(localAppData, 'Huawei', 'DevEcoStudio', 'emulator'),
      path.join(localAppData, 'Huawei', 'Sdk', 'hms', 'emulator'),
      path.join(home, '.DevEcoStudio', 'avd'),
      path.join(localAppData, 'OpenHarmony', 'emulator'),
    );
  } else {
    dirs.push(
      path.join(home, '.Huawei', 'DevEcoStudio', 'emulator'),
      path.join(home, '.DevEcoStudio', 'avd'),
      path.join(home, 'OpenHarmony', 'emulator'),
    );
  }

  return dirs;
}

/**
 * Find the emulator executable binary.
 */
function findEmulatorBinary(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/DevEco-Studio.app/Contents/tools/emulator/emulator',
      path.join(home, 'Library', 'Huawei', 'Sdk', 'hms', 'emulator', 'emulator'),
      path.join(home, 'Library', 'OpenHarmony', 'Sdk', 'emulator', 'emulator'),
    );
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.push(
      path.join(localAppData, 'Huawei', 'Sdk', 'hms', 'emulator', 'emulator.exe'),
      'C:\\Program Files\\Huawei\\DevEco Studio\\tools\\emulator\\emulator.exe',
    );
  } else {
    candidates.push(
      path.join(home, 'Huawei', 'Sdk', 'hms', 'emulator', 'emulator'),
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function launchEmulator(preferredName?: string): Promise<void> {
  const emulators = await detectEmulatorsWithFallback();

  if (emulators.length === 0) {
    const action = await vscode.window.showWarningMessage(
      'No emulator images found. Create one in DevEco Studio first (Tools > Device Manager > New Emulator).',
      'Open DevEco Studio Docs'
    );
    if (action) {
      vscode.env.openExternal(vscode.Uri.parse(
        'https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-emulator-create-0000001053466519'
      ));
    }
    return;
  }

  const selectedByName = preferredName
    ? emulators.find((emulator) => emulator.name === preferredName)
    : undefined;
  const selected = selectedByName ?? (emulators.length === 1
    ? emulators[0]
    : await vscode.window.showQuickPick(
        emulators.map(e => ({
          label: e.name,
          description: `${e.platform} — ${e.dir}`,
          emulator: e,
        })),
        { placeHolder: 'Select an emulator to launch' }
      ).then(pick => pick?.emulator));

  if (!selected) return;

  const binary = findEmulatorBinary();
  if (!binary) {
    const action = await vscode.window.showErrorMessage(
      'Emulator executable not found. Make sure DevEco Studio is installed.',
      'Configure Manually'
    );
    if (action) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        openLabel: 'Select Emulator Executable',
      });
      if (picked?.[0]) {
        await startEmulatorProcess(picked[0].fsPath, selected);
      }
    }
    return;
  }

  await startEmulatorProcess(binary, selected);
}

async function startEmulatorProcess(binary: string, emulator: EmulatorInfo): Promise<void> {
  try {
    if (runningProcess) {
      runningProcess.kill();
      runningProcess = undefined;
      runningEmulatorSession = undefined;
    }

    const baselineTargets: string[] = await listHdcTargets(3000).catch(() => []);
    runningEmulatorSession = { name: emulator.name };

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS', cancellable: true },
      async (progress, token) => {
        progress.report({ message: `Starting emulator "${emulator.name}"...` });

        runningProcess = spawn(binary, getEmulatorLaunchArgs(emulator), {
          stdio: 'ignore',
        });

        runningProcess.on('error', (err) => {
          vscode.window.showErrorMessage(`Emulator failed: ${err.message}`);
        });

        runningProcess.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            vscode.window.showWarningMessage(`Emulator exited with code ${code}`);
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
            vscode.window.showErrorMessage('Emulator process exited unexpectedly.');
            return;
          }
          await sleep(2000);
          try {
            const onlineTargets = await listHdcTargets(3000);
            const newTargets = onlineTargets.filter((target) => !baselineTargets.includes(target));
            const emulatorTarget = newTargets.find(isEmulatorTarget);

            if (emulatorTarget) {
              runningEmulatorSession = { name: emulator.name, deviceId: emulatorTarget };
              progress.report({ message: 'Emulator online!' });
              vscode.window.showInformationMessage(
                `Emulator "${emulator.name}" is running.`,
                'Open Device Mirror'
              ).then(action => {
                if (action) {
                  vscode.commands.executeCommand('harmony.openDeviceMirror', emulatorTarget);
                }
              });
              return;
            }
          } catch { /* keep waiting */ }
        }

        vscode.window.showWarningMessage(
          'Emulator started but device not detected via HDC. It may still be booting.'
        );
      }
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start emulator: ${err}`);
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

    emu.running = false;
    emu.deviceId = undefined;
  }

  return emulators;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
