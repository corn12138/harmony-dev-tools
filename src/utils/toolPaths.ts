import * as path from 'path';

export type HarmonyToolName = 'hdc' | 'sdkmgr' | 'ohpm' | 'codelinter' | 'hvigor' | 'emulator';
export type CommandLineToolName = Extract<HarmonyToolName, 'hdc' | 'sdkmgr' | 'ohpm' | 'codelinter'>;

export interface ToolPathOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  sdkPath?: string;
  sdkSearchPaths?: string[];
  commandLineToolSearchPaths?: string[];
  emulatorSearchPaths?: string[];
  devEcoStudioSearchPaths?: string[];
  configuredOnly?: boolean;
}

const SDK_ENV_KEYS = [
  'DEVECO_SDK_HOME',
  'OHOS_BASE_SDK_HOME',
  'HarmonyOS_HOME',
  'HARMONYOS_HOME',
  'OpenHarmony_HOME',
  'OPENHARMONY_HOME',
  'HM_SDK_HOME',
];
const COMMAND_LINE_TOOLS_ENV_KEYS = [
  'HARMONY_COMMANDLINE_TOOLS_HOME',
  'OHOS_COMMANDLINE_TOOLS_HOME',
  'COMMAND_LINE_TOOLS_HOME',
];
const EMULATOR_HOME_ENV_KEYS = [
  'HarmonyOS_HVD_HOME',
  'HARMONYOS_HVD_HOME',
];

export function buildHdcSdkCandidates(
  sdkRoot: string,
  versions: string[],
  platform: NodeJS.Platform = process.platform,
): string[] {
  const platformPath = getPlatformPath(platform);
  const hdcBinary = platform === 'win32' ? 'hdc.exe' : 'hdc';
  return versions
    .filter((version) => /^\d+$/.test(version))
    .sort((left, right) => Number(right) - Number(left))
    .map((version) => platformPath.join(sdkRoot, version, 'toolchains', hdcBinary));
}

export function getCommandLineToolRoots(options: ToolPathOptions = {}): string[] {
  const configuredOnly = options.configuredOnly === true;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const roots: string[] = [
    ...collectConfiguredPathCandidates(options.commandLineToolSearchPaths, platformPath),
  ];
  const sdkRoots = [
    ...collectConfiguredPathCandidates(options.sdkSearchPaths, platformPath),
  ];
  const devEcoRoots = getDevEcoStudioInstallRoots({ ...options, configuredOnly: true });

  roots.push(...devEcoRoots.map((root) => platformPath.join(root, 'command-line-tools')));

  if (!configuredOnly) {
    roots.push(...collectEnvPathCandidates(COMMAND_LINE_TOOLS_ENV_KEYS, options));
    sdkRoots.push(...collectEnvPathCandidates(SDK_ENV_KEYS, options));
  }

  if (!configuredOnly) {
    if (platform === 'darwin') {
      roots.push(
        platformPath.join(home, 'Library', 'Harmony', 'command-line-tools'),
        platformPath.join(home, 'Library', 'Huawei', 'command-line-tools'),
        platformPath.join(home, 'Library', 'HarmonyOS', 'command-line-tools'),
        platformPath.join(home, 'Library', 'OpenHarmony', 'command-line-tools'),
        '/Applications/DevEco-Studio.app/Contents/command-line-tools',
        '/Applications/DevEco Studio.app/Contents/command-line-tools',
        platformPath.join(home, 'Applications', 'DevEco-Studio.app', 'Contents', 'command-line-tools'),
        platformPath.join(home, 'Applications', 'DevEco Studio.app', 'Contents', 'command-line-tools'),
      );
    } else if (platform === 'win32') {
      roots.push(
        platformPath.join(localAppData, 'Harmony', 'command-line-tools'),
        platformPath.join(localAppData, 'Huawei', 'command-line-tools'),
        platformPath.join(localAppData, 'HarmonyOS', 'command-line-tools'),
        platformPath.join(localAppData, 'OpenHarmony', 'command-line-tools'),
        platformPath.join(localAppData, 'Programs', 'Huawei', 'DevEco Studio', 'command-line-tools'),
        platformPath.join(localAppData, 'Programs', 'DevEco Studio', 'command-line-tools'),
        'C:\\DevEcoStudio\\command-line-tools',
        'C:\\Program Files\\Huawei\\DevEco Studio\\command-line-tools',
        'C:\\Program Files\\DevEco Studio\\command-line-tools',
      );
    } else {
      roots.push(
        platformPath.join(home, 'Harmony', 'command-line-tools'),
        platformPath.join(home, 'Huawei', 'command-line-tools'),
        platformPath.join(home, 'HarmonyOS', 'command-line-tools'),
        platformPath.join(home, 'OpenHarmony', 'command-line-tools'),
      );
    }
  }

  for (const sdkRoot of sdkRoots) {
    roots.push(
      platformPath.resolve(sdkRoot, '..', '..', 'command-line-tools'),
      platformPath.resolve(sdkRoot, '..', 'command-line-tools'),
      platformPath.resolve(sdkRoot, 'command-line-tools'),
    );
  }

  if (options.sdkPath) {
    roots.push(
      platformPath.resolve(options.sdkPath, '..', '..', 'command-line-tools'),
      platformPath.resolve(options.sdkPath, '..', 'command-line-tools'),
      platformPath.resolve(options.sdkPath, 'command-line-tools'),
    );
  }

  return Array.from(new Set(roots.map((root) => platformPath.normalize(root))));
}

export function buildCommandLineToolCandidates(
  toolName: CommandLineToolName,
  roots: string[],
  platform: NodeJS.Platform = process.platform,
): string[] {
  const platformPath = getPlatformPath(platform);
  const binaryNames = platform === 'win32'
    ? [`${toolName}.exe`, `${toolName}.cmd`, `${toolName}.bat`]
    : [toolName];
  const candidates: string[] = [];

  for (const root of roots) {
    for (const binaryName of binaryNames) {
      candidates.push(platformPath.join(root, 'bin', binaryName));
      candidates.push(platformPath.join(root, 'tools', binaryName));
      candidates.push(platformPath.join(root, 'sdk', 'default', 'openharmony', 'toolchains', binaryName));
      candidates.push(platformPath.join(root, 'sdk', 'default', 'harmonyos', 'toolchains', binaryName));
      candidates.push(platformPath.join(root, 'sdk', 'default', 'hms', 'toolchains', binaryName));
      candidates.push(platformPath.join(root, 'sdk', 'default', 'openharmony', 'toolchains', toolName, 'bin', binaryName));
      candidates.push(platformPath.join(root, 'sdk', 'default', 'harmonyos', 'toolchains', toolName, 'bin', binaryName));
      candidates.push(platformPath.join(root, 'sdk', 'default', 'hms', 'toolchains', toolName, 'bin', binaryName));
    }
  }

  return Array.from(new Set(candidates));
}

export function getHvigorCandidatePaths(options: ToolPathOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const hvigorBinary = platform === 'win32' ? 'hvigorw.bat' : 'hvigorw';
  const commandLineToolRoots = getCommandLineToolRoots(options);
  const installRoots = getDevEcoStudioInstallRoots(options);

  const candidates = [
    ...installRoots.map((root) => platformPath.join(root, 'tools', 'hvigor', 'bin', hvigorBinary)),
    ...commandLineToolRoots.flatMap((root) => [
      platformPath.join(root, 'tools', 'hvigor', 'bin', hvigorBinary),
      platformPath.join(root, 'bin', hvigorBinary),
    ]),
  ];

  if (platform !== 'darwin' && platform !== 'win32') {
    candidates.push(
      platformPath.join(home, 'DevEco-Studio', 'tools', 'hvigor', 'bin', hvigorBinary),
      '/opt/DevEco-Studio/tools/hvigor/bin/hvigorw',
    );
  }

  return Array.from(new Set(candidates));
}

export function getEmulatorSearchDirs(options: ToolPathOptions = {}): string[] {
  const configuredOnly = options.configuredOnly === true;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const configuredSearchPaths = collectConfiguredPathCandidates(options.emulatorSearchPaths, platformPath);
  const configuredRoots = [
    ...configuredSearchPaths,
    ...configuredSearchPaths.map((root) => platformPath.join(root, 'deployed')),
  ];

  if (configuredOnly) {
    return Array.from(new Set(configuredRoots));
  }

  const emulatorHomes = collectEnvPathCandidates(EMULATOR_HOME_ENV_KEYS, options, 1);

  if (platform === 'darwin') {
    return Array.from(new Set([
      ...configuredRoots,
      ...emulatorHomes,
      ...emulatorHomes.map((root) => platformPath.join(root, 'deployed')),
      platformPath.join(home, '.Huawei', 'Emulator', 'deployed'),
      platformPath.join(home, '.Huawei', 'HarmonyOSEmulator', 'deployed'),
      platformPath.join(home, 'Library', 'Huawei', 'DevEcoStudio', 'emulator'),
      platformPath.join(home, 'Library', 'Huawei', 'Sdk', 'hms', 'emulator'),
      platformPath.join(home, '.DevEcoStudio', 'avd'),
      platformPath.join(home, 'Library', 'OpenHarmony', 'emulator'),
      platformPath.join(home, 'Library', 'HarmonyOS', 'emulator'),
    ]));
  }

  if (platform === 'win32') {
    return Array.from(new Set([
      ...configuredRoots,
      ...emulatorHomes,
      ...emulatorHomes.map((root) => platformPath.join(root, 'deployed')),
      platformPath.join(home, '.Huawei', 'Emulator', 'deployed'),
      platformPath.join(localAppData, 'Huawei', 'Emulator', 'deployed'),
      platformPath.join(localAppData, 'Huawei', 'HarmonyOSEmulator', 'deployed'),
      platformPath.join(localAppData, 'Huawei', 'DevEcoStudio', 'emulator'),
      platformPath.join(localAppData, 'Huawei', 'Sdk', 'hms', 'emulator'),
      platformPath.join(home, '.DevEcoStudio', 'avd'),
      platformPath.join(localAppData, 'OpenHarmony', 'emulator'),
      platformPath.join(localAppData, 'HarmonyOS', 'emulator'),
    ]));
  }

  return Array.from(new Set([
    ...configuredRoots,
    ...emulatorHomes,
    ...emulatorHomes.map((root) => platformPath.join(root, 'deployed')),
    platformPath.join(home, '.Huawei', 'Emulator', 'deployed'),
    platformPath.join(home, '.Huawei', 'DevEcoStudio', 'emulator'),
    platformPath.join(home, '.DevEcoStudio', 'avd'),
    platformPath.join(home, 'OpenHarmony', 'emulator'),
  ]));
}

export function getEmulatorDeployedRoots(options: ToolPathOptions = {}): string[] {
  const configuredOnly = options.configuredOnly === true;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const configuredSearchPaths = collectConfiguredPathCandidates(options.emulatorSearchPaths, platformPath);
  const configuredRoots = [
    ...configuredSearchPaths,
    ...configuredSearchPaths.map((root) => platformPath.join(root, 'deployed')),
  ];

  if (configuredOnly) {
    return Array.from(new Set(configuredRoots));
  }

  const emulatorHomes = collectEnvPathCandidates(EMULATOR_HOME_ENV_KEYS, options, 1);

  if (platform === 'darwin') {
    return Array.from(new Set([
      ...configuredRoots,
      ...emulatorHomes,
      ...emulatorHomes.map((root) => platformPath.join(root, 'deployed')),
      platformPath.join(home, '.Huawei', 'Emulator', 'deployed'),
      platformPath.join(home, '.Huawei', 'HarmonyOSEmulator', 'deployed'),
      platformPath.join(home, 'Library', 'Huawei', 'Emulator', 'deployed'),
    ]));
  }

  if (platform === 'win32') {
    return Array.from(new Set([
      ...configuredRoots,
      ...emulatorHomes,
      ...emulatorHomes.map((root) => platformPath.join(root, 'deployed')),
      platformPath.join(home, '.Huawei', 'Emulator', 'deployed'),
      platformPath.join(localAppData, 'Huawei', 'Emulator', 'deployed'),
      platformPath.join(localAppData, 'Huawei', 'HarmonyOSEmulator', 'deployed'),
      platformPath.join(localAppData, 'DevEcoStudio', 'Emulator', 'deployed'),
    ]));
  }

  return Array.from(new Set([
    ...configuredRoots,
    platformPath.join(home, '.Huawei', 'Emulator', 'deployed'),
    platformPath.join(home, '.DevEcoStudio', 'emulator', 'deployed'),
  ]));
}

export function getSdkRootCandidates(options: ToolPathOptions = {}): string[] {
  const configuredOnly = options.configuredOnly === true;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const configuredInstallRoots = getDevEcoStudioInstallRoots({ ...options, configuredOnly: true });
  const installRoots = configuredOnly
    ? configuredInstallRoots
    : getDevEcoStudioInstallRoots(options);
  const envSdkRoots = configuredOnly ? [] : collectEnvPathCandidates(SDK_ENV_KEYS, options);
  const configuredSearchRoots = collectConfiguredPathCandidates(options.sdkSearchPaths, platformPath);
  const configuredSdk = options.sdkPath?.trim();
  const configuredRoots = configuredSdk
    ? Array.from(new Set([
        platformPath.normalize(configuredSdk),
        platformPath.resolve(configuredSdk, '..'),
        platformPath.resolve(configuredSdk, '..', '..'),
      ]))
    : [];
  const configuredCandidates = Array.from(new Set([
    ...configuredSearchRoots,
    ...configuredRoots,
    ...configuredInstallRoots.map((root) => platformPath.join(root, 'sdk')),
  ]));

  if (configuredOnly) {
    return configuredCandidates;
  }

  if (platform === 'darwin') {
    return Array.from(new Set([
      ...configuredCandidates,
      ...envSdkRoots,
      platformPath.join(home, 'Library', 'Huawei', 'Sdk'),
      platformPath.join(home, 'Library', 'OpenHarmony', 'Sdk'),
      platformPath.join(home, 'Library', 'HarmonyOS', 'Sdk'),
      ...installRoots.map((root) => platformPath.join(root, 'sdk')),
      '/Applications/DevEco-Studio.app/Contents/sdk',
      '/Applications/DevEco Studio.app/Contents/sdk',
    ]));
  }

  if (platform === 'win32') {
    return Array.from(new Set([
      ...configuredCandidates,
      ...envSdkRoots,
      platformPath.join(localAppData, 'Huawei', 'Sdk'),
      platformPath.join(localAppData, 'OpenHarmony', 'Sdk'),
      platformPath.join(localAppData, 'HarmonyOS', 'Sdk'),
      platformPath.join(localAppData, 'Programs', 'Huawei', 'DevEco Studio', 'sdk'),
      platformPath.join(localAppData, 'Programs', 'DevEco Studio', 'sdk'),
      ...installRoots.map((root) => platformPath.join(root, 'sdk')),
      'C:\\Program Files\\Huawei\\DevEco Studio\\sdk',
      'C:\\Program Files\\DevEco Studio\\sdk',
      'C:\\DevEcoStudio\\sdk',
    ]));
  }

  return Array.from(new Set([
    ...configuredCandidates,
    ...envSdkRoots,
    platformPath.join(home, 'Huawei', 'Sdk'),
    platformPath.join(home, 'OpenHarmony', 'Sdk'),
    platformPath.join(home, 'HarmonyOS', 'Sdk'),
    ...installRoots.map((root) => platformPath.join(root, 'sdk')),
    '/opt/DevEco-Studio/sdk',
  ]));
}

export function getEmulatorImageRootCandidates(options: ToolPathOptions = {}): string[] {
  return getSdkRootCandidates(options);
}

export function deriveDevEcoSdkHome(
  sdkPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const platformPath = getPlatformPath(platform);
  const normalized = platformPath.normalize(sdkPath);
  const basename = platformPath.basename(normalized).toLowerCase();
  const parent = platformPath.dirname(normalized);
  const parentBase = platformPath.basename(parent).toLowerCase();

  if ((basename === 'hms' || basename === 'openharmony' || basename === 'harmonyos') && parentBase === 'default') {
    return platformPath.dirname(parent);
  }

  if (basename === 'default' || basename === 'hmscore' || /^\d+$/.test(basename)) {
    return parent;
  }

  return normalized;
}

export function getEmulatorBinaryCandidatePaths(options: ToolPathOptions = {}): string[] {
  const configuredOnly = options.configuredOnly === true;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const installRoots = getDevEcoStudioInstallRoots(options);
  const sdkRoots = getSdkRootCandidates({
    ...options,
    configuredOnly,
  });
  const sdkCandidates = buildSdkEmulatorCandidates(sdkRoots, platform);

  if (platform === 'darwin') {
    return Array.from(new Set([
      ...installRoots.flatMap((root) => [
        platformPath.join(root, 'tools', 'emulator', 'Emulator'),
        platformPath.join(root, 'tools', 'emulator', 'emulator'),
      ]),
      ...sdkCandidates,
      ...(configuredOnly ? [] : [
        '/Applications/DevEco-Studio.app/Contents/tools/emulator/Emulator',
        '/Applications/DevEco-Studio.app/Contents/tools/emulator/emulator',
        '/Applications/DevEco Studio.app/Contents/tools/emulator/Emulator',
        '/Applications/DevEco Studio.app/Contents/tools/emulator/emulator',
        platformPath.join(home, 'Applications', 'DevEco-Studio.app', 'Contents', 'tools', 'emulator', 'Emulator'),
        platformPath.join(home, 'Applications', 'DevEco-Studio.app', 'Contents', 'tools', 'emulator', 'emulator'),
        platformPath.join(home, 'Applications', 'DevEco Studio.app', 'Contents', 'tools', 'emulator', 'Emulator'),
        platformPath.join(home, 'Applications', 'DevEco Studio.app', 'Contents', 'tools', 'emulator', 'emulator'),
        platformPath.join(home, 'Library', 'Huawei', 'Sdk', 'hms', 'emulator', 'Emulator'),
        platformPath.join(home, 'Library', 'Huawei', 'Sdk', 'hms', 'emulator', 'emulator'),
        platformPath.join(home, 'Library', 'OpenHarmony', 'Sdk', 'emulator', 'Emulator'),
        platformPath.join(home, 'Library', 'OpenHarmony', 'Sdk', 'emulator', 'emulator'),
        platformPath.join(home, 'Library', 'HarmonyOS', 'Sdk', 'emulator', 'Emulator'),
        platformPath.join(home, 'Library', 'HarmonyOS', 'Sdk', 'emulator', 'emulator'),
      ]),
    ]));
  }

  if (platform === 'win32') {
    return Array.from(new Set([
      ...installRoots.map((root) => platformPath.join(root, 'tools', 'emulator', 'emulator.exe')),
      ...sdkCandidates,
      ...(configuredOnly ? [] : [
        platformPath.join(localAppData, 'Huawei', 'Sdk', 'hms', 'emulator', 'emulator.exe'),
        platformPath.join(localAppData, 'Programs', 'Huawei', 'DevEco Studio', 'tools', 'emulator', 'emulator.exe'),
        platformPath.join(localAppData, 'Programs', 'DevEco Studio', 'tools', 'emulator', 'emulator.exe'),
        'C:\\Program Files\\Huawei\\DevEco Studio\\tools\\emulator\\emulator.exe',
        'C:\\Program Files\\DevEco Studio\\tools\\emulator\\emulator.exe',
        'C:\\DevEcoStudio\\tools\\emulator\\emulator.exe',
      ]),
    ]));
  }

  return Array.from(new Set([
    ...sdkCandidates,
    ...(configuredOnly ? [] : [
      platformPath.join(home, 'Huawei', 'Sdk', 'hms', 'emulator', 'emulator'),
      '/opt/DevEco-Studio/tools/emulator/emulator',
    ]),
  ]));
}

function getHomeDirectory(env: NodeJS.ProcessEnv): string {
  return env.HOME || env.USERPROFILE || '';
}

function getPlatformPath(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

function collectEnvPathCandidates(
  keys: string[],
  options: ToolPathOptions,
  ancestorDepth = 3,
): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const candidates: string[] = [];

  for (const key of keys) {
    const value = env[key]?.trim();
    if (!value) {
      continue;
    }

    candidates.push(...expandAncestorCandidates(value, platformPath, ancestorDepth));
  }

  return Array.from(new Set(candidates.map((candidate) => platformPath.normalize(candidate))));
}

function collectConfiguredPathCandidates(
  values: string[] | undefined,
  platformPath: typeof path.posix | typeof path.win32,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(
    values
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter(Boolean)
      .map((value) => platformPath.normalize(value)),
  ));
}

function expandAncestorCandidates(
  value: string,
  platformPath: typeof path.posix | typeof path.win32,
  ancestorDepth: number,
): string[] {
  const normalized = platformPath.normalize(value);
  const candidates = [normalized];
  let current = normalized;

  for (let index = 0; index < ancestorDepth; index += 1) {
    const parent = platformPath.dirname(current);
    if (!parent || parent === current) {
      break;
    }
    candidates.push(parent);
    current = parent;
  }

  return candidates;
}

function getDevEcoStudioInstallRoots(options: ToolPathOptions): string[] {
  const configuredOnly = options.configuredOnly === true;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const platformPath = getPlatformPath(platform);
  const home = getHomeDirectory(env);
  const localAppData = env.LOCALAPPDATA || platformPath.join(home, 'AppData', 'Local');
  const configuredSearchPaths = collectConfiguredPathCandidates(options.devEcoStudioSearchPaths, platformPath);

  if (configuredOnly) {
    return configuredSearchPaths;
  }

  if (platform === 'darwin') {
    return Array.from(new Set([
      ...configuredSearchPaths,
      '/Applications/DevEco-Studio.app/Contents',
      '/Applications/DevEco Studio.app/Contents',
      platformPath.join(home, 'Applications', 'DevEco-Studio.app', 'Contents'),
      platformPath.join(home, 'Applications', 'DevEco Studio.app', 'Contents'),
    ]));
  }

  if (platform === 'win32') {
    return Array.from(new Set([
      ...configuredSearchPaths,
      'C:\\DevEcoStudio',
      'C:\\Program Files\\Huawei\\DevEco Studio',
      'C:\\Program Files\\DevEco Studio',
      platformPath.join(localAppData, 'Programs', 'Huawei', 'DevEco Studio'),
      platformPath.join(localAppData, 'Programs', 'DevEco Studio'),
    ]));
  }

  return Array.from(new Set([
    ...configuredSearchPaths,
    platformPath.join(home, 'DevEco-Studio'),
    platformPath.join(home, 'DevEco Studio'),
    '/opt/DevEco-Studio',
    '/opt/DevEco Studio',
  ]));
}

function buildSdkEmulatorCandidates(
  sdkRoots: string[],
  platform: NodeJS.Platform,
): string[] {
  const platformPath = getPlatformPath(platform);
  const emulatorBinary = platform === 'win32' ? 'emulator.exe' : 'emulator';
  const emulatorGuiBinary = platform === 'darwin' ? 'Emulator' : emulatorBinary;
  const candidates: string[] = [];

  for (const sdkRoot of sdkRoots) {
    candidates.push(
      platformPath.join(sdkRoot, 'emulator', emulatorGuiBinary),
      platformPath.join(sdkRoot, 'emulator', emulatorBinary),
      platformPath.join(sdkRoot, 'hms', 'emulator', emulatorGuiBinary),
      platformPath.join(sdkRoot, 'hms', 'emulator', emulatorBinary),
      platformPath.join(sdkRoot, 'default', 'hms', 'emulator', emulatorGuiBinary),
      platformPath.join(sdkRoot, 'default', 'hms', 'emulator', emulatorBinary),
      platformPath.join(sdkRoot, 'default', 'openharmony', 'emulator', emulatorGuiBinary),
      platformPath.join(sdkRoot, 'default', 'openharmony', 'emulator', emulatorBinary),
      platformPath.join(sdkRoot, 'default', 'harmonyos', 'emulator', emulatorGuiBinary),
      platformPath.join(sdkRoot, 'default', 'harmonyos', 'emulator', emulatorBinary),
    );
  }

  return Array.from(new Set(candidates));
}
