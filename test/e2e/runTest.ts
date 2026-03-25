import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { deriveDevEcoSdkHome } from '../../src/utils/toolPaths';
import { prepareRealSmokeWorkspace } from './realSmokeSetup';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/realIndex');
    const prepared = await prepareRealSmokeWorkspace({
      fixturePath: path.resolve(extensionDevelopmentPath, 'test/fixtures/e2e-real-app'),
      preferredEmulatorName: process.env.HARMONY_E2E_EMULATOR,
    });

    if (prepared.hvigorBootstrapWarmed) {
      console.log(`[real-smoke] Warmed hvigor bootstrap cache for ${prepared.workspacePath}`);
    }

    process.env.HARMONY_E2E_WORKSPACE = prepared.workspacePath;
    process.env.HARMONY_E2E_APP_BUNDLE = prepared.bundleName;
    process.env.OHOS_BASE_SDK_HOME = prepared.sdkHome;
    process.env.DEVECO_SDK_HOME = deriveDevEcoSdkHome(prepared.sdkHome);
    if (prepared.emulatorName) {
      process.env.HARMONY_E2E_EMULATOR = prepared.emulatorName;
    }

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        prepared.workspacePath,
        '--disable-extensions',
      ],
    });
  } catch (err) {
    console.error('Failed to run real HarmonyOS smoke tests');
    if (err instanceof Error) {
      console.error(err.message);
      if (process.env.HARMONY_E2E_DEBUG_STACK === '1' && err.stack) {
        console.error(err.stack);
      }
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

void main();
