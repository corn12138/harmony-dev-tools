const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;]*m/g;

export interface HvigorFailureSummary {
  kind: 'bundleNameMismatch' | 'sdkLicenseNotAccepted' | 'sdkHomeMissing' | 'sdkPathNotWritable' | 'sdkComponentMissing' | 'generic';
  taskName?: string;
  code?: string;
  message: string;
  hints: string[];
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_REGEX, '');
}

export function extractHvigorFailureSummary(output: string): HvigorFailureSummary | undefined {
  const cleaned = stripAnsi(output).replace(/\r/g, '');
  const taskName = cleaned.match(/ERROR:\s*Failed\s+([^.\n]+)\.\.\./)?.[1]?.trim();
  const code = cleaned.match(/\b(\d{8})\s+Configuration Error\b/)?.[1];
  const message = cleaned.match(/Error Message:\s*([^\n]+)/)?.[1]?.trim();
  const hints = Array.from(cleaned.matchAll(/^\s*>\s*(.+)$/gm))
    .map((match) => match[1].trim())
    .filter((line) => Boolean(line) && !/^hvigor\s+error:/i.test(line));

  if (message) {
    const kind = /BundleName in the project configuration does not match that in the SigningConfigs/i.test(message)
      ? 'bundleNameMismatch'
      : /The SDK license agreement is not accepted/i.test(message)
        ? 'sdkLicenseNotAccepted'
        : /Unable to find 'sdk\.dir' in 'local\.properties' or 'OHOS_BASE_SDK_HOME'/i.test(message)
          ? 'sdkHomeMissing'
          : /The path .+ is not writable\. Please choose a new location\./i.test(message)
            ? 'sdkPathNotWritable'
            : /SDK component missing/i.test(message)
              ? 'sdkComponentMissing'
            : 'generic';
    return {
      kind,
      taskName,
      code,
      message,
      hints,
    };
  }

  const fallback = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('ERROR:') && !line.includes('BUILD FAILED'))
    .map((line) => line.replace(/^>?\s*hvigor\s*ERROR:\s*/i, '').trim())
    .find((line) => line.length > 0 && !/^Failed\s+:[^@\s]+:.*@\w+/.test(line))
    ?? cleaned
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('ERROR:') && !line.includes('BUILD FAILED'))
      .map((line) => line.replace(/^>?\s*hvigor\s*ERROR:\s*/i, '').trim())
      .find((line) => line.length > 0);

  if (!fallback) {
    return undefined;
  }

  return {
    kind: /The SDK license agreement is not accepted/i.test(fallback)
      ? 'sdkLicenseNotAccepted'
      : /Unable to find 'sdk\.dir' in 'local\.properties' or 'OHOS_BASE_SDK_HOME'/i.test(fallback)
        ? 'sdkHomeMissing'
        : /The path .+ is not writable\. Please choose a new location\./i.test(fallback)
          ? 'sdkPathNotWritable'
          : /SDK component missing/i.test(fallback)
            ? 'sdkComponentMissing'
        : 'generic',
    taskName,
    code,
    message: fallback,
    hints,
  };
}

export function formatHvigorFailureMessage(summary: HvigorFailureSummary): string {
  const taskLabel = toTaskLabel(summary.taskName);
  const suffix = summary.code ? ` [${summary.code}]` : '';

  if (summary.kind === 'bundleNameMismatch') {
    return `${taskLabel} failed: bundleName does not match the signing configuration.${suffix}`;
  }

  if (summary.kind === 'sdkLicenseNotAccepted') {
    return `${taskLabel} failed: HarmonyOS SDK license agreement is not accepted.${suffix}`;
  }

  if (summary.kind === 'sdkHomeMissing') {
    return `${taskLabel} failed: HarmonyOS SDK path is missing or invalid.${suffix}`;
  }

  if (summary.kind === 'sdkPathNotWritable') {
    return `${taskLabel} failed: HarmonyOS SDK path is not writable.${suffix}`;
  }

  if (summary.kind === 'sdkComponentMissing') {
    return `${taskLabel} failed: required HarmonyOS SDK components are missing.${suffix}`;
  }

  return `${taskLabel} failed: ${summary.message}${suffix}`;
}

export function getHvigorFailureRecoverySteps(summary: HvigorFailureSummary): string[] {
  if (summary.kind === 'sdkLicenseNotAccepted') {
    return [
      'Open DevEco Studio > Preferences > OpenHarmony SDK.',
      'Re-download the required Toolchains / ArkTS / JS / Native / Previewer SDK components and accept the license agreement.',
      'Then rerun "HarmonyOS: Check Environment" or retry the build.',
    ];
  }

  if (summary.kind === 'sdkHomeMissing') {
    return [
      'Ensure local.properties contains sdk.dir=<OpenHarmony SDK root> when the project/runtime expects OpenHarmony.',
      'For HarmonyOS projects, ensure DEVECO_SDK_HOME points to the DevEco SDK root (for example .../Contents/sdk), not directly to default/hms.',
      'Or export OHOS_BASE_SDK_HOME / DEVECO_SDK_HOME to the installed SDK root that matches the project runtime.',
      'Then rerun "HarmonyOS: Check Environment" or retry the build.',
    ];
  }

  if (summary.kind === 'sdkPathNotWritable') {
    return [
      'Choose a writable HarmonyOS SDK root instead of a read-only install location.',
      'Update local.properties sdk.dir or your harmony.sdkPath / OHOS_BASE_SDK_HOME override to that writable SDK root.',
      'Then rerun "HarmonyOS: Check Environment" or retry the build.',
    ];
  }

  if (summary.kind === 'sdkComponentMissing') {
    return [
      'Open DevEco Studio > Preferences > OpenHarmony SDK.',
      'Re-download the HarmonyOS SDK components required by this runtime/device type, especially Toolchains / ArkTS / JS / Native / Previewer.',
      'Check that the SDK root contains default/openharmony/{toolchains,ets,js,native,previewer} and default/hms/{toolchains,ets,native}.',
      'If you are targeting a phone emulator, ensure the HarmonyOS phone SDK package is fully installed, then rerun "HarmonyOS: Check Environment" or retry the build.',
    ];
  }

  if (summary.kind === 'bundleNameMismatch') {
    return [
      'Align AppScope/app.json5 bundleName with the signing profile bundle-name.',
      'Or use the build failure action to sync app.json5 automatically.',
    ];
  }

  return [];
}

function toTaskLabel(taskName?: string): string {
  const task = taskName?.match(/@([^@]+)$/)?.[1];
  return task ?? 'Build';
}
