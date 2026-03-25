import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildHvigorCommand,
  detectHvigorRuntimeReferences,
  formatHvigorProjectSetupIssue,
  getHvigorExecutable,
  inspectHvigorProjectSetup,
  resolveHvigorExecution,
} from '../src/utils/hvigor';
import { deriveDevEcoSdkHome } from '../src/utils/toolPaths';

describe('hvigor utils', () => {
  it('should pick the correct executable for each platform', () => {
    expect(getHvigorExecutable('darwin')).toBe('./hvigorw');
    expect(getHvigorExecutable('linux')).toBe('./hvigorw');
    expect(getHvigorExecutable('win32')).toBe('hvigorw.bat');
  });

  it('should build a POSIX hvigor command with executable permission bootstrap', () => {
    expect(buildHvigorCommand({ task: 'assembleHap', platform: 'darwin' }))
      .toBe('chmod +x ./hvigorw 2>/dev/null && ./hvigorw assembleHap --no-daemon');
  });

  it('should build a Windows hvigor command without POSIX shell fragments', () => {
    expect(buildHvigorCommand({ task: 'clean', module: 'entry', platform: 'win32' }))
      .toBe('hvigorw.bat :entry:clean --no-daemon');
  });

  it('should detect project-local hvigor runtime references', () => {
    const script = 'HVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js';
    expect(detectHvigorRuntimeReferences(script)).toEqual(['hvigor/hvigor-wrapper.js']);
  });

  it('should report missing hvigor runtime files referenced by hvigorw', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-'));
    try {
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );

      const result = inspectHvigorProjectSetup(root, 'darwin');
      expect(result.exists).toBe(true);
      expect(result.missingRuntimePaths).toEqual([path.join(root, 'hvigor', 'hvigor-wrapper.js')]);
      expect(formatHvigorProjectSetupIssue(root, result)).toContain('hvigor/hvigor-wrapper.js');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('should accept hvigorw when referenced runtime files are present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-'));
    try {
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');

      const result = inspectHvigorProjectSetup(root, 'darwin');
      expect(result.exists).toBe(true);
      expect(result.missingRuntimePaths).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('should override dirty SDK environment variables with local.properties sdk.dir', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-env-'));
    const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-sdk-'));
    const previousDevEcoSdkHome = process.env.DEVECO_SDK_HOME;
    const previousOhosSdkHome = process.env.OHOS_BASE_SDK_HOME;
    try {
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
      fs.writeFileSync(path.join(root, 'local.properties'), `sdk.dir=${sdkRoot}\n`, 'utf8');

      process.env.DEVECO_SDK_HOME = '/tmp/broken-deveco-sdk';
      process.env.OHOS_BASE_SDK_HOME = '/tmp/broken-ohos-sdk';

      const result = await resolveHvigorExecution(root, { task: 'assembleHap', platform: 'darwin' });

      expect(result.environment?.DEVECO_SDK_HOME).toBe(deriveDevEcoSdkHome(sdkRoot));
      expect(result.environment?.OHOS_BASE_SDK_HOME).toBe(sdkRoot);
    } finally {
      if (previousDevEcoSdkHome === undefined) {
        delete process.env.DEVECO_SDK_HOME;
      } else {
        process.env.DEVECO_SDK_HOME = previousDevEcoSdkHome;
      }

      if (previousOhosSdkHome === undefined) {
        delete process.env.OHOS_BASE_SDK_HOME;
      } else {
        process.env.OHOS_BASE_SDK_HOME = previousOhosSdkHome;
      }

      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(sdkRoot, { recursive: true, force: true });
    }
  });

  it('derives the DevEco SDK root from HarmonyOS sdk variants and versioned SDK homes', () => {
    expect(deriveDevEcoSdkHome('/Applications/DevEco-Studio.app/Contents/sdk/default/hms', 'darwin'))
      .toBe('/Applications/DevEco-Studio.app/Contents/sdk');
    expect(deriveDevEcoSdkHome('/Users/tester/Library/OpenHarmony/Sdk/20', 'darwin'))
      .toBe('/Users/tester/Library/OpenHarmony/Sdk');
    expect(deriveDevEcoSdkHome('C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\Sdk\\20', 'win32'))
      .toBe('C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\Sdk');
  });
});
