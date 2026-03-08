import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getHdcPath } from '../utils/config';
import { CONFIG_FILES } from '../utils/constants';

const execAsync = promisify(exec);

interface BuildAndRunOptions {
  openInspector?: boolean;
}

/**
 * One-click workflow: Build HAP → Install to device → Launch app → (optionally) open UI Inspector
 */
export async function buildAndRun(options: BuildAndRunOptions = {}): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const rootPath = folder.uri.fsPath;

  // Step 1: Check device
  const hdc = getHdcPath() || 'hdc';
  const device = await selectDevice(hdc);
  if (!device) return;

  // Step 2: Build HAP
  const hapPath = await buildHapWithProgress(rootPath);
  if (!hapPath) return;

  // Step 3: Install HAP
  const installed = await installHapToDevice(hdc, device, hapPath);
  if (!installed) return;

  // Step 4: Launch app
  const launched = await launchApp(hdc, device, rootPath);
  if (!launched) return;

  // Step 5: Open UI Inspector (optional, default true)
  if (options.openInspector !== false) {
    // Small delay to let app render
    await new Promise((r) => setTimeout(r, 1500));
    vscode.commands.executeCommand('harmony.uiInspector');
  }

  vscode.window.showInformationMessage('App is running on device. UI Inspector opened.');
}

async function selectDevice(hdc: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${hdc} list targets`, { timeout: 5000 });
    const devices = stdout.trim().split('\n')
      .filter((l) => l.trim().length > 0 && !l.includes('[Empty]'))
      .map((l) => l.trim());

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
    vscode.window.showErrorMessage('Failed to list devices. Is HDC installed and in PATH?');
    return null;
  }
}

async function buildHapWithProgress(rootPath: string): Promise<string | null> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS', cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Building HAP...' });

      try {
        const buildPromise = execAsync('./hvigorw assembleHap --no-daemon', {
          cwd: rootPath,
          timeout: 120_000,
        });

        // Allow cancellation
        token.onCancellationRequested(() => {
          buildPromise.child?.kill();
        });

        const { stdout, stderr } = await buildPromise;

        if (token.isCancellationRequested) return null;

        // Check for build errors
        if (stderr && stderr.includes('ERROR')) {
          vscode.window.showErrorMessage(`Build failed:\n${stderr.slice(0, 500)}`);
          return null;
        }

        progress.report({ message: 'Locating HAP output...' });

        // Find the built HAP file
        const hapPath = await findHapOutput(rootPath);
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

async function findHapOutput(rootPath: string): Promise<string | null> {
  // HarmonyOS outputs HAP to: <module>/build/default/outputs/default/<module>-default-signed.hap
  // or: <module>/build/outputs/default/<module>-default.hap
  const hapFiles = await vscode.workspace.findFiles(
    '**/build/**/outputs/**/*.hap',
    '**/node_modules/**'
  );

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

async function installHapToDevice(hdc: string, device: string, hapPath: string): Promise<boolean> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS' },
    async (progress) => {
      progress.report({ message: `Installing to ${device}...` });
      try {
        await execAsync(`${hdc} -t ${device} install "${hapPath}"`, { timeout: 30_000 });
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Install failed: ${msg.slice(0, 300)}`);
        return false;
      }
    }
  ) ?? false;
}

async function launchApp(hdc: string, device: string, rootPath: string): Promise<boolean> {
  // Read bundleName from AppScope/app.json5
  const bundleName = await readBundleName(rootPath);
  if (!bundleName) {
    vscode.window.showErrorMessage(
      'Cannot find bundleName in AppScope/app.json5. Is this a HarmonyOS project?'
    );
    return false;
  }

  // Read the entry ability name from module.json5
  const abilityName = await readEntryAbility(rootPath);
  const fullAbility = abilityName || 'EntryAbility';

  try {
    // aa start -a <abilityName> -b <bundleName>
    await execAsync(
      `${hdc} -t ${device} shell "aa start -a ${fullAbility} -b ${bundleName}"`,
      { timeout: 10_000 }
    );
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Launch failed: ${msg.slice(0, 300)}`);
    return false;
  }
}

async function readBundleName(rootPath: string): Promise<string | null> {
  try {
    const uri = vscode.Uri.joinPath(
      vscode.Uri.file(rootPath), 'AppScope', CONFIG_FILES.APP_JSON
    );
    const content = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString('utf8');
    const match = text.match(/"bundleName"\s*:\s*"([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function readEntryAbility(rootPath: string): Promise<string | null> {
  try {
    // Find entry module's module.json5
    const moduleFiles = await vscode.workspace.findFiles(
      '**/src/main/module.json5',
      '**/node_modules/**'
    );

    for (const file of moduleFiles) {
      const content = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(content).toString('utf8');

      // Check if this is the entry module (type: "entry")
      if (text.includes('"entry"') || text.includes("'entry'")) {
        // Extract first ability name
        const abilityMatch = text.match(/"name"\s*:\s*"(\w*Ability\w*)"/);
        if (abilityMatch) return abilityMatch[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}
