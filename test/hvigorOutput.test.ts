import { describe, expect, it } from 'vitest';
import {
  extractHvigorFailureSummary,
  formatHvigorFailureMessage,
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
});
