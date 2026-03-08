import * as vscode from 'vscode';
import { getHdcPath } from '../utils/config';
import { CONFIG_FILES } from '../utils/constants';

let buildTerminal: vscode.Terminal | undefined;

/**
 * Run the full build → install → launch workflow in a VS Code terminal
 * so users can see real-time output (hvigor logs, install progress, etc.)
 */
export async function terminalBuildAndRun(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const rootPath = folder.uri.fsPath;
  const hdc = getHdcPath() || 'hdc';

  // Read project info for launch command
  const bundleName = await readBundleName(rootPath);
  const abilityName = await readEntryAbility(rootPath);

  if (!bundleName) {
    vscode.window.showErrorMessage('Cannot find bundleName in AppScope/app.json5');
    return;
  }

  // Dispose previous terminal if exists
  if (buildTerminal) {
    buildTerminal.dispose();
  }

  buildTerminal = vscode.window.createTerminal({
    name: 'HarmonyOS Run',
    cwd: rootPath,
    iconPath: new vscode.ThemeIcon('rocket'),
  });

  buildTerminal.show();

  // Build the chained command
  const ability = abilityName || 'EntryAbility';
  const hapPattern = `$(find . -path "*/build/*/outputs/*/*.hap" -type f | head -1)`;

  // Chain: build → find HAP → install → launch → notify
  const commands = [
    `echo "========== HarmonyOS Build & Run =========="`,
    `echo "[1/4] Building HAP..."`,
    `chmod +x ./hvigorw 2>/dev/null; ./hvigorw assembleHap --no-daemon`,
    `echo ""`,
    `echo "[2/4] Locating HAP output..."`,
    `HAP_FILE=${hapPattern}`,
    `if [ -z "$HAP_FILE" ]; then echo "ERROR: No .hap file found"; exit 1; fi`,
    `echo "Found: $HAP_FILE"`,
    `echo ""`,
    `echo "[3/4] Installing to device..."`,
    `${hdc} install "$HAP_FILE"`,
    `echo ""`,
    `echo "[4/4] Launching ${bundleName}/${ability}..."`,
    `${hdc} shell "aa start -a ${ability} -b ${bundleName}"`,
    `echo ""`,
    `echo "========== App launched successfully =========="`,
  ];

  buildTerminal.sendText(commands.join(' && '));

  // Listen for terminal close
  const disposable = vscode.window.onDidCloseTerminal((t) => {
    if (t === buildTerminal) {
      buildTerminal = undefined;
      disposable.dispose();
    }
  });
}

/**
 * Run only the launch step (skip build), assuming HAP is already installed.
 */
export async function terminalRunOnly(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  const rootPath = folder.uri.fsPath;
  const hdc = getHdcPath() || 'hdc';
  const bundleName = await readBundleName(rootPath);
  const abilityName = await readEntryAbility(rootPath) || 'EntryAbility';

  if (!bundleName) {
    vscode.window.showErrorMessage('Cannot find bundleName');
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: 'HarmonyOS Launch',
    cwd: rootPath,
    iconPath: new vscode.ThemeIcon('debug-start'),
  });
  terminal.show();
  terminal.sendText(`${hdc} shell "aa start -a ${abilityName} -b ${bundleName}"`);
}

/**
 * Stop the running app on device.
 */
export async function terminalStopApp(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  const rootPath = folder.uri.fsPath;
  const hdc = getHdcPath() || 'hdc';
  const bundleName = await readBundleName(rootPath);

  if (!bundleName) return;

  const terminal = vscode.window.activeTerminal
    ?? vscode.window.createTerminal({ name: 'HarmonyOS', cwd: rootPath });
  terminal.show();
  terminal.sendText(`${hdc} shell "aa force-stop ${bundleName}"`);
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
    const moduleFiles = await vscode.workspace.findFiles(
      '**/src/main/module.json5', '**/node_modules/**'
    );
    for (const file of moduleFiles) {
      const content = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(content).toString('utf8');
      if (text.includes('"entry"') || text.includes("'entry'")) {
        const m = text.match(/"name"\s*:\s*"(\w*Ability\w*)"/);
        if (m) return m[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}
