import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildHdcTargetArgs, execHdc, listHdcTargets } from '../../../src/utils/hdc';
import { isEmulatorTarget } from '../../../src/device/emulatorManager';
import { REAL_SMOKE_MARKER } from '../realSmokeSetup';
import { COMMANDS } from '../../../src/utils/constants';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';

interface SmokeCommandResult {
  ok: boolean;
  stage: string;
  message: string;
  deviceId?: string;
  emulatorName?: string;
  launchedNow?: boolean;
}

async function ensureActivated(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, 'HarmonyOS extension should be installed for smoke E2E');
  if (!extension.isActive) {
    await extension.activate();
  }
}

async function waitForOnlineEmulatorTargets(timeoutMs = 180000): Promise<string[]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await listHdcTargets(5000).catch(() => []);
    const emulators = targets.filter(isEmulatorTarget);
    if (emulators.length > 0) {
      return emulators;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('No emulator target became available within the smoke timeout.');
}

async function waitForUiMarker(
  marker: string,
  preferredDeviceId?: string,
  timeoutMs = 120000,
): Promise<{ deviceId: string; dump: string }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await listHdcTargets(5000).catch(() => []);
    const emulatorTargets = targets.filter(isEmulatorTarget);
    if (emulatorTargets.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    const orderedTargets = preferredDeviceId && emulatorTargets.includes(preferredDeviceId)
      ? [preferredDeviceId, ...emulatorTargets.filter((deviceId) => deviceId !== preferredDeviceId)]
      : emulatorTargets;
    for (const deviceId of orderedTargets) {
      try {
        const { stdout } = await execHdc(
          [...buildHdcTargetArgs(deviceId), 'shell', 'aa dump -a'],
          { timeout: 10000 },
        );
        if (stdout.includes(marker)) {
          return { deviceId, dump: stdout };
        }
      } catch {
        // ignore warm-up failures while the ability is starting
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`UI marker "${marker}" did not appear on any emulator within the smoke timeout.`);
}

function assertSmokeCommandResult(result: SmokeCommandResult | undefined): asserts result is SmokeCommandResult {
  assert.ok(result, 'Launch Emulator & Run should return a structured smoke result.');
  assert.ok(
    result.ok,
    `Launch Emulator & Run failed at stage "${result.stage}": ${result.message}`,
  );
}

suite('E2E: Build & Run (Real Smoke)', function () {
  this.timeout(300000);

  test('launchEmulatorAndRun starts or reuses the emulator, then renders the smoke marker', async () => {
    await ensureActivated();
    const bundleName = process.env.HARMONY_E2E_APP_BUNDLE;
    const preferredEmulatorName = process.env.HARMONY_E2E_EMULATOR;

    assert.ok(process.env.HARMONY_E2E_WORKSPACE, 'Real smoke workspace should be prepared before tests start');
    assert.ok(bundleName, 'Real smoke bundle name should be exported by the runner');

    const commandResult = await vscode.commands.executeCommand(
      COMMANDS.LAUNCH_EMULATOR_AND_RUN,
      preferredEmulatorName,
    ) as SmokeCommandResult;
    assertSmokeCommandResult(commandResult);
    const onlineTargets = await waitForOnlineEmulatorTargets();
    if (commandResult.deviceId) {
      assert.ok(
        onlineTargets.includes(commandResult.deviceId),
        `Expected launched emulator device ${commandResult.deviceId} to appear in HDC targets: ${onlineTargets.join(', ')}`,
      );
    }

    const result = await waitForUiMarker(REAL_SMOKE_MARKER, commandResult.deviceId);

    assert.ok(result.dump.includes(REAL_SMOKE_MARKER), 'The real smoke page marker should appear in aa dump output');
  });

  test('launchEmulatorAndRun reuses the running emulator on a second invocation', async () => {
    await ensureActivated();
    const preferredEmulatorName = process.env.HARMONY_E2E_EMULATOR;

    const first = await vscode.commands.executeCommand(
      COMMANDS.LAUNCH_EMULATOR_AND_RUN,
      preferredEmulatorName,
    ) as SmokeCommandResult;
    assertSmokeCommandResult(first);
    const before = await waitForUiMarker(REAL_SMOKE_MARKER, first.deviceId);
    const second = await vscode.commands.executeCommand(
      COMMANDS.LAUNCH_EMULATOR_AND_RUN,
      preferredEmulatorName,
    ) as SmokeCommandResult;
    assertSmokeCommandResult(second);
    const after = await waitForUiMarker(REAL_SMOKE_MARKER, second.deviceId);

    assert.strictEqual(after.deviceId, before.deviceId, 'Second invocation should continue targeting the same emulator');
    assert.strictEqual(second.deviceId, first.deviceId, 'Second invocation should reuse the same device target');
  });
});
