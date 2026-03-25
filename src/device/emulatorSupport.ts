import { execFile } from 'child_process';
import { promisify } from 'util';
import { shouldUseBatchShell } from '../utils/commandShell';

const execFileAsync = promisify(execFile);

export interface EmulatorBinaryProbe {
  listWorks: boolean;
  listedNames: string[];
  errorMessage?: string;
}

export interface EmulatorLaunchFailure {
  emulatorName: string;
  binaryPath: string;
  code?: number | null;
  stdout?: string;
  stderr?: string;
  message?: string;
  platform?: NodeJS.Platform;
}

export interface EmulatorLaunchFailureSummary {
  message: string;
  details: string[];
}

export async function probeEmulatorBinary(
  binaryPath: string,
  timeout = 5000,
): Promise<EmulatorBinaryProbe> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['-list'], {
      timeout,
      shell: shouldUseBatchShell(binaryPath),
      encoding: 'utf8',
    });
    return {
      listWorks: true,
      listedNames: parseEmulatorList(stdout),
    };
  } catch (error) {
    return {
      listWorks: false,
      listedNames: [],
      errorMessage: readFailureText(error),
    };
  }
}

export function summarizeEmulatorLaunchFailure(
  failure: EmulatorLaunchFailure,
): EmulatorLaunchFailureSummary {
  const combined = `${failure.stderr ?? ''}\n${failure.stdout ?? ''}\n${failure.message ?? ''}`.trim();
  const normalized = combined.toLowerCase();
  const details: string[] = [];
  let hasSpecificFailureSignal = false;

  if (combined) {
    details.push(`CLI 输出: ${truncateSingleLine(firstMeaningfulLine(combined), 240)}`);
  }

  if (/unable to start the emulator/.test(normalized)) {
    hasSpecificFailureSignal = true;
    details.push('DevEco 模拟器返回了明确的启动失败。先在 DevEco Studio > Device Manager 里手动启动同一镜像，确认镜像本身可用。');
  }

  if (/sysmond service not found|sysmon request failed/.test(normalized)) {
    hasSpecificFailureSignal = true;
    details.push('当前 macOS 系统服务不可用，CLI 启动模拟器通常会直接失败。');
  }

  if (/nice\(.+operation not permitted|operation not permitted/.test(normalized)) {
    hasSpecificFailureSignal = true;
    details.push('当前进程缺少系统资源调整权限，受限终端或沙箱环境下常见。');
  }

  if ((failure.platform ?? process.platform) === 'darwin') {
    details.push('macOS: 如果命令行启动失败，优先确认同一模拟器能否从 DevEco Studio 图形界面正常启动。');
  } else if ((failure.platform ?? process.platform) === 'win32') {
    details.push('Windows: 如果命令行启动失败，常见原因包括 DevEco 模拟器组件异常或硬件虚拟化/Hyper-V 条件不满足。');
  }

  if (!hasSpecificFailureSignal) {
    details.push('模拟器在出现在 HDC 之前就退出了。请先确认 DevEco Studio 中同一镜像可以手动启动。');
  }

  const codeSuffix = failure.code !== undefined && failure.code !== null ? ` (exit code ${failure.code})` : '';
  return {
    message: `Emulator "${failure.emulatorName}" failed before it appeared in HDC${codeSuffix}.`,
    details,
  };
}

function parseEmulatorList(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readFailureText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return String(error ?? 'Unknown emulator CLI error');
  }

  const candidate = error as {
    message?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  const stdout = bufferToString(candidate.stdout);
  const stderr = bufferToString(candidate.stderr);
  return [stderr, stdout, candidate.message ?? 'Unknown emulator CLI error']
    .filter(Boolean)
    .join('\n');
}

function bufferToString(value: string | Buffer | undefined): string {
  if (!value) {
    return '';
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}

function firstMeaningfulLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? text.trim();
}

function truncateSingleLine(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
