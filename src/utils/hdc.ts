import { execFile, spawn, type ChildProcess, type ExecFileOptionsWithStringEncoding, type SpawnOptions } from 'child_process';
import { promisify } from 'util';
import { resolveHdcPath } from './config';
import { shouldUseBatchShell } from './commandShell';

const execFileAsync = promisify(execFile);

export type HdcFailureKind =
  | 'not-found'
  | 'connect-failed'
  | 'timeout'
  | 'permission-denied'
  | 'unknown';

export interface TerminalShellArg {
  value: string;
  raw?: boolean;
}

export class HdcCommandError extends Error {
  constructor(
    message: string,
    readonly kind: HdcFailureKind,
    readonly hdcPath: string,
    readonly args: string[],
    readonly stdout = '',
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'HdcCommandError';
  }
}

export function buildHdcTargetArgs(deviceId?: string): string[] {
  return deviceId ? ['-t', deviceId] : [];
}

export function parseHdcTargets(stdout: string): string[] {
  return stdout.trim().split('\n')
    .filter((line) => line.trim().length > 0 && !line.includes('[Empty]'))
    .map((line) => line.trim());
}

export async function listHdcTargets(timeout = 5000): Promise<string[]> {
  const { stdout } = await execHdc(['list', 'targets'], { timeout });
  return parseHdcTargets(stdout);
}

export async function execHdc(
  args: string[],
  options: ExecFileOptionsWithStringEncoding = {},
): Promise<{ stdout: string; stderr: string }> {
  const hdc = await resolveHdcPath();
  try {
    return await execFileAsync(hdc, args, {
      encoding: 'utf8',
      shell: shouldUseBatchShell(hdc),
      ...options,
    });
  } catch (error) {
    throw coerceHdcCommandError(error, hdc, args);
  }
}

export async function spawnHdc(
  args: string[],
  options: SpawnOptions = {},
): Promise<ChildProcess> {
  const hdc = await resolveHdcPath();
  return await new Promise<ChildProcess>((resolve, reject) => {
    const child = spawn(hdc, args, {
      shell: shouldUseBatchShell(hdc),
      ...options,
    });

    let settled = false;
    const resolveChild = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(child);
    };
    const rejectChild = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(coerceHdcCommandError(error, hdc, args));
    };

    child.once('spawn', resolveChild);
    child.once('error', rejectChild);

    if (child.pid) {
      queueMicrotask(resolveChild);
    }
  });
}

export function rawTerminalArg(value: string): TerminalShellArg {
  return { value, raw: true };
}

export function buildHdcTerminalCommand(
  hdc: string,
  args: Array<string | TerminalShellArg>,
  platform: NodeJS.Platform = process.platform,
): string {
  const renderArg = platform === 'win32' ? quotePowerShell : quotePosix;
  const command = platform === 'win32'
    ? `& ${quotePowerShell(hdc)}`
    : quotePosix(hdc);

  return [
    command,
    ...args.map((arg) => {
      if (typeof arg === 'string') {
        return renderArg(arg);
      }
      return arg.raw ? arg.value : renderArg(arg.value);
    }),
  ].join(' ');
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, '\'\'')}'`;
}

export function coerceHdcCommandError(
  error: unknown,
  hdcPath = 'hdc',
  args: string[] = [],
): HdcCommandError {
  if (error instanceof HdcCommandError) {
    return error;
  }

  const details = readErrorDetails(error);
  const kind = detectHdcFailureKind(details);
  return new HdcCommandError(
    describeHdcFailure(kind),
    kind,
    hdcPath,
    args,
    details.stdout,
    details.stderr,
  );
}

export function describeHdcCommandError(error: HdcCommandError): string {
  return `${error.message}${formatHdcHint(error.kind)}`;
}

function readErrorDetails(error: unknown): {
  code?: string | number;
  signal?: string | null;
  killed?: boolean;
  message: string;
  stdout: string;
  stderr: string;
} {
  if (typeof error !== 'object' || error === null) {
    return {
      message: String(error ?? 'Unknown HDC error'),
      stdout: '',
      stderr: '',
    };
  }

  const candidate = error as NodeJS.ErrnoException & {
    code?: string | number;
    signal?: string | null;
    killed?: boolean;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };

  return {
    code: candidate.code,
    signal: candidate.signal,
    killed: candidate.killed,
    message: candidate.message ?? 'Unknown HDC error',
    stdout: bufferToString(candidate.stdout),
    stderr: bufferToString(candidate.stderr),
  };
}

function bufferToString(value: string | Buffer | undefined): string {
  if (!value) {
    return '';
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}

function detectHdcFailureKind(details: {
  code?: string | number;
  signal?: string | null;
  killed?: boolean;
  message: string;
  stdout: string;
  stderr: string;
}): HdcFailureKind {
  const combined = `${details.stderr}\n${details.stdout}\n${details.message}`.toLowerCase();

  if (details.code === 'ENOENT' || /\benoent\b|not found/.test(combined)) {
    return 'not-found';
  }

  if (details.code === 'EACCES' || /permission denied|operation not permitted/.test(combined)) {
    return 'permission-denied';
  }

  if (details.killed || details.signal === 'SIGTERM' || /timed out|timeout/.test(combined)) {
    return 'timeout';
  }

  if (/connect server failed/.test(combined)) {
    return 'connect-failed';
  }

  return 'unknown';
}

function describeHdcFailure(kind: HdcFailureKind): string {
  switch (kind) {
    case 'not-found':
      return 'HDC executable was not found.';
    case 'connect-failed':
      return 'HDC is installed, but it could not connect to the HDC server.';
    case 'timeout':
      return 'HDC did not respond in time.';
    case 'permission-denied':
      return 'HDC exists, but VS Code cannot execute it.';
    case 'unknown':
    default:
      return 'HDC command failed.';
  }
}

function formatHdcHint(kind: HdcFailureKind): string {
  switch (kind) {
    case 'not-found':
      return ' Configure `harmony.hdcPath` or install the HarmonyOS SDK/command-line tools.';
    case 'connect-failed':
      return ' Start the emulator or reconnect the device, then run “HarmonyOS: Check Environment”.';
    case 'timeout':
      return ' The HDC server may be hung or the emulator is still booting.';
    case 'permission-denied':
      return ' Check the configured `harmony.hdcPath` and file permissions.';
    case 'unknown':
    default:
      return '';
  }
}
