import * as vscode from 'vscode';
import { buildHdcTargetArgs, spawnHdc } from '../utils/hdc';
import { extractDeviceIdFromCommandArg } from './commandArgs';
import { ensureConnectedDevice } from './devices';

let logProcess: Awaited<ReturnType<typeof spawnHdc>> | null = null;
let outputChannel: vscode.OutputChannel | null = null;

export async function viewLogs(deviceArg?: unknown): Promise<void> {
  if (logProcess) {
    logProcess.kill();
    logProcess = null;
  }

  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('HarmonyOS Logs');
  }
  outputChannel.show();
  outputChannel.clear();

  try {
    const device = await ensureConnectedDevice({
      placeHolder: 'Select a device to stream hilog from',
      preferredId: extractDeviceIdFromCommandArg(deviceArg),
    });
    if (!device) {
      return;
    }

    outputChannel.appendLine(`[Target] ${device.id}`);
    const proc = await spawnHdc([...buildHdcTargetArgs(device.id), 'hilog'], { stdio: ['ignore', 'pipe', 'pipe'] });
    logProcess = proc;

    proc.stdout?.on('data', (data: Buffer) => {
      outputChannel?.append(data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      outputChannel?.append(`[ERROR] ${data.toString()}`);
    });

    proc.on('close', () => {
      outputChannel?.appendLine('[Log stream ended]');
      if (logProcess === proc) {
        logProcess = null;
      }
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start log viewer: ${err}`);
  }
}
