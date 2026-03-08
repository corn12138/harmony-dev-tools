import * as vscode from 'vscode';
import { resolveHdcPath } from '../utils/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Device {
  id: string;
  status: string;
}

async function getHdc(): Promise<string> {
  return resolveHdcPath();
}

async function listDevices(): Promise<Device[]> {
  try {
    const hdc = await getHdc();
    const { stdout } = await execAsync(`${hdc} list targets`);
    return stdout.trim().split('\n')
      .filter((line) => line.trim().length > 0 && !line.includes('[Empty]'))
      .map((line) => ({ id: line.trim(), status: 'online' }));
  } catch {
    return [];
  }
}

export async function runOnDevice(): Promise<void> {
  const devices = await listDevices();
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
  const hapFiles = await vscode.workspace.findFiles('**/build/**/outputs/**/*.hap', '**/node_modules/**');
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

  const hdc = await getHdc();
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS' },
      async (progress) => {
        progress.report({ message: `Installing to ${selected.id}...` });
        await execAsync(`${hdc} -t ${selected.id} install "${hapPath}"`, { timeout: 30_000 });
        progress.report({ message: 'Launching app...' });

        // Read bundleName to launch
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
          const appJson = vscode.Uri.joinPath(folder.uri, 'AppScope', 'app.json5');
          try {
            const content = await vscode.workspace.fs.readFile(appJson);
            const text = Buffer.from(content).toString('utf8');
            const bundleMatch = text.match(/"bundleName"\s*:\s*"([^"]+)"/);
            if (bundleMatch) {
              await execAsync(
                `${hdc} -t ${selected.id} shell "aa start -a EntryAbility -b ${bundleMatch[1]}"`,
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
  const devices = await listDevices();
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

  const devices = await listDevices();
  if (devices.length === 0) {
    vscode.window.showWarningMessage('No devices connected.');
    return;
  }

  const hdc = await getHdc();
  const device = devices[0];
  try {
    await execAsync(`${hdc} -t ${device.id} install ${hapFile[0].fsPath}`);
    vscode.window.showInformationMessage(`HAP installed on ${device.id}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Install failed: ${err}`);
  }
}
