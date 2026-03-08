import * as vscode from 'vscode';
import { resolveHdcPath } from '../utils/config';
import { spawn } from 'child_process';

let logProcess: ReturnType<typeof spawn> | null = null;
let outputChannel: vscode.OutputChannel | null = null;

export async function viewLogs(): Promise<void> {
  if (logProcess) {
    logProcess.kill();
    logProcess = null;
  }

  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('HarmonyOS Logs');
  }
  outputChannel.show();
  outputChannel.clear();

  const hdc = await resolveHdcPath();

  try {
    logProcess = spawn(hdc, ['hilog'], { stdio: ['ignore', 'pipe', 'pipe'] });

    logProcess.stdout?.on('data', (data: Buffer) => {
      outputChannel?.append(data.toString());
    });

    logProcess.stderr?.on('data', (data: Buffer) => {
      outputChannel?.append(`[ERROR] ${data.toString()}`);
    });

    logProcess.on('close', () => {
      outputChannel?.appendLine('[Log stream ended]');
      logProcess = null;
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start log viewer: ${err}`);
  }
}
