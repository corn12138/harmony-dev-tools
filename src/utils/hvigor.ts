import * as fs from 'fs';
import * as path from 'path';
import { getSdkPath, resolveHvigorPath } from './config';
import { quoteShellArg } from './shell';
import { deriveDevEcoSdkHome } from './toolPaths';

export interface HvigorCommandOptions {
  task: string;
  module?: string;
  platform?: NodeJS.Platform;
}

export interface HvigorProjectSetupResult {
  executablePath: string;
  exists: boolean;
  missingRuntimePaths: string[];
  warnings: string[];
}

export interface ResolvedHvigorExecution {
  command: string;
  executablePath?: string;
  source: 'project' | 'external';
  projectSetup: HvigorProjectSetupResult;
  warnings: string[];
  shellPath?: string;
  environment?: Record<string, string>;
}

const HVIGOR_RUNTIME_REFERENCES = [
  'hvigor/hvigor-wrapper.js',
  'hvigor/bin/hvigorw',
  'hvigor/bin/hvigorw.js',
  'hvigorw.js',
] as const;

export function getHvigorExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'hvigorw.bat' : './hvigorw';
}

export function buildHvigorCommand(options: HvigorCommandOptions): string {
  const platform = options.platform ?? process.platform;
  const executable = getHvigorExecutable(platform);
  return buildHvigorCommandWithExecutable(executable, options, { bootstrapProjectScript: platform !== 'win32' });
}

export function buildHvigorCommandWithExecutable(
  executable: string,
  options: HvigorCommandOptions,
  behavior: { bootstrapProjectScript?: boolean; powershellCall?: boolean } = {},
): string {
  const platform = options.platform ?? process.platform;
  const modulePart = options.module ? `:${options.module}:` : '';
  const normalizedExecutable = executable === getHvigorExecutable(platform)
    ? executable
    : quoteShellArg(executable, platform);
  const command = `${normalizedExecutable} ${modulePart}${options.task} --no-daemon`;

  if (platform === 'win32') {
    if (behavior.powershellCall) {
      return `& ${command}`;
    }
    return command;
  }

  if (behavior.bootstrapProjectScript) {
    return `chmod +x ./hvigorw 2>/dev/null && ${command}`;
  }

  return command;
}

export function detectHvigorRuntimeReferences(scriptContent: string): string[] {
  return HVIGOR_RUNTIME_REFERENCES.filter((reference) => scriptContent.includes(reference));
}

export function inspectHvigorProjectSetup(
  rootPath: string,
  platform: NodeJS.Platform = process.platform,
): HvigorProjectSetupResult {
  const executableName = platform === 'win32' ? 'hvigorw.bat' : 'hvigorw';
  const executablePath = path.join(rootPath, executableName);

  if (!fs.existsSync(executablePath)) {
    return {
      executablePath,
      exists: false,
      missingRuntimePaths: [],
      warnings: [],
    };
  }

  try {
    const scriptContent = fs.readFileSync(executablePath, 'utf8');
    const missingRuntimePaths = detectHvigorRuntimeReferences(scriptContent)
      .map((relativePath) => path.join(rootPath, relativePath))
      .filter((runtimePath) => !fs.existsSync(runtimePath));

    const warnings = platform === 'darwin' && /\breadlink\s+-f\b/.test(scriptContent)
      ? ['hvigorw 使用了 readlink -f；在未安装 GNU coreutils 的 macOS 环境中，这可能导致路径解析失败。']
      : [];

    return {
      executablePath,
      exists: true,
      missingRuntimePaths: Array.from(new Set(missingRuntimePaths)),
      warnings,
    };
  } catch {
    return {
      executablePath,
      exists: true,
      missingRuntimePaths: [],
      warnings: ['无法读取 hvigorw 内容，无法验证它引用的运行时文件。'],
    };
  }
}

export function formatHvigorProjectSetupIssue(
  rootPath: string,
  result: HvigorProjectSetupResult,
): string {
  if (!result.exists) {
    return `未找到 ${path.basename(result.executablePath)}，无法在 VS Code 中直接构建。`;
  }

  const missingRuntime = result.missingRuntimePaths
    .map((runtimePath) => path.relative(rootPath, runtimePath) || path.basename(runtimePath))
    .join(', ');

  if (missingRuntime) {
    return `检测到 hvigor 脚本，但缺少它引用的运行时文件：${missingRuntime}。这通常表示项目里的 hvigor 目录不完整，或 hvigorw 仍指向旧路径。`;
  }

  return result.warnings.join(' ');
}

export async function resolveHvigorExecution(
  rootPath: string,
  options: HvigorCommandOptions & { powershellCall?: boolean } ,
): Promise<ResolvedHvigorExecution> {
  const environment = buildHvigorEnvironment(rootPath);
  const projectSetup = inspectHvigorProjectSetup(rootPath, options.platform);
  if (projectSetup.exists && projectSetup.missingRuntimePaths.length === 0) {
    const projectCommand = options.platform === 'win32' && options.powershellCall
      ? buildHvigorCommandWithExecutable('.\\hvigorw.bat', {
          task: options.task,
          module: options.module,
          platform: options.platform,
        }, {
          powershellCall: true,
        })
      : buildHvigorCommand({
          task: options.task,
          module: options.module,
          platform: options.platform,
        });

    return {
      command: projectCommand,
      executablePath: projectSetup.executablePath,
      source: 'project',
      projectSetup,
      warnings: projectSetup.warnings,
      shellPath: undefined,
      environment,
    };
  }

  const externalHvigor = await resolveHvigorPath();
  if (externalHvigor) {
    const warnings = [
      ...(projectSetup.exists && projectSetup.missingRuntimePaths.length > 0
        ? [formatHvigorProjectSetupIssue(rootPath, projectSetup)]
        : []),
      ...projectSetup.warnings,
    ];

    return {
      command: buildHvigorCommandWithExecutable(
        externalHvigor,
        {
          task: options.task,
          module: options.module,
          platform: options.platform,
        },
        {
          powershellCall: options.powershellCall,
        },
      ),
      executablePath: externalHvigor,
      source: 'external',
      projectSetup,
      warnings,
      shellPath: options.platform === 'win32' && !options.powershellCall ? 'cmd.exe' : undefined,
      environment,
    };
  }

  return {
    command: buildHvigorCommand({
      task: options.task,
      module: options.module,
      platform: options.platform,
    }),
    executablePath: projectSetup.exists ? projectSetup.executablePath : undefined,
    source: 'project',
    projectSetup,
    warnings: projectSetup.warnings,
    shellPath: undefined,
    environment,
  };
}

function buildHvigorEnvironment(rootPath: string): Record<string, string> | undefined {
  const sdkHome = resolveHvigorSdkHome(rootPath);
  if (!sdkHome) {
    return undefined;
  }

  const devecoSdkHome = deriveDevEcoSdkHome(sdkHome);

  return normalizeEnvironment({
    ...process.env,
    OHOS_BASE_SDK_HOME: sdkHome,
    DEVECO_SDK_HOME: devecoSdkHome,
  });
}

function resolveHvigorSdkHome(rootPath: string): string | undefined {
  const localSdkHome = readLocalPropertiesSdkDir(rootPath);
  if (localSdkHome && fs.existsSync(localSdkHome)) {
    return localSdkHome;
  }

  const configuredSdk = getSdkPath().trim();
  if (configuredSdk && fs.existsSync(configuredSdk)) {
    return configuredSdk;
  }

  return undefined;
}

function readLocalPropertiesSdkDir(rootPath: string): string | undefined {
  const localPropertiesPath = path.join(rootPath, 'local.properties');
  if (!fs.existsSync(localPropertiesPath)) {
    return undefined;
  }

  try {
    const text = fs.readFileSync(localPropertiesPath, 'utf8');
    const line = text
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('sdk.dir='));
    if (!line) {
      return undefined;
    }

    return decodeLocalPropertiesValue(line.slice('sdk.dir='.length).trim());
  } catch {
    return undefined;
  }
}

function decodeLocalPropertiesValue(value: string): string {
  return value
    .replace(/\\ /g, ' ')
    .replace(/\\:/g, ':')
    .replace(/\\=/g, '=')
    .replace(/\\\\/g, '\\');
}

function normalizeEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}
