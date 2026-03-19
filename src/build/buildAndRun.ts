import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { buildHvigorCommand } from '../utils/hvigor';
import { extractHvigorFailureSummary, formatHvigorFailureMessage } from '../utils/hvigorOutput';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { findBuiltHapFiles, readBundleName, readEntryAbility } from '../utils/projectMetadata';
import { buildHdcTargetArgs, execHdc } from '../utils/hdc';
import { ensureConnectedDevice } from '../device/devices';
import { resolveSigningProfileInfo, syncAppBundleNameToSigningProfile } from '../project/signingProfile';

const execAsync = promisify(exec);
let buildOutputChannel: vscode.OutputChannel | undefined;

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
    vscode.commands.executeCommand('harmony.uiInspector', device);
  }

  vscode.window.showInformationMessage('App is running on device. UI Inspector opened.');
}

async function selectDevice(): Promise<string | null> {
  const picked = await ensureConnectedDevice({
    placeHolder: 'Select target device for Build & Run',
  });
  if (!picked) {
    return null;
  }
  return picked.id;
}

async function buildHapWithProgress(folder: vscode.WorkspaceFolder): Promise<string | null> {
  const rootPath = folder.uri.fsPath;
  const command = buildHvigorCommand({ task: 'assembleHap' });
  const outputChannel = getBuildOutputChannel();

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS', cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Building HAP...' });
      outputChannel.clear();
      outputChannel.appendLine(`[cwd] ${rootPath}`);
      outputChannel.appendLine(`[cmd] ${command}`);
      outputChannel.appendLine('');

      try {
        const buildPromise = execAsync(command, {
          cwd: rootPath,
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        });

        // Allow cancellation
        token.onCancellationRequested(() => {
          buildPromise.child?.kill();
        });

        const { stdout, stderr } = await buildPromise;
        appendBuildOutput(outputChannel, stdout, stderr);

        if (token.isCancellationRequested) return null;

        // Check for build errors
        if (stderr && stderr.includes('ERROR')) {
          await presentBuildFailure(folder.uri, outputChannel, `${stdout}\n${stderr}`);
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
          const failureOutput = extractExecFailureOutput(err);
          appendBuildOutput(outputChannel, failureOutput.stdout, failureOutput.stderr, failureOutput.message);
          await presentBuildFailure(folder.uri, outputChannel, failureOutput.combined);
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

function getBuildOutputChannel(): vscode.OutputChannel {
  if (!buildOutputChannel) {
    buildOutputChannel = vscode.window.createOutputChannel('HarmonyOS Build');
  }
  return buildOutputChannel;
}

function appendBuildOutput(
  outputChannel: vscode.OutputChannel,
  stdout = '',
  stderr = '',
  message = '',
): void {
  if (stdout.trim()) {
    outputChannel.appendLine(stdout.trimEnd());
  }
  if (stderr.trim()) {
    outputChannel.appendLine(stderr.trimEnd());
  }
  if (message.trim()) {
    outputChannel.appendLine(message.trimEnd());
  }
}

async function presentBuildFailure(
  rootUri: vscode.Uri,
  outputChannel: vscode.OutputChannel,
  combinedOutput: string,
): Promise<void> {
  const summary = extractHvigorFailureSummary(combinedOutput);
  const currentBundleName = summary?.kind === 'bundleNameMismatch'
    ? await readBundleName(rootUri)
    : undefined;
  const signingInfo = summary?.kind === 'bundleNameMismatch'
    ? await resolveSigningProfileInfo(rootUri)
    : undefined;
  const syncLabel = signingInfo?.bundleName && signingInfo.bundleName !== currentBundleName
    ? `Sync AppScope/app.json5 to ${signingInfo.bundleName}`
    : undefined;

  const message = summary?.kind === 'bundleNameMismatch' && signingInfo?.bundleName
    ? buildBundleNameMismatchMessage(summary, currentBundleName, signingInfo.bundleName)
    : (summary ? formatHvigorFailureMessage(summary) : 'Build failed. See HarmonyOS Build output for details.');

  const actions = [
    ...(syncLabel ? [syncLabel] : []),
    ...(summary?.kind === 'bundleNameMismatch' ? ['Open AppScope/app.json5', 'Open build-profile.json5'] : []),
    'Open Build Log',
  ];

  const action = await vscode.window.showErrorMessage(
    message,
    ...actions,
  );

  if (action === syncLabel) {
    const updated = await syncAppBundleNameToSigningProfile(rootUri);
    if (updated) {
      vscode.window.showInformationMessage(`AppScope/app.json5 已同步为签名 profile 中的 bundleName: ${updated}`);
    }
    return;
  }

  if (action === 'Open AppScope/app.json5') {
    await openWorkspaceFile(rootUri, 'AppScope', 'app.json5');
    return;
  }

  if (action === 'Open build-profile.json5') {
    await openWorkspaceFile(rootUri, 'build-profile.json5');
    return;
  }

  if (action === 'Open Build Log') {
    outputChannel.show();
  }
}

function buildBundleNameMismatchMessage(
  summary: NonNullable<ReturnType<typeof extractHvigorFailureSummary>>,
  currentBundleName: string | undefined,
  signingBundleName: string,
): string {
  const suffix = summary.code ? ` [${summary.code}]` : '';
  if (currentBundleName) {
    return `SignHap failed: signing profile expects ${signingBundleName}, but app.json5 uses ${currentBundleName}.${suffix}`;
  }

  return `SignHap failed: signing profile expects ${signingBundleName}.${suffix}`;
}

async function openWorkspaceFile(rootUri: vscode.Uri, ...segments: string[]): Promise<void> {
  const uri = vscode.Uri.joinPath(rootUri, ...segments);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
}

function extractExecFailureOutput(error: unknown): {
  message: string;
  stdout: string;
  stderr: string;
  combined: string;
} {
  if (typeof error !== 'object' || error === null) {
    const message = String(error ?? 'Build failed.');
    return { message, stdout: '', stderr: '', combined: message };
  }

  const candidate = error as {
    message?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  const message = candidate.message ?? 'Build failed.';
  const stdout = toString(candidate.stdout);
  const stderr = toString(candidate.stderr);
  const combined = [stdout, stderr, message].filter(Boolean).join('\n');
  return { message, stdout, stderr, combined };
}

function toString(value: string | Buffer | undefined): string {
  if (!value) {
    return '';
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
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
