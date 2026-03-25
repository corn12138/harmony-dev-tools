import { exec } from 'child_process';
import { promisify } from 'util';
import { formatHvigorProjectSetupIssue, resolveHvigorExecution } from './hvigor';
import { extractHvigorFailureSummary, type HvigorFailureSummary } from './hvigorOutput';

const execAsync = promisify(exec);

export interface HvigorEnvironmentProbeResult {
  ok: boolean;
  kind: 'ready' | 'sdkLicenseNotAccepted' | 'sdkHomeMissing' | 'sdkPathNotWritable' | 'sdkComponentMissing' | 'generic';
  command: string;
  output: string;
  summary?: HvigorFailureSummary;
}

export async function probeHvigorEnvironment(
  rootPath: string,
  options: {
    timeoutMs?: number;
    platform?: NodeJS.Platform;
    powershellCall?: boolean;
  } = {},
): Promise<HvigorEnvironmentProbeResult> {
  const hvigorExecution = await resolveHvigorExecution(rootPath, {
    task: 'tasks',
    platform: options.platform,
    powershellCall: options.powershellCall,
  });

  if (
    (!hvigorExecution.projectSetup.exists && !hvigorExecution.executablePath)
    || (hvigorExecution.projectSetup.missingRuntimePaths.length > 0 && hvigorExecution.source !== 'external')
  ) {
    return {
      ok: false,
      kind: 'generic',
      command: hvigorExecution.command,
      output: formatHvigorProjectSetupIssue(rootPath, hvigorExecution.projectSetup),
    };
  }

  try {
    const { stdout, stderr } = await execAsync(hvigorExecution.command, {
      cwd: rootPath,
      timeout: options.timeoutMs ?? 20_000,
      maxBuffer: 4 * 1024 * 1024,
      ...(hvigorExecution.environment ? { env: hvigorExecution.environment } : {}),
      ...(hvigorExecution.shellPath ? { shell: hvigorExecution.shellPath } : {}),
    });
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    const summary = extractHvigorFailureSummary(output);
    return summarizeProbeResult(hvigorExecution.command, output, summary);
  } catch (error) {
    const output = [
      readExecOutput(error, 'stdout'),
      readExecOutput(error, 'stderr'),
      readExecMessage(error),
    ].filter(Boolean).join('\n').trim();
    const summary = extractHvigorFailureSummary(output);
    return summarizeProbeResult(hvigorExecution.command, output, summary);
  }
}

function summarizeProbeResult(
  command: string,
  output: string,
  summary?: HvigorFailureSummary,
): HvigorEnvironmentProbeResult {
  if (!summary) {
    return {
      ok: true,
      kind: 'ready',
      command,
      output,
      summary,
    };
  }

  if (summary.kind === 'sdkLicenseNotAccepted') {
    return {
      ok: false,
      kind: 'sdkLicenseNotAccepted',
      command,
      output,
      summary,
    };
  }

  if (summary.kind === 'sdkHomeMissing') {
    return {
      ok: false,
      kind: 'sdkHomeMissing',
      command,
      output,
      summary,
    };
  }

  if (summary.kind === 'sdkPathNotWritable') {
    return {
      ok: false,
      kind: 'sdkPathNotWritable',
      command,
      output,
      summary,
    };
  }

  if (summary.kind === 'sdkComponentMissing') {
    return {
      ok: false,
      kind: 'sdkComponentMissing',
      command,
      output,
      summary,
    };
  }

  return {
    ok: false,
    kind: 'generic',
    command,
    output,
    summary,
  };
}

function readExecOutput(error: unknown, key: 'stdout' | 'stderr'): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }

  const value = (error as Record<string, unknown>)[key];
  if (typeof value === 'string') {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return '';
}

function readExecMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}
