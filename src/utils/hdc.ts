import { execFile, spawn, type ChildProcess, type ExecFileOptionsWithStringEncoding, type SpawnOptions } from 'child_process';
import { promisify } from 'util';
import { resolveHdcPath } from './config';

const execFileAsync = promisify(execFile);

export interface TerminalShellArg {
  value: string;
  raw?: boolean;
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
  return execFileAsync(hdc, args, {
    encoding: 'utf8',
    shell: shouldUseShell(hdc),
    ...options,
  });
}

export async function spawnHdc(
  args: string[],
  options: SpawnOptions = {},
): Promise<ChildProcess> {
  const hdc = await resolveHdcPath();
  return spawn(hdc, args, {
    shell: shouldUseShell(hdc),
    ...options,
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

function shouldUseShell(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, '\'\'')}'`;
}
