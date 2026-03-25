import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  extractHvigorFailureSummary,
  formatHvigorFailureMessage,
  getHvigorFailureRecoverySteps,
} from '../utils/hvigorOutput';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { findBuiltHapFiles, readBundleName, readEntryAbility } from '../utils/projectMetadata';
import { buildHdcTargetArgs, execHdc } from '../utils/hdc';
import { chooseAutoDevice, getConnectedDeviceState, pickConnectedDevice, setActiveDeviceId } from '../device/devices';
import { resolveSigningProfileInfo, syncAppBundleNameToSigningProfile } from '../project/signingProfile';
import { quoteShellArg } from '../utils/shell';
import { resolveAssembleHapPreflight } from './preflight';
import { COMMANDS } from '../utils/constants';

const execAsync = promisify(exec);
let buildOutputChannel: vscode.OutputChannel | undefined;
const DOC_SDK = 'https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-install-sdk-0000001052513743';

interface BuildAndRunOptions {
  openInspector?: boolean;
  preferredDeviceId?: string;
  postLaunchAction?: 'none' | 'mirror' | 'inspector';
}

export interface BuildAndRunResult {
  ok: boolean;
  stage: 'workspace' | 'emulator' | 'device' | 'build' | 'install' | 'launch' | 'completed';
  message: string;
  deviceId?: string;
  hapPath?: string;
}

interface BuildHapOutcome {
  ok: boolean;
  hapPath?: string;
  message: string;
}

interface StepOutcome {
  ok: boolean;
  message: string;
}

/**
 * One-click workflow: Build HAP → Install to device → Launch app → (optionally) open UI Inspector
 */
export async function buildAndRun(options: BuildAndRunOptions = {}): Promise<BuildAndRunResult> {
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return buildAndRunFailure('workspace', 'No workspace folder open.');
  }

  // Step 1: Check device
  const device = await selectDevice(options.preferredDeviceId);
  if (!device) {
    return buildAndRunFailure(
      'device',
      options.preferredDeviceId
        ? `Target device is no longer online: ${options.preferredDeviceId}`
        : 'No HarmonyOS device was selected for Build & Run.',
    );
  }

  // Step 2: Build HAP
  const buildOutcome = await buildHapWithProgress(folder);
  if (!buildOutcome.ok || !buildOutcome.hapPath) {
    return buildAndRunFailure('build', buildOutcome.message, { deviceId: device });
  }
  const hapPath = buildOutcome.hapPath;

  // Step 3: Install HAP
  const installOutcome = await installHapToDevice(device, hapPath);
  if (!installOutcome.ok) {
    return buildAndRunFailure('install', installOutcome.message, { deviceId: device, hapPath });
  }

  // Step 4: Launch app
  const launchOutcome = await launchApp(device, folder.uri);
  if (!launchOutcome.ok) {
    return buildAndRunFailure('launch', launchOutcome.message, { deviceId: device, hapPath });
  }

  const postLaunchAction = resolvePostLaunchAction(options);
  if (postLaunchAction !== 'none') {
    await new Promise((r) => setTimeout(r, 1500));
    if (postLaunchAction === 'inspector') {
      void vscode.commands.executeCommand(COMMANDS.UI_INSPECTOR, device);
    } else if (postLaunchAction === 'mirror') {
      void vscode.commands.executeCommand(COMMANDS.DEVICE_MIRROR, device);
    }
  }

  const successMessage = postLaunchAction === 'inspector'
    ? 'App is running on device. UI Inspector opened.'
    : postLaunchAction === 'mirror'
      ? 'App is running on device. Device Mirror opened.'
      : 'App is running on device.';
  vscode.window.showInformationMessage(successMessage);
  return buildAndRunSuccess(successMessage, device, hapPath);
}

async function selectDevice(preferredDeviceId?: string): Promise<string | null> {
  const state = await getConnectedDeviceState();
  if (state.devices.length === 0) {
    await promptWhenNoDeviceAvailable(state.error?.message);
    return null;
  }

  if (preferredDeviceId) {
    const preferred = state.devices.find((device) => device.id === preferredDeviceId);
    if (!preferred) {
      vscode.window.showErrorMessage(`Target device is no longer online: ${preferredDeviceId}`);
      return null;
    }
    setActiveDeviceId(preferred.id);
    return preferred.id;
  }

  const auto = chooseAutoDevice(state.devices);
  if (auto) {
    setActiveDeviceId(auto.id);
    return auto.id;
  }

  const picked = await pickConnectedDevice({
    placeHolder: 'Select target device for Build & Run',
    forcePick: true,
  });
  if (!picked) {
    return null;
  }
  return picked.id;
}

async function buildHapWithProgress(folder: vscode.WorkspaceFolder): Promise<BuildHapOutcome> {
  const rootPath = folder.uri.fsPath;
  const outputChannel = getBuildOutputChannel();
  const preflight = await resolveAssembleHapPreflight(rootPath);
  const hvigorExecution = preflight.hvigorExecution;
  const command = hvigorExecution.command;

  if (preflight.blockingMessage) {
    outputChannel.clear();
    outputChannel.appendLine(`[cwd] ${rootPath}`);
    outputChannel.appendLine(`[preflight] ${preflight.blockingMessage}`);
    for (const warning of preflight.warnings) {
      outputChannel.appendLine(`[preflight] ${warning}`);
    }
    for (const step of preflight.signingRecoveryHint?.steps ?? []) {
      outputChannel.appendLine(`[help] ${step}`);
    }
    outputChannel.show();
    void vscode.window.showErrorMessage(
      preflight.blockingMessage,
      ...(preflight.signingRecoveryHint?.copyText ? ['Copy Signing Paths'] : []),
      ...(preflight.signingRecoveryHint ? ['Open build-profile.json5'] : []),
      'Check Environment',
      'Open Build Log',
    ).then(async (action) => {
      if (action === 'Copy Signing Paths' && preflight.signingRecoveryHint?.copyText) {
        await vscode.env.clipboard.writeText(preflight.signingRecoveryHint.copyText);
        vscode.window.showInformationMessage('已复制签名路径建议。把它们填到 build-profile.json5 的 profile / storeFile / certpath。');
        return;
      }

      if (action === 'Open build-profile.json5') {
        await openWorkspaceFile(folder.uri, 'build-profile.json5');
        return;
      }

      if (action === 'Check Environment') {
        await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
        return;
      }

      if (action === 'Open Build Log') {
        outputChannel.show();
      }
    });
    return { ok: false, message: preflight.blockingMessage };
  }

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS', cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Building HAP...' });
      outputChannel.clear();
      outputChannel.appendLine(`[cwd] ${rootPath}`);
      if (hvigorExecution.source === 'external' && hvigorExecution.executablePath) {
        outputChannel.appendLine(`[hvigor] Fallback to external hvigor: ${hvigorExecution.executablePath}`);
      }
      for (const warning of preflight.warnings) {
        outputChannel.appendLine(`[preflight] ${warning}`);
      }
      outputChannel.appendLine(`[cmd] ${command}`);
      outputChannel.appendLine('');

      try {
        const buildPromise = execAsync(command, {
          cwd: rootPath,
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
          ...(hvigorExecution.environment ? { env: hvigorExecution.environment } : {}),
        });

        // Allow cancellation
        token.onCancellationRequested(() => {
          buildPromise.child?.kill();
        });

        const { stdout, stderr } = await buildPromise;
        appendBuildOutput(outputChannel, stdout, stderr);

        if (token.isCancellationRequested) {
          return { ok: false, message: 'Build was cancelled.' };
        }

        // Check for build errors
        if (stderr && stderr.includes('ERROR')) {
          presentBuildFailure(folder.uri, outputChannel, `${stdout}\n${stderr}`);
          return { ok: false, message: 'Build failed. See HarmonyOS Build output for details.' };
        }

        progress.report({ message: 'Locating HAP output...' });

        // Find the built HAP file
        const hapPath = await findHapOutput(folder);
        if (!hapPath) {
          vscode.window.showErrorMessage(
            'Build completed but no .hap file found. Check build output.'
          );
          return { ok: false, message: 'Build completed but no .hap file was found.' };
        }

        return { ok: true, hapPath, message: `Built HAP: ${hapPath}` };
      } catch (err: unknown) {
        if (!token.isCancellationRequested) {
          const failureOutput = extractExecFailureOutput(err);
          appendBuildOutput(outputChannel, failureOutput.stdout, failureOutput.stderr, failureOutput.message);
          presentBuildFailure(folder.uri, outputChannel, failureOutput.combined);
          return {
            ok: false,
            message: extractBuildFailureMessage(failureOutput.combined, failureOutput.message),
          };
        }
        return { ok: false, message: 'Build was cancelled.' };
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

async function installHapToDevice(device: string, hapPath: string): Promise<StepOutcome> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'HarmonyOS' },
    async (progress) => {
      progress.report({ message: `Installing to ${device}...` });
      const maxAttempts = isLikelyEmulatorTarget(device) ? 2 : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await execHdc([...buildHdcTargetArgs(device), 'install', hapPath], { timeout: 30_000 });
          return { ok: true, message: `Installed ${path.basename(hapPath)} to ${device}.` };
        } catch (err: unknown) {
          if (attempt < maxAttempts) {
            progress.report({ message: `Install retry ${attempt}/${maxAttempts - 1} after emulator warm-up...` });
            await new Promise((resolve) => setTimeout(resolve, 3000));
            continue;
          }

          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Install failed: ${msg.slice(0, 300)}`);
          return { ok: false, message: `Install failed: ${msg.slice(0, 300)}` };
        }
      }

      return { ok: false, message: `Install failed for ${path.basename(hapPath)}.` };
    }
  ) ?? { ok: false, message: `Install failed for ${path.basename(hapPath)}.` };
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

function presentBuildFailure(
  rootUri: vscode.Uri,
  outputChannel: vscode.OutputChannel,
  combinedOutput: string,
): void {
  const summary = extractHvigorFailureSummary(combinedOutput);
  void (async () => {
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
    const helpActions = summary?.kind === 'sdkLicenseNotAccepted'
      || summary?.kind === 'sdkHomeMissing'
      || summary?.kind === 'sdkPathNotWritable'
      || summary?.kind === 'sdkComponentMissing'
      ? ['Check Environment', 'Open SDK Docs']
      : [];

    const actions = [
      ...(syncLabel ? [syncLabel] : []),
      ...(summary?.kind === 'bundleNameMismatch' ? ['Open AppScope/app.json5', 'Open build-profile.json5'] : []),
      ...helpActions,
      'Open Build Log',
    ];

    if (summary) {
      for (const step of getHvigorFailureRecoverySteps(summary)) {
        outputChannel.appendLine(`[help] ${step}`);
      }
    }

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

    if (action === 'Check Environment') {
      await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
      return;
    }

    if (action === 'Open SDK Docs') {
      await vscode.env.openExternal(vscode.Uri.parse(DOC_SDK));
      return;
    }

    if (action === 'Open Build Log') {
      outputChannel.show();
    }
  })();
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

async function launchApp(device: string, rootUri: vscode.Uri): Promise<StepOutcome> {
  const bundleName = await readBundleName(rootUri);
  if (!bundleName) {
    vscode.window.showErrorMessage(
      'Cannot find bundleName in AppScope/app.json5. Is this a HarmonyOS project?'
    );
    return {
      ok: false,
      message: 'Cannot find bundleName in AppScope/app.json5. Is this a HarmonyOS project?',
    };
  }

  const abilityName = await readEntryAbility(rootUri);
  const fullAbility = abilityName || 'EntryAbility';

  try {
    const safeAbility = quoteShellArg(fullAbility);
    const safeBundle = quoteShellArg(bundleName);
    await execHdc(
      [...buildHdcTargetArgs(device), 'shell', `aa start -a ${safeAbility} -b ${safeBundle}`],
      { timeout: 10_000 }
    );
    return {
      ok: true,
      message: `Launched ${bundleName}/${fullAbility} on ${device}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Launch failed: ${msg.slice(0, 300)}`);
    return {
      ok: false,
      message: `Launch failed: ${msg.slice(0, 300)}`,
    };
  }
}

function resolvePostLaunchAction(options: BuildAndRunOptions): 'none' | 'mirror' | 'inspector' {
  if (options.postLaunchAction) {
    return options.postLaunchAction;
  }

  return options.openInspector === false ? 'none' : 'inspector';
}

async function promptWhenNoDeviceAvailable(errorMessage?: string): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    errorMessage
      ? `${errorMessage} Launch an emulator, connect a Wi-Fi device, or fix the environment before running the app.`
      : 'No HarmonyOS devices connected. Launch an emulator, connect a Wi-Fi device, or fix the environment before running the app.',
    'Connect Wi-Fi Device',
    'Launch Emulator & Run',
    'Select Device',
    'Check Environment',
  );

  if (action === 'Connect Wi-Fi Device') {
    await vscode.commands.executeCommand(COMMANDS.CONNECT_WIFI_DEVICE);
    return;
  }

  if (action === 'Launch Emulator & Run') {
    await vscode.commands.executeCommand(COMMANDS.LAUNCH_EMULATOR_AND_RUN);
    return;
  }

  if (action === 'Select Device') {
    await vscode.commands.executeCommand(COMMANDS.SELECT_DEVICE);
    return;
  }

  if (action === 'Check Environment') {
    await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
  }
}

function isLikelyEmulatorTarget(deviceId: string): boolean {
  return deviceId.includes('127.0.0.1') || deviceId.includes('localhost') || deviceId.includes('emulator');
}

function buildAndRunFailure(
  stage: BuildAndRunResult['stage'],
  message: string,
  extra: Partial<Pick<BuildAndRunResult, 'deviceId' | 'hapPath'>> = {},
): BuildAndRunResult {
  return {
    ok: false,
    stage,
    message,
    ...extra,
  };
}

function buildAndRunSuccess(message: string, deviceId: string, hapPath: string): BuildAndRunResult {
  return {
    ok: true,
    stage: 'completed',
    message,
    deviceId,
    hapPath,
  };
}

function extractBuildFailureMessage(combinedOutput: string, fallbackMessage: string): string {
  const summary = extractHvigorFailureSummary(combinedOutput);
  return summary ? formatHvigorFailureMessage(summary) : fallbackMessage;
}
