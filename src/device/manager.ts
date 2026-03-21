import * as vscode from 'vscode';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { ensureConnectedDevice, explainDeviceConnectionIssue, getConnectedDeviceState } from './devices';
import { findBuiltHapFiles, readBundleName, readEntryAbility } from '../utils/projectMetadata';
import { buildHdcTargetArgs, execHdc } from '../utils/hdc';
import { quoteShellArg } from '../utils/shell';

export async function runOnDevice(): Promise<void> {
  const selected = await ensureConnectedDevice({ placeHolder: 'Select a device to run on' });

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
              const safeAbility = quoteShellArg(abilityName || 'EntryAbility');
              const safeBundle = quoteShellArg(bundleName);
              await execHdc(
                [...buildHdcTargetArgs(selected.id), 'shell', `aa start -a ${safeAbility} -b ${safeBundle}`],
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
  const state = await getConnectedDeviceState();
  if (state.error) {
    await explainDeviceConnectionIssue(state.error);
    return;
  }

  vscode.window.showInformationMessage(
    `Found ${state.devices.length} device(s): ${state.devices.map((device) => device.id).join(', ') || 'none'}`,
  );
}

export async function installHap(): Promise<void> {
  const hapFile = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { 'HAP Package': ['hap'] },
    openLabel: 'Select HAP file',
  });
  if (!hapFile?.length) return;

  const selected = await ensureConnectedDevice({ placeHolder: 'Select a device to install the HAP on' });

  if (!selected) return;

  try {
    await execHdc([...buildHdcTargetArgs(selected.id), 'install', hapFile[0].fsPath], { timeout: 30_000 });
    vscode.window.showInformationMessage(`HAP installed on ${selected.id}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Install failed: ${err}`);
  }
}
