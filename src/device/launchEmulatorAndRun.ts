import { buildAndRun, type BuildAndRunResult } from '../build/buildAndRun';
import { ensureEmulatorTarget } from './emulatorManager';

export interface LaunchEmulatorAndRunResult extends BuildAndRunResult {
  emulatorName?: string;
  launchedNow?: boolean;
}

export async function launchEmulatorAndRun(preferredName?: string): Promise<LaunchEmulatorAndRunResult> {
  const target = await ensureEmulatorTarget({
    preferredName,
    forcePick: !preferredName,
    waitForShellReady: true,
  });

  if (!target) {
    return {
      ok: false,
      stage: 'emulator',
      message: preferredName
        ? `Emulator "${preferredName}" was not ready for launch.`
        : 'No emulator target was selected or became ready.',
    };
  }

  const result = await buildAndRun({
    preferredDeviceId: target.deviceId,
    postLaunchAction: 'inspector',
  });
  return {
    ...result,
    emulatorName: target.emulatorName,
    launchedNow: target.launchedNow,
    deviceId: result.deviceId ?? target.deviceId,
  };
}
