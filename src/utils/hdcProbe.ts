import { resolveHdcPath } from './config';
import {
  buildHdcTargetArgs,
  coerceHdcCommandError,
  describeHdcCommandError,
  execHdc,
  listHdcTargets,
  type HdcCommandError,
} from './hdc';

export interface HdcTargetProbeResult {
  deviceId: string;
  shellReady: boolean;
  message?: string;
  error?: HdcCommandError;
}

export interface HdcEnvironmentProbeResult {
  ok: boolean;
  hdcPath: string;
  targets: string[];
  targetProbes: HdcTargetProbeResult[];
  error?: HdcCommandError;
}

export async function probeHdcEnvironment(
  options: {
    targetTimeoutMs?: number;
    listTimeoutMs?: number;
  } = {},
): Promise<HdcEnvironmentProbeResult> {
  const hdcPath = await resolveHdcPath();

  try {
    const targets = await listHdcTargets(options.listTimeoutMs ?? 3_000);
    const targetProbes = await Promise.all(
      targets.map(async (deviceId) => {
        try {
          await execHdc(
            [...buildHdcTargetArgs(deviceId), 'shell', 'pwd'],
            { timeout: options.targetTimeoutMs ?? 2_000 },
          );
          return {
            deviceId,
            shellReady: true,
          };
        } catch (error) {
          const commandError = coerceHdcCommandError(error, hdcPath, [...buildHdcTargetArgs(deviceId), 'shell', 'pwd']);
          return {
            deviceId,
            shellReady: false,
            error: commandError,
            message: describeHdcCommandError(commandError),
          };
        }
      }),
    );

    return {
      ok: true,
      hdcPath,
      targets,
      targetProbes,
    };
  } catch (error) {
    return {
      ok: false,
      hdcPath,
      targets: [],
      targetProbes: [],
      error: coerceHdcCommandError(error, hdcPath, ['list', 'targets']),
    };
  }
}
