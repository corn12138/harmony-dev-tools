import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promptHdcConfiguration } from '../utils/config';
import { buildHvigorCommand } from '../utils/hvigor';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { findBuiltHapFiles, readBundleName, readEntryAbility } from '../utils/projectMetadata';
import { buildHdcTargetArgs, execHdc, listHdcTargets } from '../utils/hdc';

const execAsync = promisify(exec);

interface BuildAndRunOptions {
  openInspector?: boolean;
}

/**
 * One-click workflow: Build HAP → Install to device → Launch app → (optionally) open UI Inspector
 */
export async function buildAndRun(options: BuildAndRunOptions = {}): Promise<void> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  // Step 1: Check device
  const device = await selectDevice();
  if (!device) return;

  // Step 2: Build HAP
  const hapPath = await buildHapWithProgress(folder);
  if (!hapPath) return;

  // Step 3: Install HAP
  const installed = await installHapToDevice(device, hapPath);
  if (!installed) return;

  // Step 4: Launch app
  const launched = await launchApp(device, folder.uri);
  if (!launched) return;

  // Step 5: Open UI Inspector (optional, default true)
  if (options.openInspector !== false) {
    // Small delay to let app render
    await new Promise((r) => setTimeout(r, 1500));
    vscode.commands.executeCommand('harmony.uiInspector');
  }

  vscode.window.showInformationMessage('App is running on device. UI Inspector opened.');
}

async function selectDevice(): Promise<string | null> {
  try {
    const devices = await listHdcTargets(5000);

    if (devices.length === 0) {
      vscode.window.showWarningMessage(
        'No HarmonyOS devices found. Connect a device via USB or start an emulator.',
        'Retry'
      ).then((action) => {
        if (action === 'Retry') vscode.commands.executeCommand('harmony.buildAndRun');
      });
      return null;
    }

    if (devices.length === 1) return devices[0];

    const picked = await vscode.window.showQuickPick(
      devices.map((d) => ({ label: d, description: 'online' })),
      { placeHolder: 'Select target device' }
    );
    return picked?.label ?? null;
  } catch {
    // HDC command failed — offer to configure it
    const configured = await promptHdcConfiguration();
    if (configured) {
      // Retry with the newly configured path
      return selectDevice();
    }
    return null;
  }
}

async function buildHapWithProgress(folder: vscode.WorkspaceFolder): Promise<string | null> {
  const rootPath = folder.uri.fsPath;

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS', cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Building HAP...' });

      try {
        const buildPromise = execAsync(buildHvigorCommand({ task: 'assembleHap' }), {
          cwd: rootPath,
          timeout: 120_000,
        });

        // Allow cancellation
        token.onCancellationRequested(() => {
          buildPromise.child?.kill();
        });

        const { stderr } = await buildPromise;

        if (token.isCancellationRequested) return null;

        // Check for build errors
        if (stderr && stderr.includes('ERROR')) {
          vscode.window.showErrorMessage(`Build failed:\n${stderr.slice(0, 500)}`);
          return null;
        }

        progress.report({ message: 'Locating HAP output...' });

        // Find the built HAP file
        const hapPath = await findHapOutput(folder);
        if (!hapPath) {
          vscode.window.showErrorMessage(
            'Build completed but no .hap file found. Check build output.'
          );
          return null;
        }

        return hapPath;
      } catch (err: unknown) {
        if (!token.isCancellationRequested) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Build failed: ${msg.slice(0, 300)}`);
        }
        return null;
      }
    }
  );
}

async function findHapOutput(folder: vscode.WorkspaceFolder): Promise<string | null> {
  const rootPath = folder.uri.fsPath;
  const hapFiles = await findBuiltHapFiles(folder.uri);

  if (hapFiles.length === 0) return null;

  // Prefer signed HAP, then most recently modified
  const sorted = hapFiles.sort((a, b) => {
    const aIsSigned = a.fsPath.includes('signed');
    const bIsSigned = b.fsPath.includes('signed');
    if (aIsSigned && !bIsSigned) return -1;
    if (!aIsSigned && bIsSigned) return 1;
    return 0;
  });

  if (sorted.length === 1) return sorted[0].fsPath;

  // Let user choose if multiple HAPs
  const picked = await vscode.window.showQuickPick(
    sorted.map((f) => ({
      label: path.basename(f.fsPath),
      description: path.relative(rootPath, f.fsPath),
      fsPath: f.fsPath,
    })),
    { placeHolder: 'Multiple HAP files found — select one to install' }
  );

  return picked?.fsPath ?? null;
}

async function installHapToDevice(device: string, hapPath: string): Promise<boolean> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS' },
    async (progress) => {
      progress.report({ message: `Installing to ${device}...` });
      try {
        await execHdc([...buildHdcTargetArgs(device), 'install', hapPath], { timeout: 30_000 });
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Install failed: ${msg.slice(0, 300)}`);
        return false;
      }
    }
  ) ?? false;
}

async function launchApp(device: string, rootUri: vscode.Uri): Promise<boolean> {
  const bundleName = await readBundleName(rootUri);
  if (!bundleName) {
    vscode.window.showErrorMessage(
      'Cannot find bundleName in AppScope/app.json5. Is this a HarmonyOS project?'
    );
    return false;
  }

  const abilityName = await readEntryAbility(rootUri);
  const fullAbility = abilityName || 'EntryAbility';

  try {
    // aa start -a <abilityName> -b <bundleName>
    await execHdc(
      [...buildHdcTargetArgs(device), 'shell', `aa start -a ${fullAbility} -b ${bundleName}`],
      { timeout: 10_000 }
    );
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Launch failed: ${msg.slice(0, 300)}`);
    return false;
  }
}
