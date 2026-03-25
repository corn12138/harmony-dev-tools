import { describe, expect, it } from 'vitest';
import {
  buildCommandLineToolCandidates,
  buildHdcSdkCandidates,
  deriveDevEcoSdkHome,
  getCommandLineToolRoots,
  getEmulatorDeployedRoots,
  getEmulatorBinaryCandidatePaths,
  getEmulatorImageRootCandidates,
  getEmulatorSearchDirs,
  getHvigorCandidatePaths,
  getSdkRootCandidates,
} from '../src/utils/toolPaths';

describe('tool path candidates', () => {
  it('sorts versioned HDC SDK candidates descending and uses Windows separators', () => {
    expect(buildHdcSdkCandidates('C:\\Users\\test\\AppData\\Local\\OpenHarmony\\Sdk', ['12', '8', '20'], 'win32')).toEqual([
      'C:\\Users\\test\\AppData\\Local\\OpenHarmony\\Sdk\\20\\toolchains\\hdc.exe',
      'C:\\Users\\test\\AppData\\Local\\OpenHarmony\\Sdk\\12\\toolchains\\hdc.exe',
      'C:\\Users\\test\\AppData\\Local\\OpenHarmony\\Sdk\\8\\toolchains\\hdc.exe',
    ]);
  });

  it('builds command-line tool roots with platform-specific path semantics', () => {
    const windowsRoots = getCommandLineToolRoots({
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\tester',
        LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
      } as NodeJS.ProcessEnv,
      sdkPath: 'C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\Sdk\\20',
    });

    expect(windowsRoots).toContain('C:\\Users\\tester\\AppData\\Local\\Harmony\\command-line-tools');
    expect(windowsRoots).toContain('C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\command-line-tools');
    expect(windowsRoots).toContain('C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\command-line-tools');

    const macRoots = getCommandLineToolRoots({
      platform: 'darwin',
      env: {
        HOME: '/Users/tester',
      } as NodeJS.ProcessEnv,
      sdkPath: '/Users/tester/Library/OpenHarmony/Sdk/20',
    });

    expect(macRoots).toContain('/Users/tester/Library/Harmony/command-line-tools');
    expect(macRoots).toContain('/Users/tester/Library/OpenHarmony/command-line-tools');
  });

  it('builds Windows command-line tool binaries with executable extensions', () => {
    const candidates = buildCommandLineToolCandidates('sdkmgr', ['C:\\Harmony\\command-line-tools'], 'win32');
    expect(candidates).toContain('C:\\Harmony\\command-line-tools\\bin\\sdkmgr.exe');
    expect(candidates).toContain('C:\\Harmony\\command-line-tools\\tools\\sdkmgr.cmd');
    expect(candidates).toContain('C:\\Harmony\\command-line-tools\\sdk\\default\\hms\\toolchains\\sdkmgr.exe');
  });

  it('includes well-known hvigor and emulator install locations for macOS and Windows', () => {
    const macHvigor = getHvigorCandidatePaths({
      platform: 'darwin',
      env: {
        HOME: '/Users/tester',
        HARMONY_COMMANDLINE_TOOLS_HOME: '/Users/tester/sdk-tools/command-line-tools',
      } as NodeJS.ProcessEnv,
    });
    expect(macHvigor).toContain('/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw');
    expect(macHvigor).toContain('/Users/tester/sdk-tools/command-line-tools/tools/hvigor/bin/hvigorw');

    const winHvigor = getHvigorCandidatePaths({
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\tester',
        LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
      } as NodeJS.ProcessEnv,
    });
    expect(winHvigor.some((candidate) => candidate.endsWith('\\tools\\hvigor\\bin\\hvigorw.bat'))).toBe(true);

    const macEmulatorSearchDirs = getEmulatorSearchDirs({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
    });
    expect(macEmulatorSearchDirs).toContain('/Users/tester/.Huawei/Emulator/deployed');
    expect(macEmulatorSearchDirs).toContain('/Users/tester/Library/Huawei/DevEcoStudio/emulator');
    expect(macEmulatorSearchDirs).toContain('/Users/tester/Library/HarmonyOS/emulator');

    const macEmulatorDeployedRoots = getEmulatorDeployedRoots({
      platform: 'darwin',
      env: {
        HOME: '/Users/tester',
        HarmonyOS_HVD_HOME: '/Volumes/HuaweiEmulator/deployed',
      } as NodeJS.ProcessEnv,
    });
    expect(macEmulatorDeployedRoots).toContain('/Users/tester/.Huawei/Emulator/deployed');
    expect(macEmulatorDeployedRoots).toContain('/Volumes/HuaweiEmulator/deployed');

    const macImageRoots = getEmulatorImageRootCandidates({
      platform: 'darwin',
      env: {
        HOME: '/Users/tester',
        DEVECO_SDK_HOME: '/Users/tester/Library/Huawei/Sdk/default/hms',
      } as NodeJS.ProcessEnv,
      sdkPath: '/Users/tester/Library/Huawei/Sdk/20',
    });
    expect(macImageRoots).toContain('/Users/tester/Library/Huawei/Sdk/20');
    expect(macImageRoots).toContain('/Users/tester/Library/Huawei/Sdk');
    expect(macImageRoots).toContain('/Users/tester/Library/Huawei/Sdk/default/hms');

    const macEmulatorBins = getEmulatorBinaryCandidatePaths({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
    });
    expect(macEmulatorBins[0]).toBe('/Applications/DevEco-Studio.app/Contents/tools/emulator/Emulator');

    const winEmulatorBins = getEmulatorBinaryCandidatePaths({
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\tester',
        LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
        HarmonyOS_HVD_HOME: 'D:\\HarmonyEmulator\\deployed',
      } as NodeJS.ProcessEnv,
    });
    expect(winEmulatorBins).toContain('C:\\Program Files\\Huawei\\DevEco Studio\\tools\\emulator\\emulator.exe');
    expect(winEmulatorBins).toContain('C:\\Users\\tester\\AppData\\Local\\Programs\\DevEco Studio\\tools\\emulator\\emulator.exe');

    const winEmulatorSearchDirs = getEmulatorSearchDirs({
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\tester',
        LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
        HarmonyOS_HVD_HOME: 'D:\\HarmonyEmulator\\deployed',
      } as NodeJS.ProcessEnv,
    });
    expect(winEmulatorSearchDirs).toContain('D:\\HarmonyEmulator\\deployed');
    expect(winEmulatorSearchDirs).toContain('C:\\Users\\tester\\AppData\\Local\\Huawei\\HarmonyOSEmulator\\deployed');
  });

  it('includes SDK roots from common HarmonyOS environment variables', () => {
    const roots = getSdkRootCandidates({
      platform: 'darwin',
      env: {
        HOME: '/Users/tester',
        DEVECO_SDK_HOME: '/Users/tester/Library/Huawei/Sdk/default/hms',
        OHOS_BASE_SDK_HOME: '/Users/tester/Library/OpenHarmony/Sdk/20',
      } as NodeJS.ProcessEnv,
    });

    expect(roots).toContain('/Users/tester/Library/Huawei/Sdk/default/hms');
    expect(roots).toContain('/Users/tester/Library/Huawei/Sdk/default');
    expect(roots).toContain('/Users/tester/Library/OpenHarmony/Sdk/20');
  });

  it('prioritizes configured search paths for SDK, command-line-tools, emulator, and DevEco roots', () => {
    const sdkRoots = getSdkRootCandidates({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
      sdkSearchPaths: ['/Volumes/SDKs/Harmony'],
      devEcoStudioSearchPaths: ['/Volumes/Apps/DevEco-Studio.app/Contents'],
    });
    expect(sdkRoots[0]).toBe('/Volumes/SDKs/Harmony');
    expect(sdkRoots).toContain('/Volumes/Apps/DevEco-Studio.app/Contents/sdk');

    const cliRoots = getCommandLineToolRoots({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
      commandLineToolSearchPaths: ['/Volumes/HarmonyTools/command-line-tools'],
    });
    expect(cliRoots[0]).toBe('/Volumes/HarmonyTools/command-line-tools');

    const emulatorSearchDirs = getEmulatorSearchDirs({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
      emulatorSearchPaths: ['/Volumes/HarmonyEmulator'],
    });
    expect(emulatorSearchDirs[0]).toBe('/Volumes/HarmonyEmulator');

    const emulatorDeployedRoots = getEmulatorDeployedRoots({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
      emulatorSearchPaths: ['/Volumes/HarmonyEmulator'],
    });
    expect(emulatorDeployedRoots).toContain('/Volumes/HarmonyEmulator');
    expect(emulatorDeployedRoots).toContain('/Volumes/HarmonyEmulator/deployed');

    const emulatorBinsFromSdkSearch = getEmulatorBinaryCandidatePaths({
      platform: 'darwin',
      env: { HOME: '/Users/tester' } as NodeJS.ProcessEnv,
      sdkSearchPaths: ['/Volumes/HarmonySdk'],
      configuredOnly: true,
    });
    expect(emulatorBinsFromSdkSearch).toContain('/Volumes/HarmonySdk/hms/emulator/Emulator');
  });

  it('derives the DevEco SDK root from sdk variants and versioned paths', () => {
    expect(deriveDevEcoSdkHome('/Applications/DevEco-Studio.app/Contents/sdk/default/hms', 'darwin'))
      .toBe('/Applications/DevEco-Studio.app/Contents/sdk');
    expect(deriveDevEcoSdkHome('/Users/tester/Library/OpenHarmony/Sdk/20', 'darwin'))
      .toBe('/Users/tester/Library/OpenHarmony/Sdk');
    expect(deriveDevEcoSdkHome('C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\Sdk\\20', 'win32'))
      .toBe('C:\\Users\\tester\\AppData\\Local\\OpenHarmony\\Sdk');
  });
});
