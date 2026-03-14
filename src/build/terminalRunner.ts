import * as vscode from 'vscode';
import { resolveHdcPath } from '../utils/config';
import { buildHvigorCommand } from '../utils/hvigor';
import { readBundleName, readEntryAbility } from '../utils/projectMetadata';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { listConnectedDevices, type ConnectedDevice } from '../device/devices';
import { buildHdcTargetArgs, buildHdcTerminalCommand, rawTerminalArg } from '../utils/hdc';

let buildTerminal: vscode.Terminal | undefined;

/**
 * Run the full build → install → launch workflow in a VS Code terminal
 * so users can see real-time output (hvigor logs, install progress, etc.)
 */
export async function terminalBuildAndRun(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const rootPath = folder.uri.fsPath;
  const [hdc, bundleName, abilityName, device] = await Promise.all([
    resolveHdcPath(),
    readBundleName(folder.uri),
    readEntryAbility(folder.uri),
    selectDevice(),
  ]);

  if (!device) {
    return;
  }

  if (!bundleName) {
    vscode.window.showErrorMessage('Cannot find bundleName in AppScope/app.json5');
    return;
  }

  if (buildTerminal) {
    buildTerminal.dispose();
  }

  buildTerminal = vscode.window.createTerminal({
    name: 'HarmonyOS Run',
    cwd: rootPath,
    iconPath: new vscode.ThemeIcon('rocket'),
    shellPath: process.platform === 'win32' ? 'powershell.exe' : undefined,
  });

  buildTerminal.show();

  const commands = process.platform === 'win32'
    ? buildPowerShellBuildAndRunCommand({
        hdc,
        deviceId: device.id,
        bundleName,
        abilityName: abilityName || 'EntryAbility',
      })
    : buildPosixBuildAndRunCommand({
        hdc,
        deviceId: device.id,
        bundleName,
        abilityName: abilityName || 'EntryAbility',
      });

  buildTerminal.sendText(commands, true);

  const disposable = vscode.window.onDidCloseTerminal((terminal) => {
    if (terminal === buildTerminal) {
      buildTerminal = undefined;
      disposable.dispose();
    }
  });
}

/**
 * Run only the launch step (skip build), assuming HAP is already installed.
 */
export async function terminalRunOnly(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    return;
  }

  const [hdc, bundleName, abilityName, device] = await Promise.all([
    resolveHdcPath(),
    readBundleName(folder.uri),
    readEntryAbility(folder.uri),
    selectDevice(),
  ]);

  if (!bundleName || !device) {
    if (!bundleName) {
      vscode.window.showErrorMessage('Cannot find bundleName');
    }
    return;
  }

  const terminal = createUtilityTerminal('HarmonyOS Launch', folder.uri.fsPath, 'debug-start');
  terminal.sendText(buildLaunchCommand({
    hdc,
    deviceId: device.id,
    bundleName,
    abilityName: abilityName || 'EntryAbility',
  }), true);
}

/**
 * Stop the running app on device.
 */
export async function terminalStopApp(): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    return;
  }

  const [hdc, bundleName, device] = await Promise.all([
    resolveHdcPath(),
    readBundleName(folder.uri),
    selectDevice(),
  ]);

  if (!bundleName || !device) {
    return;
  }

  const terminal = vscode.window.activeTerminal
    ?? createUtilityTerminal('HarmonyOS', folder.uri.fsPath);
  terminal.sendText(buildStopCommand({ hdc, deviceId: device.id, bundleName }), true);
}

function createUtilityTerminal(
  name: string,
  cwd: string,
  iconId = 'terminal',
): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name,
    cwd,
    iconPath: new vscode.ThemeIcon(iconId),
    shellPath: process.platform === 'win32' ? 'powershell.exe' : undefined,
  });
  terminal.show();
  return terminal;
}

async function selectDevice(): Promise<ConnectedDevice | undefined> {
  const devices = await listConnectedDevices();
  if (devices.length === 0) {
    vscode.window.showWarningMessage('No HarmonyOS devices connected. Please connect a device first.');
    return undefined;
  }

  if (devices.length === 1) {
    return devices[0];
  }

  const pick = await vscode.window.showQuickPick(
    devices.map((device) => ({
      label: device.name,
      description: device.id,
      detail: device.status,
      device,
    })),
    { placeHolder: 'Select a device' },
  );

  return pick?.device;
}

function buildLaunchCommand(options: {
  hdc: string;
  deviceId: string;
  bundleName: string;
  abilityName: string;
}): string {
  const aaCommand = `aa start -a ${options.abilityName} -b ${options.bundleName}`;
  return buildHdcTerminalCommand(
    options.hdc,
    [...buildHdcTargetArgs(options.deviceId), 'shell', aaCommand],
  );
}

function buildStopCommand(options: {
  hdc: string;
  deviceId: string;
  bundleName: string;
}): string {
  const stopCommand = `aa force-stop ${options.bundleName}`;
  return buildHdcTerminalCommand(
    options.hdc,
    [...buildHdcTargetArgs(options.deviceId), 'shell', stopCommand],
  );
}

function buildPosixBuildAndRunCommand(options: {
  hdc: string;
  deviceId: string;
  bundleName: string;
  abilityName: string;
}): string {
  const platform = process.platform === 'win32' ? 'linux' : process.platform;
  const installCommand = buildHdcTerminalCommand(
    options.hdc,
    [...buildHdcTargetArgs(options.deviceId), 'install', rawTerminalArg('"$HAP_FILE"')],
    platform,
  );
  const launchCommand = buildLaunchCommand(options);

  return [
    'echo "========== HarmonyOS Build & Run =========="',
    'echo "[1/4] Building HAP..."',
    buildHvigorCommand({ task: 'assembleHap' }),
    'echo ""',
    'echo "[2/4] Locating HAP output..."',
    'SIGNED_HAP="$(find . -path "*/build/*/outputs/*/*signed*.hap" -type f | head -1)"',
    'HAP_FILE="${SIGNED_HAP:-$(find . -path "*/build/*/outputs/*/*.hap" -type f | head -1)}"',
    'if [ -z "$HAP_FILE" ]; then echo "ERROR: No .hap file found"; exit 1; fi',
    'echo "Found: $HAP_FILE"',
    'echo ""',
    'echo "[3/4] Installing to device..."',
    installCommand,
    'echo ""',
    `echo "[4/4] Launching ${options.bundleName}/${options.abilityName}..."`,
    launchCommand,
    'echo ""',
    'echo "========== App launched successfully =========="',
  ].join(' && ');
}

function buildPowerShellBuildAndRunCommand(options: {
  hdc: string;
  deviceId: string;
  bundleName: string;
  abilityName: string;
}): string {
  const installCommand = buildHdcTerminalCommand(
    options.hdc,
    [...buildHdcTargetArgs(options.deviceId), 'install', rawTerminalArg('$hap.FullName')],
    'win32',
  );
  const launchCommand = buildLaunchCommand(options);

  return [
    '$ErrorActionPreference = "Stop"',
    'Write-Host "========== HarmonyOS Build & Run =========="',
    'Write-Host "[1/4] Building HAP..."',
    '& .\\hvigorw.bat assembleHap --no-daemon',
    'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    'Write-Host ""',
    'Write-Host "[2/4] Locating HAP output..."',
    '$hap = Get-ChildItem -Path . -Recurse -Filter *.hap | Where-Object { $_.FullName -match "\\\\build\\\\" -and $_.FullName -match "\\\\outputs\\\\" } | Sort-Object @{ Expression = { $_.FullName -notmatch "signed" } }, FullName | Select-Object -First 1',
    'if (-not $hap) { Write-Error "No .hap file found"; exit 1 }',
    'Write-Host ("Found: " + $hap.FullName)',
    'Write-Host ""',
    'Write-Host "[3/4] Installing to device..."',
    installCommand,
    'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    'Write-Host ""',
    `Write-Host "[4/4] Launching ${options.bundleName}/${options.abilityName}..."`,
    launchCommand,
    'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    'Write-Host ""',
    'Write-Host "========== App launched successfully =========="',
  ].join('; ');
}
