import { describe, expect, it } from 'vitest';
import {
  extractHvigorFailureSummary,
  formatHvigorFailureMessage,
  getHvigorFailureRecoverySteps,
  stripAnsi,
} from '../src/utils/hvigorOutput';

describe('hvigor output parsing', () => {
  it('strips ANSI escape sequences', () => {
    expect(stripAnsi('\u001b[91mERROR\u001b[39m')).toBe('ERROR');
  });

  it('extracts bundleName mismatch failures', () => {
    const summary = extractHvigorFailureSummary(`
> hvigor \u001b[91mERROR: Failed :entry:default@SignHap... \u001b[39m
> hvigor \u001b[91mERROR: \u001b[31m00303074 Configuration Error
Error Message: BundleName in the project configuration does not match that in the SigningConfigs. At file: /project/build-profile.json5

* Try the following:
  > Open the project-level build-profile.json5 file. Change the bundleName value to that in the SigningConfigs.
  > Go to the app.json5 file and change the bundleName value there.
\u001b[39m\u001b[39m
`);

    expect(summary).toEqual({
      kind: 'bundleNameMismatch',
      taskName: ':entry:default@SignHap',
      code: '00303074',
      message: 'BundleName in the project configuration does not match that in the SigningConfigs. At file: /project/build-profile.json5',
      hints: [
        'Open the project-level build-profile.json5 file. Change the bundleName value to that in the SigningConfigs.',
        'Go to the app.json5 file and change the bundleName value there.',
      ],
    });
    expect(formatHvigorFailureMessage(summary!)).toBe(
      'SignHap failed: bundleName does not match the signing configuration. [00303074]',
    );
  });

  it('falls back to generic hvigor errors', () => {
    const summary = extractHvigorFailureSummary(`
> hvigor ERROR: Failed :entry:default@PackageHap...
> hvigor ERROR: Something unexpected happened
> hvigor ERROR: BUILD FAILED in 1 s
`);

    expect(summary).toEqual({
      kind: 'generic',
      taskName: ':entry:default@PackageHap',
      code: undefined,
      message: 'Something unexpected happened',
      hints: [],
    });
  });

  it('classifies unaccepted HarmonyOS SDK license failures', () => {
    const summary = extractHvigorFailureSummary(`
> hvigor ERROR: Cause: The SDK license agreement is not accepted.
`);

    expect(summary).toEqual({
      kind: 'sdkLicenseNotAccepted',
      taskName: undefined,
      code: undefined,
      message: 'Cause: The SDK license agreement is not accepted.',
      hints: [],
    });
    expect(formatHvigorFailureMessage(summary!)).toBe(
      'Build failed: HarmonyOS SDK license agreement is not accepted.',
    );
    expect(getHvigorFailureRecoverySteps(summary!)).toEqual([
      'Open DevEco Studio > Preferences > OpenHarmony SDK.',
      'Re-download the required Toolchains / ArkTS / JS / Native / Previewer SDK components and accept the license agreement.',
      'Then rerun "HarmonyOS: Check Environment" or retry the build.',
    ]);
  });

  it('classifies missing sdk.dir / OHOS_BASE_SDK_HOME failures', () => {
    const summary = extractHvigorFailureSummary(`
> hvigor ERROR: 00303208 Configuration Error
Error Message: Unable to find 'sdk.dir' in 'local.properties' or 'OHOS_BASE_SDK_HOME' in the system environment path. Check at file: /tmp/demo/local.properties
`);

    expect(summary).toEqual({
      kind: 'sdkHomeMissing',
      taskName: undefined,
      code: '00303208',
      message: "Unable to find 'sdk.dir' in 'local.properties' or 'OHOS_BASE_SDK_HOME' in the system environment path. Check at file: /tmp/demo/local.properties",
      hints: [],
    });
    expect(formatHvigorFailureMessage(summary!)).toBe(
      'Build failed: HarmonyOS SDK path is missing or invalid. [00303208]',
    );
    expect(getHvigorFailureRecoverySteps(summary!)).toEqual([
      'Ensure local.properties contains sdk.dir=<OpenHarmony SDK root> when the project/runtime expects OpenHarmony.',
      'For HarmonyOS projects, ensure DEVECO_SDK_HOME points to the DevEco SDK root (for example .../Contents/sdk), not directly to default/hms.',
      'Or export OHOS_BASE_SDK_HOME / DEVECO_SDK_HOME to the installed SDK root that matches the project runtime.',
      'Then rerun "HarmonyOS: Check Environment" or retry the build.',
    ]);
  });

  it('classifies non-writable HarmonyOS SDK roots', () => {
    const summary = extractHvigorFailureSummary(`
> hvigor ERROR: The path /Users/test/Library/Huawei/Sdk is not writable. Please choose a new location.
`);

    expect(summary).toEqual({
      kind: 'sdkPathNotWritable',
      taskName: undefined,
      code: undefined,
      message: 'The path /Users/test/Library/Huawei/Sdk is not writable. Please choose a new location.',
      hints: [],
    });
    expect(formatHvigorFailureMessage(summary!)).toBe(
      'Build failed: HarmonyOS SDK path is not writable.',
    );
    expect(getHvigorFailureRecoverySteps(summary!)).toEqual([
      'Choose a writable HarmonyOS SDK root instead of a read-only install location.',
      'Update local.properties sdk.dir or your harmony.sdkPath / OHOS_BASE_SDK_HOME override to that writable SDK root.',
      'Then rerun "HarmonyOS: Check Environment" or retry the build.',
    ]);
  });

  it('classifies missing HarmonyOS SDK components', () => {
    const summary = extractHvigorFailureSummary(`
> hvigor ERROR: 00303168 Configuration Error
Error Message: SDK component missing.
`);

    expect(summary).toEqual({
      kind: 'sdkComponentMissing',
      taskName: undefined,
      code: '00303168',
      message: 'SDK component missing.',
      hints: [],
    });
    expect(formatHvigorFailureMessage(summary!)).toBe(
      'Build failed: required HarmonyOS SDK components are missing. [00303168]',
    );
    expect(getHvigorFailureRecoverySteps(summary!)).toEqual([
      'Open DevEco Studio > Preferences > OpenHarmony SDK.',
      'Re-download the HarmonyOS SDK components required by this runtime/device type, especially Toolchains / ArkTS / JS / Native / Previewer.',
      'Check that the SDK root contains default/openharmony/{toolchains,ets,js,native,previewer} and default/hms/{toolchains,ets,native}.',
      'If you are targeting a phone emulator, ensure the HarmonyOS phone SDK package is fully installed, then rerun "HarmonyOS: Check Environment" or retry the build.',
    ]);
  });
});
