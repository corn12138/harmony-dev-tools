import * as vscode from 'vscode';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { listConnectedDevices } from './devices';
import { findBuiltHapFiles, readBundleName, readEntryAbility } from '../utils/projectMetadata';
import { buildHdcTargetArgs, execHdc } from '../utils/hdc';

export async function runOnDevice(): Promise<void> {
  const devices = await listConnectedDevices();
  if (devices.length === 0) {
    vscode.window.showWarningMessage('No HarmonyOS devices connected. Please connect a device via USB or WiFi.');
    return;
  }

  const selected = devices.length === 1
    ? devices[0]
    : await vscode.window.showQuickPick(
        devices.map((d) => ({ label: d.id, description: d.status, device: d })),
        { placeHolder: 'Select a device' }
      ).then((pick) => pick?.device);

  if (!selected) return;

  // Find a HAP to install
  const folder = getPreferredWorkspaceFolder();
  const hapFiles = folder ? await findBuiltHapFiles(folder.uri) : [];
  if (hapFiles.length === 0) {
    const action = await vscode.window.showWarningMessage(
      'No HAP found. Build the project first.',
      'Build & Run'
    );
    if (action === 'Build & Run') {
      vscode.commands.executeCommand('harmony.buildAndRun');
    }
    return;
  }

  // Pick HAP (prefer signed)
  const sorted = hapFiles.sort((a, b) => {
    if (a.fsPath.includes('signed') && !b.fsPath.includes('signed')) return -1;
    if (!a.fsPath.includes('signed') && b.fsPath.includes('signed')) return 1;
    return 0;
  });
  const hapPath = sorted[0].fsPath;

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS' },
      async (progress) => {
        progress.report({ message: `Installing to ${selected.id}...` });
        await execHdc([...buildHdcTargetArgs(selected.id), 'install', hapPath], { timeout: 30_000 });
        progress.report({ message: 'Launching app...' });

        // Read bundleName to launch
        if (folder) {
          try {
            const [bundleName, abilityName] = await Promise.all([
              readBundleName(folder.uri),
              readEntryAbility(folder.uri),
            ]);
            if (bundleName) {
              await execHdc(
                [...buildHdcTargetArgs(selected.id), 'shell', `aa start -a ${abilityName || 'EntryAbility'} -b ${bundleName}`],
                { timeout: 10_000 }
              );
            }
          } catch { /* launch is best-effort */ }
        }
      }
    );
    vscode.window.showInformationMessage(`App running on ${selected.id}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Run failed: ${err}`);
  }
}

export async function refreshDevices(): Promise<void> {
  const devices = await listConnectedDevices();
  vscode.window.showInformationMessage(`Found ${devices.length} device(s): ${devices.map((d) => d.id).join(', ') || 'none'}`);
}

export async function installHap(): Promise<void> {
  const hapFile = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { 'HAP Package': ['hap'] },
    openLabel: 'Select HAP file',
  });
  if (!hapFile?.length) return;

  const devices = await listConnectedDevices();
  if (devices.length === 0) {
    vscode.window.showWarningMessage('No devices connected.');
    return;
  }

  const selected = devices.length === 1
    ? devices[0]
    : await vscode.window.showQuickPick(
        devices.map((device) => ({
          label: device.name,
          description: device.id,
          device,
        })),
        { placeHolder: 'Select a device' }
      ).then((pick) => pick?.device);

  if (!selected) return;

  try {
    await execHdc([...buildHdcTargetArgs(selected.id), 'install', hapFile[0].fsPath]);
    vscode.window.showInformationMessage(`HAP installed on ${selected.id}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Install failed: ${err}`);
  }
}
