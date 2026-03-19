const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;]*m/g;

export interface HvigorFailureSummary {
  kind: 'bundleNameMismatch' | 'generic';
  taskName?: string;
  code?: string;
  message: string;
  hints: string[];
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_REGEX, '');
}

export function extractHvigorFailureSummary(output: string): HvigorFailureSummary | undefined {
  const cleaned = stripAnsi(output).replace(/\r/g, '');
  const taskName = cleaned.match(/ERROR:\s*Failed\s+([^.\n]+)\.\.\./)?.[1]?.trim();
  const code = cleaned.match(/\b(\d{8})\s+Configuration Error\b/)?.[1];
  const message = cleaned.match(/Error Message:\s*([^\n]+)/)?.[1]?.trim();
  const hints = Array.from(cleaned.matchAll(/^\s*>\s*(.+)$/gm))
    .map((match) => match[1].trim())
    .filter((line) => Boolean(line) && !/^hvigor\s+error:/i.test(line));

  if (message) {
    return {
      kind: /BundleName in the project configuration does not match that in the SigningConfigs/i.test(message)
        ? 'bundleNameMismatch'
        : 'generic',
      taskName,
      code,
      message,
      hints,
    };
  }

  const fallback = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('ERROR:') && !line.includes('BUILD FAILED'))
    .map((line) => line.replace(/^>?\s*hvigor\s*ERROR:\s*/i, '').trim())
    .find((line) => line.length > 0 && !/^Failed\s+:[^@\s]+:.*@\w+/.test(line))
    ?? cleaned
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('ERROR:') && !line.includes('BUILD FAILED'))
      .map((line) => line.replace(/^>?\s*hvigor\s*ERROR:\s*/i, '').trim())
      .find((line) => line.length > 0);

  if (!fallback) {
    return undefined;
  }

  return {
    kind: 'generic',
    taskName,
    code,
    message: fallback,
    hints,
  };
}

export function formatHvigorFailureMessage(summary: HvigorFailureSummary): string {
  const taskLabel = toTaskLabel(summary.taskName);
  const suffix = summary.code ? ` [${summary.code}]` : '';

  if (summary.kind === 'bundleNameMismatch') {
    return `${taskLabel} failed: bundleName does not match the signing configuration.${suffix}`;
  }

  return `${taskLabel} failed: ${summary.message}${suffix}`;
}

function toTaskLabel(taskName?: string): string {
  const task = taskName?.match(/@([^@]+)$/)?.[1];
  return task ?? 'Build';
}
