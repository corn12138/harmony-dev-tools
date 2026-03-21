import * as vscode from 'vscode';
import { captureScreenshot } from '../debug/uiInspector';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { extractDeviceIdFromCommandArg } from './commandArgs';
import { ensureConnectedDevice } from './devices';

export async function takeDeviceScreenshot(deviceArg?: unknown): Promise<void> {
  const preferredId = extractDeviceIdFromCommandArg(deviceArg);
  const device = await ensureConnectedDevice({
    placeHolder: 'Select a device to capture a screenshot from',
    preferredId,
  });

  if (!device) {
    return;
  }

  try {
    const base64 = await captureScreenshot(device.id);
    if (!base64) {
      vscode.window.showWarningMessage(
        'Failed to capture screenshot. Make sure the selected device is online and HDC is healthy.',
      );
      return;
    }

    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const folder = getPreferredWorkspaceFolder()?.uri.fsPath ?? os.tmpdir();
    const file = path.join(folder, `screenshot_${Date.now()}.png`);
    await fs.writeFile(file, Buffer.from(base64, 'base64'));
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
    vscode.window.showInformationMessage(`Screenshot saved: ${file}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
