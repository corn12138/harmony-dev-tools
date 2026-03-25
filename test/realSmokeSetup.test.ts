import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertRealSmokeHvigorBootstrapReady,
  collectSigningCandidates,
  ensureRealSmokeHvigorBootstrapReady,
  ensureRealSmokeSdkProbeReady,
  getRealSmokeHvigorBootstrapStatus,
  getRealSmokeWorkspacePath,
  prepareRealSmokeWorkspace,
  resolveRealSmokeHdcPath,
  resolveRealSmokeSdkHome,
  resolveRealSmokeSdkHomeCandidates,
  resolveSigningSecrets,
  resolveUsableRealSmokeSdkHome,
  selectSigningCandidate,
} from './e2e/realSmokeSetup';

function writeSigningGroup(dir: string, stem: string, bundleName: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stem}.p7b`), `{"bundle-info":{"bundle-name":"${bundleName}"}}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, `${stem}.p12`), 'p12', 'utf8');
  fs.writeFileSync(path.join(dir, `${stem}.cer`), 'cer', 'utf8');
}

describe('real smoke setup', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers an auto_ohos signing group whose bundle-name matches the smoke app', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-signing-'));
    tempRoots.push(root);
    writeSigningGroup(root, 'default_HarmonyOS_123', 'com.example.otherapp');
    writeSigningGroup(root, 'auto_ohos_456_com.example.myapplication', 'com.example.myapplication');

    const candidates = await collectSigningCandidates([root]);
    const selected = selectSigningCandidate(candidates, 'com.example.myapplication');

    expect(selected.stem).toBe('auto_ohos_456_com.example.myapplication');
    expect(selected.bundleName).toBe('com.example.myapplication');
  });

  it('discovers signing passwords from a local build-profile and injects absolute paths into a temp workspace', async () => {
    const signingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-materials-'));
    const searchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-projects-'));
    const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-'));
    tempRoots.push(signingRoot, searchRoot, sdkRoot);

    writeSigningGroup(signingRoot, 'auto_ohos_456_com.example.myapplication', 'com.example.myapplication');
    const buildProfileDir = path.join(searchRoot, 'demo-app');
    fs.mkdirSync(buildProfileDir, { recursive: true });
    fs.writeFileSync(path.join(buildProfileDir, 'build-profile.json5'), `{
  "app": {
    "signingConfigs": [
      {
        "name": "debug",
        "material": {
          "profile": "${path.join(signingRoot, 'auto_ohos_456_com.example.myapplication.p7b')}",
          "storeFile": "${path.join(signingRoot, 'auto_ohos_456_com.example.myapplication.p12')}",
          "certpath": "${path.join(signingRoot, 'auto_ohos_456_com.example.myapplication.cer')}",
          "keyAlias": "debugKey",
          "keyPassword": "key-secret",
          "signAlg": "SHA256withECDSA",
          "storePassword": "store-secret"
        }
      }
    ]
  }
}`, 'utf8');

    const fixturePath = path.resolve(__dirname, 'fixtures/e2e-real-app');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-workspace-'));
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    fs.mkdirSync(path.join(sdkRoot, 'toolchains'), { recursive: true });
    fs.writeFileSync(path.join(sdkRoot, 'toolchains', process.platform === 'win32' ? 'hdc.exe' : 'hdc'), '', 'utf8');
    const fakeEmulatorPath = process.platform === 'darwin'
      ? path.join(testHome, 'Applications', 'DevEco-Studio.app', 'Contents', 'tools', 'emulator', 'Emulator')
      : path.join(testHome, 'Huawei', 'Sdk', 'hms', 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
    fs.mkdirSync(path.dirname(fakeEmulatorPath), { recursive: true });
    fs.writeFileSync(fakeEmulatorPath, '', 'utf8');
    const prepared = await prepareRealSmokeWorkspace({
      fixturePath,
      tmpRoot,
      homeDir: testHome,
      preferredBundleName: 'com.example.myapplication',
      signingDirs: [signingRoot],
      passwordSearchRoots: [searchRoot],
      preferredSdkHome: sdkRoot,
      skipEmulatorSelection: true,
      skipHvigorBootstrapCheck: true,
      skipSdkProbe: true,
    });
    tempRoots.push(tmpRoot);
    tempRoots.push(testHome);

    expect(prepared.bundleName).toBe('com.example.myapplication');
    expect(prepared.workspacePath).toBe(getRealSmokeWorkspacePath(tmpRoot));
    expect(prepared.sdkHome).toBe(sdkRoot);
    expect(prepared.hvigorBootstrapWarmed).toBe(false);
    const secrets = await resolveSigningSecrets(prepared.signing, [searchRoot]);
    expect(secrets).toMatchObject({
      keyAlias: 'debugKey',
      keyPassword: 'key-secret',
      storePassword: 'store-secret',
      signAlg: 'SHA256withECDSA',
    });

    const buildProfileText = fs.readFileSync(path.join(prepared.workspacePath, 'build-profile.json5'), 'utf8');
    expect(buildProfileText).toContain(path.join(signingRoot, 'auto_ohos_456_com.example.myapplication.p7b'));
    expect(buildProfileText).toContain(path.join(signingRoot, 'auto_ohos_456_com.example.myapplication.p12'));
    expect(buildProfileText).toContain(path.join(signingRoot, 'auto_ohos_456_com.example.myapplication.cer'));
    expect(buildProfileText).toContain('store-secret');

    const appJsonText = fs.readFileSync(path.join(prepared.workspacePath, 'AppScope', 'app.json5'), 'utf8');
    expect(appJsonText).toContain('"bundleName": "com.example.myapplication"');

    const localPropertiesText = fs.readFileSync(path.join(prepared.workspacePath, 'local.properties'), 'utf8');
    expect(localPropertiesText).toContain(`sdk.dir=${sdkRoot}`);

    const settingsText = fs.readFileSync(path.join(prepared.workspacePath, '.vscode', 'settings.json'), 'utf8');
    expect(settingsText).toContain(`"harmony.sdkPath": ${JSON.stringify(sdkRoot)}`);
    expect(settingsText).toContain(`"harmony.hdcPath": ${JSON.stringify(path.join(sdkRoot, 'toolchains', process.platform === 'win32' ? 'hdc.exe' : 'hdc'))}`);
    expect(settingsText).toContain('"harmony.emulatorPath":');
  });

  it('fails fast when no usable signing materials exist', () => {
    expect(() => selectSigningCandidate([], 'com.example.myapplication')).toThrow(
      'No usable signing materials were found under ~/.ohos/config or ~/.ohos/config/openharmony.',
    );
  });

  it('resolves a preferred SDK home for real smoke and fails fast when no SDK is available', () => {
    const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-root-'));
    tempRoots.push(sdkRoot);

    expect(resolveRealSmokeSdkHome({
      preferredSdkHome: sdkRoot,
      homeDir: '/tmp/unused-home',
      env: {} as NodeJS.ProcessEnv,
      platform: 'darwin',
    })).toBe(sdkRoot);

    expect(() => resolveRealSmokeSdkHome({
      homeDir: '/tmp/non-existent-home',
      env: {} as NodeJS.ProcessEnv,
      platform: 'darwin',
      candidateRoots: [],
    })).toThrow(/No usable HarmonyOS SDK root was found for real smoke/);
  });

  it('keeps all existing SDK candidates in order when no explicit override is provided', () => {
    const sdkA = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-candidate-a-'));
    const sdkB = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-candidate-b-'));
    tempRoots.push(sdkA, sdkB);
    fs.mkdirSync(path.join(sdkA, '20', 'ets', 'api'), { recursive: true });
    fs.mkdirSync(path.join(sdkB, '19', 'ets', 'api'), { recursive: true });

    expect(resolveRealSmokeSdkHomeCandidates({
      homeDir: '/tmp/non-existent-home',
      env: {} as NodeJS.ProcessEnv,
      platform: 'darwin',
      candidateRoots: [sdkA, sdkB],
      runtimeOS: 'OpenHarmony',
    })).toEqual([path.join(sdkA, '20'), path.join(sdkB, '19')]);
  });

  it('reports the exact hvigor cache path that a stable smoke workspace will use', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-root-'));
    tempRoots.push(fakeHome, tmpRoot);

    const workspacePath = getRealSmokeWorkspacePath(tmpRoot);
    const status = getRealSmokeHvigorBootstrapStatus(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
    });

    expect(status.ready).toBe(false);
    expect(status.workspacePath).toBe(path.join(tmpRoot, 'harmony-real-smoke-workspace'));
    expect(status.nodeModulesPath).toContain(path.join(fakeHome, '.hvigor', 'project_caches'));
    expect(status.missingPackages).toEqual(['@ohos/hvigor', '@ohos/hvigor-ohos-plugin']);
    expect(status.bootstrapCommand).toContain(`cd "${workspacePath}" && zsh hvigorw`);
  });

  it('hashes the real workspace path so macOS /private/var resolution matches hvigor', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-real-'));
    const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-link-'));
    const aliasRoot = path.join(aliasParent, 'alias-root');
    fs.symlinkSync(realRoot, aliasRoot, 'dir');
    tempRoots.push(fakeHome, realRoot, aliasParent);

    const workspacePath = getRealSmokeWorkspacePath(aliasRoot);
    fs.mkdirSync(workspacePath, { recursive: true });
    const status = getRealSmokeHvigorBootstrapStatus(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
    });

    expect(status.projectHash).not.toBe(
      createHash('md5').update(workspacePath, 'utf8').digest('hex'),
    );
  });

  it('fails fast when the stable smoke workspace has no warmed hvigor cache', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-root-'));
    tempRoots.push(fakeHome, tmpRoot);

    const workspacePath = getRealSmokeWorkspacePath(tmpRoot);

    expect(() => assertRealSmokeHvigorBootstrapReady(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
    })).toThrow(/Real smoke hvigor bootstrap cache is cold/);
  });

  it('accepts a warmed hvigor cache for the stable smoke workspace', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-root-'));
    tempRoots.push(fakeHome, tmpRoot);

    const workspacePath = getRealSmokeWorkspacePath(tmpRoot);
    const status = getRealSmokeHvigorBootstrapStatus(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
    });
    fs.mkdirSync(path.join(status.nodeModulesPath, '@ohos', 'hvigor'), { recursive: true });
    fs.mkdirSync(path.join(status.nodeModulesPath, '@ohos', 'hvigor-ohos-plugin'), { recursive: true });

    expect(() => assertRealSmokeHvigorBootstrapReady(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
    })).not.toThrow();
  });

  it('reports variant-specific SDK repair guidance instead of a stale hmscore hint', async () => {
    const sdkBaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-hms-sdk-'));
    const sdkRoot = path.join(sdkBaseRoot, 'default', 'hms');
    tempRoots.push(sdkBaseRoot);
    fs.mkdirSync(path.join(sdkRoot, 'toolchains'), { recursive: true });
    fs.mkdirSync(path.join(sdkRoot, 'ets'), { recursive: true });
    fs.mkdirSync(path.join(sdkRoot, 'native'), { recursive: true });
    fs.mkdirSync(path.join(sdkRoot, 'previewer'), { recursive: true });

    await expect(ensureRealSmokeSdkProbeReady('/tmp/fake-real-smoke', {
      sdkHome: sdkRoot,
      platform: 'darwin',
      runner: () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'hvigor ERROR: 00303168 Configuration Error\nError Message: SDK component missing.',
      }),
    })).rejects.toThrow(new RegExp(
      `${sdkRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} exists, but hvigor still reports "SDK component missing"`,
    ));
  });

  it('auto-warms a cold hvigor cache before real smoke continues', async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-root-'));
    tempRoots.push(fakeHome, tmpRoot);

    const workspacePath = getRealSmokeWorkspacePath(tmpRoot);
    const result = await ensureRealSmokeHvigorBootstrapReady(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
      runner: ({ workspacePath: nextWorkspacePath }) => {
        const status = getRealSmokeHvigorBootstrapStatus(nextWorkspacePath, {
          homeDir: fakeHome,
          platform: 'darwin',
        });
        fs.mkdirSync(path.join(status.nodeModulesPath, '@ohos', 'hvigor'), { recursive: true });
        fs.mkdirSync(path.join(status.nodeModulesPath, '@ohos', 'hvigor-ohos-plugin'), { recursive: true });
        return {
          exitCode: 0,
          stdout: 'warm ok',
          stderr: '',
        };
      },
    });

    expect(result.warmed).toBe(true);
    expect(result.status.ready).toBe(true);
  });

  it('reuses an existing warm hvigor workspace cache before trying network warm-up', async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const sourceRoot = path.join(fakeHome, '.hvigor', 'project_caches', 'seeded-cache', 'workspace');
    fs.mkdirSync(path.join(sourceRoot, 'node_modules', '@ohos', 'hvigor'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'node_modules', '@ohos', 'hvigor-ohos-plugin'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'node_modules', '.pnpm'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'package.json'), '{"name":"seeded"}', 'utf8');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-root-'));
    tempRoots.push(fakeHome, tmpRoot);

    const workspacePath = getRealSmokeWorkspacePath(tmpRoot);
    const runner = () => {
      throw new Error('warm runner should not be called when a seeded cache exists');
    };

    const result = await ensureRealSmokeHvigorBootstrapReady(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
      runner,
    });

    expect(result.warmed).toBe(true);
    expect(result.status.ready).toBe(true);
  });

  it('surfaces the warm-up failure output when hvigor cache still stays cold', async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-home-'));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-root-'));
    tempRoots.push(fakeHome, tmpRoot);

    const workspacePath = getRealSmokeWorkspacePath(tmpRoot);

    await expect(ensureRealSmokeHvigorBootstrapReady(workspacePath, {
      homeDir: fakeHome,
      platform: 'darwin',
      runner: () => ({
        exitCode: 255,
        stdout: '',
        stderr: 'ERR_PNPM_META_FETCH_FAIL',
      }),
    })).rejects.toThrow(/ERR_PNPM_META_FETCH_FAIL/);
  });

  it('fails fast when the lightweight SDK probe reports an unaccepted HarmonyOS SDK license', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-probe-'));
    tempRoots.push(workspaceRoot);

    await expect(ensureRealSmokeSdkProbeReady(workspaceRoot, {
      sdkHome: '/tmp/fake-sdk',
      runner: () => ({
        exitCode: 1,
        stdout: '',
        stderr: '> hvigor ERROR: Cause: The SDK license agreement is not accepted.',
      }),
    })).rejects.toThrow(/Manual action required before real smoke can continue/i);

    await expect(ensureRealSmokeSdkProbeReady(workspaceRoot, {
      sdkHome: '/tmp/fake-sdk',
      runner: () => ({
        exitCode: 1,
        stdout: '',
        stderr: '> hvigor ERROR: Cause: The SDK license agreement is not accepted.',
      }),
    })).rejects.toThrow(/pnpm test:e2e/i);
  });

  it('accepts a clean lightweight SDK probe before smoke continues', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-probe-ok-'));
    tempRoots.push(workspaceRoot);

    const result = await ensureRealSmokeSdkProbeReady(workspaceRoot, {
      sdkHome: '/tmp/fake-sdk',
      runner: () => ({
        exitCode: 0,
        stdout: 'tasks',
        stderr: '',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('ready');
  });

  it('auto-selects the first SDK root that actually passes the smoke probe', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-select-'));
    const sdkA = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-a-'));
    const sdkB = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-b-'));
    tempRoots.push(workspaceRoot, sdkA, sdkB);
    fs.mkdirSync(path.join(sdkA, 'default', 'hms', 'ets', 'api', 'device-define'), { recursive: true });
    fs.writeFileSync(path.join(sdkA, 'default', 'hms', 'ets', 'api', 'device-define', 'phone.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(sdkB, 'default', 'hms', 'ets', 'api', 'device-define'), { recursive: true });
    fs.writeFileSync(path.join(sdkB, 'default', 'hms', 'ets', 'api', 'device-define', 'phone.json'), '{}', 'utf8');

    const result = await resolveUsableRealSmokeSdkHome(workspaceRoot, {
      candidateRoots: [sdkA, sdkB],
      platform: 'darwin',
      env: {} as NodeJS.ProcessEnv,
      runtimeOS: 'HarmonyOS',
      deviceTypes: ['phone'],
      runner: ({ sdkHome }) => sdkHome.includes(`${path.sep}default${path.sep}hms`) && sdkHome.startsWith(sdkA)
        ? {
            exitCode: 1,
            stdout: '',
            stderr: '> hvigor ERROR: The path /tmp/sdk-a is not writable. Please choose a new location.',
          }
        : {
            exitCode: 0,
            stdout: 'tasks',
            stderr: '',
          },
    });

    expect(result.sdkHome).toBe(path.join(sdkB, 'default', 'hms'));
    expect(result.probe.ok).toBe(true);
    const localPropertiesText = fs.readFileSync(path.join(workspaceRoot, 'local.properties'), 'utf8');
    expect(localPropertiesText).toContain(`sdk.dir=${path.join(sdkB, 'default', 'hms')}`);
  });

  it('keeps the real smoke fixture locked to a single phone device type', () => {
    const fixtureModule = fs.readFileSync(
      path.resolve(__dirname, 'fixtures/e2e-real-app/entry/src/main/module.json5'),
      'utf8',
    );

    expect(fixtureModule).toContain('"deviceTypes": [');
    expect(fixtureModule).toContain('"phone"');
    expect(fixtureModule).not.toContain('"tablet"');
    expect(fixtureModule).not.toContain('"default"');
  });

  it('locks the real smoke fixture to HarmonyOS runtime for phone emulator smoke', () => {
    const appBuildProfile = fs.readFileSync(
      path.resolve(__dirname, 'fixtures/e2e-real-app/build-profile.json5'),
      'utf8',
    );
    const entryBuildProfile = fs.readFileSync(
      path.resolve(__dirname, 'fixtures/e2e-real-app/entry/build-profile.json5'),
      'utf8',
    );

    expect(appBuildProfile).toContain('"runtimeOS": "HarmonyOS"');
    expect(entryBuildProfile).toContain('"runtimeOS": "HarmonyOS"');
    expect(appBuildProfile).not.toContain('"runtimeOS": "OpenHarmony"');
  });

  it('prefers a HarmonyOS hms SDK home over an OpenHarmony SDK that cannot satisfy phone smoke', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-sdk-hms-'));
    const openHarmonyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-openharmony-'));
    const devecoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-deveco-sdk-'));
    tempRoots.push(workspaceRoot, openHarmonyRoot, devecoRoot);

    fs.mkdirSync(path.join(openHarmonyRoot, '20', 'ets', 'api', 'device-define'), { recursive: true });
    fs.writeFileSync(path.join(openHarmonyRoot, '20', 'ets', 'api', 'device-define', 'default.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(devecoRoot, 'default', 'hms', 'ets', 'api', 'device-define'), { recursive: true });
    fs.writeFileSync(path.join(devecoRoot, 'default', 'hms', 'ets', 'api', 'device-define', 'phone.json'), '{}', 'utf8');

    const result = await resolveUsableRealSmokeSdkHome(workspaceRoot, {
      candidateRoots: [openHarmonyRoot, devecoRoot],
      platform: 'darwin',
      env: {} as NodeJS.ProcessEnv,
      runtimeOS: 'HarmonyOS',
      deviceTypes: ['phone'],
      runner: () => ({
        exitCode: 0,
        stdout: 'tasks',
        stderr: '',
      }),
    });

    expect(result.sdkHome).toBe(path.join(devecoRoot, 'default', 'hms'));
  });

  it('finds hdc from the sibling openharmony SDK when the selected smoke sdkHome is hms', () => {
    const devecoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-real-smoke-deveco-hdc-'));
    tempRoots.push(devecoRoot);

    const hmsHome = path.join(devecoRoot, 'default', 'hms');
    const openHarmonyHome = path.join(devecoRoot, 'default', 'openharmony');
    fs.mkdirSync(path.join(hmsHome, 'ets', 'api', 'device-define'), { recursive: true });
    fs.mkdirSync(path.join(openHarmonyHome, 'toolchains'), { recursive: true });
    fs.writeFileSync(path.join(openHarmonyHome, 'toolchains', process.platform === 'win32' ? 'hdc.exe' : 'hdc'), '', 'utf8');

    expect(resolveRealSmokeHdcPath(hmsHome)).toBe(
      path.join(openHarmonyHome, 'toolchains', process.platform === 'win32' ? 'hdc.exe' : 'hdc'),
    );
  });
});
