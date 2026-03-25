import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  extractHvigorFailureSummary,
  getHvigorFailureRecoverySteps,
  stripAnsi,
} from '../../src/utils/hvigorOutput';
import { extractJson5StringValue, findJson5StringValue } from '../../src/utils/json5';
import {
  buildCommandLineToolCandidates,
  buildHdcSdkCandidates,
  deriveDevEcoSdkHome,
  getCommandLineToolRoots,
  getEmulatorBinaryCandidatePaths,
  getEmulatorSearchDirs,
  getSdkRootCandidates,
} from '../../src/utils/toolPaths';
import { shouldUseBatchShell } from '../../src/utils/commandShell';

const REAL_SMOKE_APP_BUNDLE = 'com.example.myapplication';
const DEFAULT_KEY_ALIAS = 'debugKey';
const DEFAULT_SIGN_ALG = 'SHA256withECDSA';
const DEFAULT_KEY_PASSWORD = '0000001B1645E56047517E29584377BB60461FF8AE9B080449946058C1BFBCF17BA5178ADFC4F5F5F562A9';
const DEFAULT_STORE_PASSWORD = '0000001B98462F0BBA800A7C8817EF777E9ACBDC414059C9AB2D096D48D17C85653AF3D707334F1D113288';
const REAL_SMOKE_WORKSPACE_NAME = 'harmony-real-smoke-workspace';
const REAL_SMOKE_REQUIRED_HVIGOR_PACKAGES = ['@ohos/hvigor', '@ohos/hvigor-ohos-plugin'] as const;

export const REAL_SMOKE_MARKER = 'E2E_SMOKE_OK';

export interface SigningCandidate {
  stem: string;
  profilePath: string;
  storeFilePath: string;
  certPath: string;
  bundleName?: string;
}

export interface SigningSecrets {
  keyAlias: string;
  keyPassword: string;
  signAlg: string;
  storePassword: string;
}

export interface PreparedRealSmokeWorkspace {
  workspacePath: string;
  fixturePath: string;
  bundleName: string;
  emulatorName?: string;
  sdkHome: string;
  hvigorBootstrapWarmed: boolean;
  signing: SigningCandidate & SigningSecrets;
}

export interface HvigorBootstrapStatus {
  ready: boolean;
  workspacePath: string;
  projectHash: string;
  nodeModulesPath: string;
  missingPackages: string[];
  bootstrapCommand: string;
}

export interface HvigorBootstrapRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

export interface HvigorBootstrapEnsureResult {
  warmed: boolean;
  status: HvigorBootstrapStatus;
}

export interface RealSmokeSdkProbeStatus {
  ok: boolean;
  kind: 'ready' | 'sdkLicenseNotAccepted' | 'sdkHomeMissing' | 'sdkPathNotWritable' | 'sdkComponentMissing' | 'deviceTypeNotSupported' | 'unknown';
  command: string;
  output: string;
}

interface ResolvedRealSmokeSdkHome {
  sdkHome: string;
  probe: RealSmokeSdkProbeStatus;
}

interface RealSmokeFixtureRequirements {
  runtimeOS?: string;
  deviceTypes: string[];
}

type HvigorBootstrapRunner = (options: {
  workspacePath: string;
  platform: NodeJS.Platform;
  timeoutMs: number;
}) => HvigorBootstrapRunResult | Promise<HvigorBootstrapRunResult>;

type RealSmokeSdkProbeRunner = (options: {
  workspacePath: string;
  platform: NodeJS.Platform;
  timeoutMs: number;
  sdkHome: string;
}) => HvigorBootstrapRunResult | Promise<HvigorBootstrapRunResult>;

export async function prepareRealSmokeWorkspace(options: {
  fixturePath?: string;
  tmpRoot?: string;
  preferredBundleName?: string;
  preferredEmulatorName?: string;
  skipEmulatorSelection?: boolean;
  skipHvigorBootstrapCheck?: boolean;
  signingDirs?: string[];
  passwordSearchRoots?: string[];
  homeDir?: string;
  preferredSdkHome?: string;
  warmTimeoutMs?: number;
  sdkProbeTimeoutMs?: number;
  hvigorBootstrapRunner?: HvigorBootstrapRunner;
  sdkProbeRunner?: RealSmokeSdkProbeRunner;
  skipSdkProbe?: boolean;
} = {}): Promise<PreparedRealSmokeWorkspace> {
  const fixturePath = options.fixturePath ?? path.resolve(__dirname, '../fixtures/e2e-real-app');
  const workspacePath = getRealSmokeWorkspacePath(options.tmpRoot);
  const homeDir = options.homeDir ?? os.homedir();
  await resetRealSmokeWorkspace(fixturePath, workspacePath);
  const requirements = readRealSmokeFixtureRequirements(workspacePath);

  const hvigorwPath = path.join(workspacePath, 'hvigorw');
  if (fs.existsSync(hvigorwPath)) {
    fs.chmodSync(hvigorwPath, 0o755);
  }

  const candidates = await collectSigningCandidates(options.signingDirs);
  const candidate = selectSigningCandidate(candidates, options.preferredBundleName ?? REAL_SMOKE_APP_BUNDLE);
  const secrets = await resolveSigningSecrets(candidate, options.passwordSearchRoots);
  await injectSigningConfig(workspacePath, candidate, secrets);
  const sdkHomeCandidates = resolveRealSmokeSdkHomeCandidates({
    preferredSdkHome: options.preferredSdkHome,
    homeDir: options.homeDir,
    runtimeOS: requirements.runtimeOS,
    deviceTypes: requirements.deviceTypes,
  });
  const provisionalSdkHome = sdkHomeCandidates[0];
  await injectRealSmokeSdkConfig(workspacePath, provisionalSdkHome);

  const emulatorName = options.skipEmulatorSelection
    ? undefined
    : selectRealSmokeEmulatorName(options.preferredEmulatorName);

  let hvigorBootstrapWarmed = false;

  if (!options.skipHvigorBootstrapCheck) {
    const bootstrap = await ensureRealSmokeHvigorBootstrapReady(workspacePath, {
      homeDir: options.homeDir,
      platform: process.platform,
      timeoutMs: options.warmTimeoutMs,
      runner: options.hvigorBootstrapRunner,
    });
    hvigorBootstrapWarmed = bootstrap.warmed;
  }

  let sdkHome = provisionalSdkHome;
  if (!options.skipSdkProbe) {
    const resolvedSdk = await resolveUsableRealSmokeSdkHome(workspacePath, {
      preferredSdkHome: options.preferredSdkHome,
      homeDir,
      runtimeOS: requirements.runtimeOS,
      deviceTypes: requirements.deviceTypes,
      timeoutMs: options.sdkProbeTimeoutMs,
      runner: options.sdkProbeRunner,
    });
    sdkHome = resolvedSdk.sdkHome;
  } else {
    sdkHome = resolveRealSmokeSdkHome({
      platform: process.platform,
      preferredSdkHome: options.preferredSdkHome,
      homeDir,
      runtimeOS: requirements.runtimeOS,
      deviceTypes: requirements.deviceTypes,
    });
  }

  await injectRealSmokeToolSettings(workspacePath, {
    sdkHome,
    hdcPath: resolveRealSmokeHdcPath(sdkHome),
    emulatorPath: resolveRealSmokeEmulatorPath(homeDir),
  });

  return {
    workspacePath,
    fixturePath,
    bundleName: candidate.bundleName ?? REAL_SMOKE_APP_BUNDLE,
    emulatorName,
    sdkHome,
    hvigorBootstrapWarmed,
    signing: {
      ...candidate,
      ...secrets,
    },
  };
}

export function getRealSmokeWorkspacePath(tmpRoot?: string): string {
  const baseRoot = tmpRoot ?? os.tmpdir();
  return path.join(baseRoot, REAL_SMOKE_WORKSPACE_NAME);
}

export function resolveRealSmokeSdkHome(options: {
  preferredSdkHome?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  candidateRoots?: string[];
  runtimeOS?: string;
  deviceTypes?: string[];
} = {}): string {
  return resolveRealSmokeSdkHomeCandidates(options)[0];
}

export function resolveRealSmokeSdkHomeCandidates(options: {
  preferredSdkHome?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  candidateRoots?: string[];
  runtimeOS?: string;
  deviceTypes?: string[];
} = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const requirements: RealSmokeFixtureRequirements = {
    runtimeOS: options.runtimeOS,
    deviceTypes: options.deviceTypes ?? [],
  };
  const configured = [
    options.preferredSdkHome,
    env.HARMONY_E2E_SDK_HOME,
    env.OHOS_BASE_SDK_HOME,
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()));

  for (const candidate of configured) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      const expanded = expandRealSmokeSdkHomeCandidates([candidate], requirements, platform);
      return expanded.length > 0 ? expanded : [candidate];
    }
  }

  const sdkRoots = options.candidateRoots ?? getSdkRootCandidates({
    platform,
    env: {
      ...env,
      HOME: env.HOME || homeDir,
      USERPROFILE: env.USERPROFILE || homeDir,
    },
  });
  const resolvedRoots = sdkRoots.filter((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });
  const resolved = expandRealSmokeSdkHomeCandidates(resolvedRoots, requirements, platform);
  if (resolved.length > 0) {
    return resolved;
  }

  throw new Error(
    [
      'No usable HarmonyOS SDK root was found for real smoke.',
      'Checked explicit overrides: HARMONY_E2E_SDK_HOME, OHOS_BASE_SDK_HOME.',
      `Checked platform candidates: ${sdkRoots.join(', ')}`,
      'Configure one of those paths before running pnpm test:e2e.',
    ].join('\n'),
  );
}

export function getRealSmokeHvigorBootstrapStatus(
  workspacePath: string,
  options: {
    homeDir?: string;
    platform?: NodeJS.Platform;
  } = {},
): HvigorBootstrapStatus {
  const homeDir = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const hashInputPath = resolveHvigorHashInputPath(workspacePath);
  const projectHash = createHash('md5').update(hashInputPath, 'utf8').digest('hex');
  const nodeModulesPath = path.join(homeDir, '.hvigor', 'project_caches', projectHash, 'workspace', 'node_modules');
  const missingPackages = REAL_SMOKE_REQUIRED_HVIGOR_PACKAGES
    .filter((packageName) => !fs.existsSync(path.join(nodeModulesPath, ...packageName.split('/'))));

  return {
    ready: missingPackages.length === 0,
    workspacePath,
    projectHash,
    nodeModulesPath,
    missingPackages,
    bootstrapCommand: buildHvigorBootstrapCommand(workspacePath, platform),
  };
}

export function assertRealSmokeHvigorBootstrapReady(
  workspacePath: string,
  options: {
    homeDir?: string;
    platform?: NodeJS.Platform;
  } = {},
): void {
  const status = getRealSmokeHvigorBootstrapStatus(workspacePath, options);
  if (status.ready) {
    return;
  }

  throw new Error(
    [
      `Real smoke hvigor bootstrap cache is cold for ${workspacePath}.`,
      `Missing cached packages: ${status.missingPackages.join(', ')}.`,
      `Expected cache path: ${status.nodeModulesPath}`,
      'Because hvigor keys its project cache by workspace path, a fresh smoke workspace would otherwise force a registry bootstrap before the test run.',
      'Warm the cache once on this machine, then rerun pnpm test:e2e:',
      status.bootstrapCommand,
    ].join('\n'),
  );
}

export async function ensureRealSmokeHvigorBootstrapReady(
  workspacePath: string,
  options: {
    homeDir?: string;
    platform?: NodeJS.Platform;
    timeoutMs?: number;
    runner?: HvigorBootstrapRunner;
  } = {},
): Promise<HvigorBootstrapEnsureResult> {
  const initialStatus = getRealSmokeHvigorBootstrapStatus(workspacePath, options);
  if (initialStatus.ready) {
    return {
      warmed: false,
      status: initialStatus,
    };
  }

  const homeDir = options.homeDir ?? os.homedir();
  const seeded = await seedRealSmokeHvigorCacheFromExistingWorkspace(initialStatus, homeDir);
  const seededStatus = getRealSmokeHvigorBootstrapStatus(workspacePath, options);
  if (seeded && seededStatus.ready) {
    return {
      warmed: true,
      status: seededStatus,
    };
  }

  const platform = options.platform ?? process.platform;
  const result = await Promise.resolve((options.runner ?? runHvigorBootstrapWarmup)({
    workspacePath,
    platform,
    timeoutMs: options.timeoutMs ?? 180_000,
  }));
  const nextStatus = getRealSmokeHvigorBootstrapStatus(workspacePath, options);
  if (nextStatus.ready) {
    return {
      warmed: true,
      status: nextStatus,
    };
  }

  throw new Error(
    [
      `Failed to warm hvigor bootstrap cache for ${workspacePath}.`,
      `Missing cached packages after warm-up: ${nextStatus.missingPackages.join(', ')}.`,
      `Expected cache path: ${nextStatus.nodeModulesPath}`,
      'Warm-up command:',
      nextStatus.bootstrapCommand,
      summarizeWarmupFailure(result),
    ].join('\n'),
  );
}

export async function ensureRealSmokeSdkProbeReady(
  workspacePath: string,
  options: {
    platform?: NodeJS.Platform;
    timeoutMs?: number;
    sdkHome: string;
    runner?: RealSmokeSdkProbeRunner;
  },
): Promise<RealSmokeSdkProbeStatus> {
  const status = await probeRealSmokeSdkReady(workspacePath, options);
  if (status.ok) {
    return status;
  }

  throw buildRealSmokeSdkProbeError(workspacePath, options.sdkHome, status);
}

export async function probeRealSmokeSdkReady(
  workspacePath: string,
  options: {
    platform?: NodeJS.Platform;
    timeoutMs?: number;
    sdkHome: string;
    runner?: RealSmokeSdkProbeRunner;
  },
): Promise<RealSmokeSdkProbeStatus> {
  const platform = options.platform ?? process.platform;
  const command = buildHvigorSdkProbeCommand(workspacePath, platform);
  const result = await Promise.resolve((options.runner ?? runHvigorSdkProbe)({
    workspacePath,
    platform,
    timeoutMs: options.timeoutMs ?? 20_000,
    sdkHome: options.sdkHome,
  }));
  const output = summarizeProbeOutput(result);
  const summary = extractHvigorFailureSummary(output);

  if (!summary && (result.exitCode === 0 || result.exitCode === null || result.exitCode === undefined)) {
    return {
      ok: true,
      kind: 'ready',
      command,
      output,
    };
  }

  return {
    ok: false,
    kind: summary?.kind === 'sdkLicenseNotAccepted'
      ? 'sdkLicenseNotAccepted'
      : summary?.kind === 'sdkHomeMissing'
        ? 'sdkHomeMissing'
        : summary?.kind === 'sdkPathNotWritable'
          ? 'sdkPathNotWritable'
          : summary?.kind === 'sdkComponentMissing'
            ? 'sdkComponentMissing'
          : 'unknown',
    command,
    output,
  };
}

export async function resolveUsableRealSmokeSdkHome(
  workspacePath: string,
  options: {
    preferredSdkHome?: string;
    homeDir?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    candidateRoots?: string[];
    runtimeOS?: string;
    deviceTypes?: string[];
    timeoutMs?: number;
    runner?: RealSmokeSdkProbeRunner;
  } = {},
): Promise<ResolvedRealSmokeSdkHome> {
  const candidates = resolveRealSmokeSdkHomeCandidates(options);
  const requirements = readRealSmokeFixtureRequirements(workspacePath, {
    fallbackRuntimeOS: options.runtimeOS,
    fallbackDeviceTypes: options.deviceTypes,
  });
  const failures: Array<{ sdkHome: string; probe: RealSmokeSdkProbeStatus }> = [];

  for (const sdkHome of candidates) {
    const compatibility = probeRealSmokeSdkCompatibility(sdkHome, requirements);
    if (!compatibility.ok) {
      failures.push({ sdkHome, probe: compatibility });
      continue;
    }
    await injectRealSmokeSdkConfig(workspacePath, sdkHome);
    const probe = await probeRealSmokeSdkReady(workspacePath, {
      platform: options.platform,
      timeoutMs: options.timeoutMs,
      sdkHome,
      runner: options.runner,
    });
    if (probe.ok) {
      return { sdkHome, probe };
    }
    failures.push({ sdkHome, probe });
  }

  throw buildRealSmokeSdkSelectionError(workspacePath, failures);
}

function buildRealSmokeSdkProbeError(
  workspacePath: string,
  sdkHome: string,
  status: RealSmokeSdkProbeStatus,
): Error {
  const retryCommand = buildRealSmokeRetryCommand();
  const layoutHints = describeRealSmokeSdkLayout(sdkHome);

  if (status.kind === 'sdkLicenseNotAccepted') {
    return new Error(
      [
        'Manual action required before real smoke can continue.',
        `Real smoke SDK probe failed for ${workspacePath}.`,
        `SDK root: ${sdkHome}`,
        'Cause: The HarmonyOS SDK license agreement has not been accepted on this machine.',
        ...buildRealSmokeSdkRecoverySteps(status).map((step, index) => `${index + 1}. ${step}`),
        `Retry after fixing the SDK setup: ${retryCommand}`,
        'Probe command:',
        status.command,
        summarizeProbeOutputForError(status.output),
      ].join('\n'),
    );
  }

  if (status.kind === 'sdkHomeMissing') {
    return new Error(
      [
        'Manual action required before real smoke can continue.',
        `Real smoke SDK probe failed for ${workspacePath}.`,
        `SDK root: ${sdkHome}`,
        'Cause: hvigor could not resolve sdk.dir / OHOS_BASE_SDK_HOME for the prepared smoke workspace.',
        ...buildRealSmokeSdkRecoverySteps(status).map((step, index) => `${index + 1}. ${step}`),
        `Retry after fixing the SDK setup: ${retryCommand}`,
        'Probe command:',
        status.command,
        summarizeProbeOutputForError(status.output),
      ].join('\n'),
    );
  }

  if (status.kind === 'sdkPathNotWritable') {
    return new Error(
      [
        'Manual action required before real smoke can continue.',
        `Real smoke SDK probe failed for ${workspacePath}.`,
        `SDK root: ${sdkHome}`,
        'Cause: the selected HarmonyOS SDK root is not writable for hvigor.',
        ...buildRealSmokeSdkRecoverySteps(status).map((step, index) => `${index + 1}. ${step}`),
        `Retry after fixing the SDK setup: ${retryCommand}`,
        'Probe command:',
        status.command,
        summarizeProbeOutputForError(status.output),
      ].join('\n'),
    );
  }

  if (status.kind === 'sdkComponentMissing') {
    return new Error(
      [
        'Manual action required before real smoke can continue.',
        `Real smoke SDK probe failed for ${workspacePath}.`,
        `SDK root: ${sdkHome}`,
        'Cause: required HarmonyOS SDK components are missing for the selected runtime/device type.',
        ...layoutHints,
        ...buildRealSmokeSdkRecoverySteps(status).map((step, index) => `${index + 1}. ${step}`),
        `Retry after fixing the SDK setup: ${retryCommand}`,
        'Probe command:',
        status.command,
        summarizeProbeOutputForError(status.output),
      ].join('\n'),
    );
  }

  if (status.kind === 'deviceTypeNotSupported') {
    return new Error(
      [
        'Manual action required before real smoke can continue.',
        `Real smoke SDK probe failed for ${workspacePath}.`,
        `SDK root: ${sdkHome}`,
        'Cause: the selected SDK root does not provide the device type definitions required by the real smoke fixture.',
        ...buildRealSmokeSdkRecoverySteps(status).map((step, index) => `${index + 1}. ${step}`),
        `Retry after fixing the SDK setup: ${retryCommand}`,
        'Probe command:',
        status.command,
        summarizeProbeOutputForError(status.output),
      ].join('\n'),
    );
  }

  return new Error(
    [
      'Manual action required before real smoke can continue.',
      `Real smoke SDK probe failed for ${workspacePath}.`,
      `SDK root: ${sdkHome}`,
      `Retry after fixing the SDK setup: ${retryCommand}`,
      'Probe command:',
      status.command,
      summarizeProbeOutputForError(status.output),
    ].join('\n'),
  );
}

function buildRealSmokeSdkSelectionError(
  workspacePath: string,
  failures: Array<{ sdkHome: string; probe: RealSmokeSdkProbeStatus }>,
): Error {
  const retryCommand = buildRealSmokeRetryCommand();
  const details = failures.map(({ sdkHome, probe }) =>
    `- ${sdkHome}: ${describeRealSmokeSdkProbeFailure(probe)}`,
  );
  const mostActionable = failures.find(({ probe }) => probe.kind === 'sdkLicenseNotAccepted')
    ?? failures.find(({ probe }) => probe.kind === 'sdkHomeMissing')
    ?? failures.find(({ probe }) => probe.kind === 'sdkPathNotWritable')
    ?? failures.find(({ probe }) => probe.kind === 'sdkComponentMissing')
    ?? failures.find(({ probe }) => probe.kind === 'deviceTypeNotSupported')
    ?? failures[0];
  const layoutHints = mostActionable ? describeRealSmokeSdkLayout(mostActionable.sdkHome) : [];

  return new Error(
    [
      'Manual action required before real smoke can continue.',
      `No usable HarmonyOS SDK root passed the smoke probe for ${workspacePath}.`,
      'Tried SDK roots:',
      ...details,
      ...layoutHints,
      ...buildRealSmokeSdkRecoverySteps(mostActionable.probe).map((step, index) => `${index + 1}. ${step}`),
      `Retry after fixing the SDK setup: ${retryCommand}`,
      'Last probe command:',
      mostActionable.probe.command,
      summarizeProbeOutputForError(mostActionable.probe.output),
    ].join('\n'),
  );
}

function buildRealSmokeSdkRecoverySteps(status: RealSmokeSdkProbeStatus): string[] {
  if (
    status.kind === 'sdkLicenseNotAccepted'
    || status.kind === 'sdkHomeMissing'
    || status.kind === 'sdkPathNotWritable'
    || status.kind === 'sdkComponentMissing'
  ) {
    return getHvigorFailureRecoverySteps({
      kind: status.kind,
      message: status.output,
      hints: [],
    });
  }

  if (status.kind === 'deviceTypeNotSupported') {
    return [
      'Install a HarmonyOS SDK variant that matches the smoke fixture device type, or choose one explicitly via HARMONY_E2E_SDK_HOME.',
      'For phone emulator smoke tests, prefer a DevEco Studio SDK root whose ets/api/device-define contains phone.json or phone-hmos.json.',
      'Then rerun pnpm test:e2e.',
    ];
  }

  return [];
}

function describeRealSmokeSdkProbeFailure(status: RealSmokeSdkProbeStatus): string {
  switch (status.kind) {
    case 'sdkLicenseNotAccepted':
      return 'SDK license not accepted';
    case 'sdkHomeMissing':
      return 'sdk.dir / OHOS_BASE_SDK_HOME is missing or invalid';
    case 'sdkPathNotWritable':
      return 'SDK root is not writable';
    case 'sdkComponentMissing':
      return 'required HarmonyOS SDK components are missing';
    case 'deviceTypeNotSupported':
      return 'SDK root does not support the fixture device types';
    case 'unknown':
    default:
      return status.output
        .split('\n')
        .map((line) => line.trim())
        .find((line) => Boolean(line))
        ?? 'unknown probe failure';
  }
}

function describeRealSmokeSdkLayout(sdkHome: string): string[] {
  const devecoSdkHome = deriveDevEcoSdkHome(sdkHome);
  const hints = [`Detected DevEco SDK root: ${devecoSdkHome}`];
  const normalizedSdkHome = path.normalize(sdkHome);
  const openHarmonyRoot = path.join(devecoSdkHome, 'default', 'openharmony');
  const harmonyOsRoot = path.join(devecoSdkHome, 'default', 'hms');

  const variantExpectations = getRealSmokeSdkVariantExpectations(normalizedSdkHome);
  if (variantExpectations) {
    const missingChildren = variantExpectations.requiredChildren
      .filter((child) => !fs.existsSync(path.join(normalizedSdkHome, child)));

    if (missingChildren.length > 0) {
      hints.push(
        `Detected issue: ${normalizedSdkHome} is missing ${missingChildren.join(', ')}. Re-download or repair the ${variantExpectations.displayName} SDK package in DevEco Studio.`,
      );
    } else {
      hints.push(
        `Detected issue: ${normalizedSdkHome} exists, but hvigor still reports "SDK component missing". Re-download or repair the ${variantExpectations.displayName} SDK package in DevEco Studio.`,
      );
    }

    return hints;
  }

  if (!fs.existsSync(openHarmonyRoot)) {
    hints.push(`Detected issue: ${openHarmonyRoot} is missing.`);
  }
  if (!fs.existsSync(harmonyOsRoot)) {
    hints.push(`Detected issue: ${harmonyOsRoot} is missing.`);
  }
  if (fs.existsSync(openHarmonyRoot) && fs.existsSync(harmonyOsRoot)) {
    hints.push(
      'Detected issue: the expected SDK variants exist, but hvigor still reports "SDK component missing". Re-download or repair the HarmonyOS phone SDK package in DevEco Studio.',
    );
  }

  return hints;
}

function getRealSmokeSdkVariantExpectations(
  sdkHome: string,
): { displayName: string; requiredChildren: string[] } | undefined {
  const variant = path.basename(sdkHome).toLowerCase();
  if (variant === 'hms' || variant === 'harmonyos') {
    return {
      displayName: 'HarmonyOS phone',
      requiredChildren: ['toolchains', 'ets', 'native', 'previewer'],
    };
  }

  if (variant === 'openharmony') {
    return {
      displayName: 'OpenHarmony',
      requiredChildren: ['toolchains', 'ets', 'js', 'native', 'previewer'],
    };
  }

  return undefined;
}

export async function collectSigningCandidates(signingDirs = getDefaultSigningDirs()): Promise<SigningCandidate[]> {
  const grouped = new Map<string, Partial<SigningCandidate>>();

  for (const dir of signingDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const match = entry.name.match(/^(.*)\.(p7b|p12|cer)$/i);
      if (!match) {
        continue;
      }

      const stem = match[1];
      const filePath = path.join(dir, entry.name);
      const existing = grouped.get(stem) ?? { stem };
      const ext = match[2].toLowerCase();
      if (ext === 'p7b') {
        existing.profilePath = filePath;
      } else if (ext === 'p12') {
        existing.storeFilePath = filePath;
      } else if (ext === 'cer') {
        existing.certPath = filePath;
      }
      grouped.set(stem, existing);
    }
  }

  const candidates: SigningCandidate[] = [];
  for (const entry of grouped.values()) {
    if (!entry.stem || !entry.profilePath || !entry.storeFilePath || !entry.certPath) {
      continue;
    }

    const bundleName = parseSigningProfileBundleNameForSetup(await fsp.readFile(entry.profilePath));
    candidates.push({
      stem: entry.stem,
      profilePath: entry.profilePath,
      storeFilePath: entry.storeFilePath,
      certPath: entry.certPath,
      bundleName,
    });
  }

  return candidates.sort((left, right) => left.stem.localeCompare(right.stem));
}

export function selectSigningCandidate(
  candidates: SigningCandidate[],
  preferredBundleName = REAL_SMOKE_APP_BUNDLE,
): SigningCandidate {
  if (candidates.length === 0) {
    throw new Error('No usable signing materials were found under ~/.ohos/config or ~/.ohos/config/openharmony.');
  }

  const bundleMatched = candidates.filter((candidate) => candidate.bundleName === preferredBundleName);
  const preferredPool = bundleMatched.length > 0 ? bundleMatched : candidates;
  const stemMatched = preferredPool.filter((candidate) => path.basename(candidate.stem).includes(preferredBundleName));
  const narrowedPool = stemMatched.length > 0 ? stemMatched : preferredPool;
  const autoCandidates = narrowedPool.filter((candidate) => path.basename(candidate.stem).startsWith('auto_ohos_'));
  const finalPool = autoCandidates.length > 0 ? autoCandidates : narrowedPool;

  if (finalPool.length !== 1) {
    const details = finalPool
      .map((candidate) => `- ${candidate.stem}${candidate.bundleName ? ` (${candidate.bundleName})` : ''}`)
      .join('\n');
    throw new Error(`Multiple signing candidates match the smoke app.\n${details}\nRemove duplicate local profiles or make the preferred bundle-name unique.`);
  }

  return finalPool[0];
}

export async function resolveSigningSecrets(
  candidate: SigningCandidate,
  searchRoots = getDefaultPasswordSearchRoots(),
): Promise<SigningSecrets> {
  const envKeyPassword = process.env.HARMONY_E2E_KEY_PASSWORD;
  const envStorePassword = process.env.HARMONY_E2E_STORE_PASSWORD;
  const envKeyAlias = process.env.HARMONY_E2E_KEY_ALIAS;
  const envSignAlg = process.env.HARMONY_E2E_SIGN_ALG;

  let detected: Partial<SigningSecrets> = {};
  if (!envKeyPassword || !envStorePassword) {
    detected = await findSigningSecretsInLocalBuildProfiles(candidate, searchRoots);
  }

  return {
    keyAlias: envKeyAlias ?? detected.keyAlias ?? DEFAULT_KEY_ALIAS,
    keyPassword: envKeyPassword ?? detected.keyPassword ?? DEFAULT_KEY_PASSWORD,
    signAlg: envSignAlg ?? detected.signAlg ?? DEFAULT_SIGN_ALG,
    storePassword: envStorePassword ?? detected.storePassword ?? DEFAULT_STORE_PASSWORD,
  };
}

export function selectRealSmokeEmulatorName(preferredName?: string): string | undefined {
  if (preferredName) {
    const names = detectLocalEmulatorNames();
    if (!names.includes(preferredName)) {
      throw new Error(`Configured smoke emulator not found: ${preferredName}. Available emulators: ${names.join(', ') || '[none]'}`);
    }
    return preferredName;
  }

  const envName = process.env.HARMONY_E2E_EMULATOR;
  if (envName) {
    return selectRealSmokeEmulatorName(envName);
  }

  const names = detectLocalEmulatorNames();
  if (names.length === 0) {
    throw new Error('No local HarmonyOS emulator images were found. Create an emulator in DevEco Studio first.');
  }

  const onlineTarget = getUniqueOnlineEmulatorTarget();
  if (onlineTarget) {
    const onlineName = resolveEmulatorNameFromTarget(onlineTarget, names);
    if (onlineName) {
      return onlineName;
    }
  }

  if (names.length === 1) {
    return names[0];
  }

  throw new Error(`Multiple emulator images are available (${names.join(', ')}). Set HARMONY_E2E_EMULATOR to choose one explicitly.`);
}

async function injectSigningConfig(
  workspacePath: string,
  candidate: SigningCandidate,
  secrets: SigningSecrets,
): Promise<void> {
  const buildProfilePath = path.join(workspacePath, 'build-profile.json5');
  let buildProfileText = await fsp.readFile(buildProfilePath, 'utf8');
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_CERT__', candidate.certPath);
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_KEY_ALIAS__', secrets.keyAlias);
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_KEY_PASSWORD__', secrets.keyPassword);
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_PROFILE__', candidate.profilePath);
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_SIGN_ALG__', secrets.signAlg);
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_STORE__', candidate.storeFilePath);
  buildProfileText = replacePlaceholder(buildProfileText, '__HARMONY_E2E_STORE_PASSWORD__', secrets.storePassword);
  await fsp.writeFile(buildProfilePath, buildProfileText, 'utf8');

  const bundleName = candidate.bundleName ?? REAL_SMOKE_APP_BUNDLE;
  const appJsonPath = path.join(workspacePath, 'AppScope', 'app.json5');
  const appJsonText = await fsp.readFile(appJsonPath, 'utf8');
  const bundleMatch = findJson5StringValue(appJsonText, 'bundleName');
  if (!bundleMatch) {
    throw new Error(`bundleName not found in ${appJsonPath}`);
  }
  const nextAppJson = `${appJsonText.slice(0, bundleMatch.valueStart)}${bundleName}${appJsonText.slice(bundleMatch.valueEnd)}`;
  await fsp.writeFile(appJsonPath, nextAppJson, 'utf8');
}

async function injectRealSmokeSdkConfig(workspacePath: string, sdkHome: string): Promise<void> {
  const localPropertiesPath = path.join(workspacePath, 'local.properties');
  const normalizedSdkHome = process.platform === 'win32'
    ? sdkHome.replace(/\\/g, '/')
    : sdkHome;
  await fsp.writeFile(localPropertiesPath, `sdk.dir=${normalizedSdkHome}\n`, 'utf8');
}

async function injectRealSmokeToolSettings(workspacePath: string, options: {
  sdkHome: string;
  hdcPath?: string;
  emulatorPath?: string;
}): Promise<void> {
  const vscodeDir = path.join(workspacePath, '.vscode');
  await fsp.mkdir(vscodeDir, { recursive: true });
  const settings = {
    'harmony.sdkPath': options.sdkHome,
    ...(options.hdcPath ? { 'harmony.hdcPath': options.hdcPath } : {}),
    ...(options.emulatorPath ? { 'harmony.emulatorPath': options.emulatorPath } : {}),
  };
  await fsp.writeFile(path.join(vscodeDir, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

export function resolveRealSmokeHdcPath(sdkHome: string): string | undefined {
  const hdcBinary = process.platform === 'win32' ? 'hdc.exe' : 'hdc';
  const directCandidates = [
    path.join(sdkHome, 'toolchains', hdcBinary),
    ...getSiblingSdkHomes(sdkHome).map((candidate) => path.join(candidate, 'toolchains', hdcBinary)),
  ];
  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const sdkRoots = Array.from(new Set([
    sdkHome,
    path.dirname(sdkHome),
    path.dirname(path.dirname(sdkHome)),
    ...getSiblingSdkHomes(sdkHome),
  ]));
  for (const sdkRoot of sdkRoots) {
    try {
      const candidates = buildHdcSdkCandidates(sdkRoot, fs.readdirSync(sdkRoot), process.platform)
        .filter((candidate) => candidate.endsWith(hdcBinary));
      const resolved = candidates.find((candidate) => fs.existsSync(candidate));
      if (resolved) {
        return resolved;
      }
    } catch {
      // ignore malformed SDK roots and continue searching
    }
  }

  return undefined;
}

function readRealSmokeLocalSdkDir(workspacePath: string): string | undefined {
  const localPropertiesPath = path.join(workspacePath, 'local.properties');
  if (!fs.existsSync(localPropertiesPath)) {
    return undefined;
  }

  const line = fs.readFileSync(localPropertiesPath, 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('sdk.dir='));
  if (!line) {
    return undefined;
  }

  return line
    .slice('sdk.dir='.length)
    .trim()
    .replace(/\\ /g, ' ')
    .replace(/\\:/g, ':')
    .replace(/\\=/g, '=')
    .replace(/\\\\/g, '\\');
}

function resolveRealSmokeEmulatorPath(homeDir: string): string | undefined {
  const candidates = getEmulatorBinaryCandidatePaths({
    platform: process.platform,
    env: {
      ...process.env,
      HOME: process.env.HOME || homeDir,
      USERPROFILE: process.env.USERPROFILE || homeDir,
    },
  });

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function replacePlaceholder(text: string, placeholder: string, nextValue: string): string {
  const pattern = new RegExp(`(["'])${escapeRegExp(placeholder)}\\1`, 'g');
  return text.replace(pattern, JSON.stringify(nextValue));
}

function readRealSmokeFixtureRequirements(
  workspacePath: string,
  fallback: {
    fallbackRuntimeOS?: string;
    fallbackDeviceTypes?: string[];
  } = {},
): RealSmokeFixtureRequirements {
  const buildProfileCandidates = [
    path.join(workspacePath, 'build-profile.json5'),
    path.join(workspacePath, 'entry', 'build-profile.json5'),
  ];

  let runtimeOS = fallback.fallbackRuntimeOS;
  for (const candidate of buildProfileCandidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const text = fs.readFileSync(candidate, 'utf8');
    runtimeOS = extractJson5StringValue(text, 'runtimeOS') ?? runtimeOS;
    if (runtimeOS) {
      break;
    }
  }

  const moduleJsonPath = path.join(workspacePath, 'entry', 'src', 'main', 'module.json5');
  const deviceTypes = fs.existsSync(moduleJsonPath)
    ? extractDeviceTypesFromModuleJson(fs.readFileSync(moduleJsonPath, 'utf8'))
    : (fallback.fallbackDeviceTypes ?? []);

  return {
    runtimeOS,
    deviceTypes,
  };
}

function extractDeviceTypesFromModuleJson(text: string): string[] {
  const match = text.match(/(?:["']deviceTypes["']|deviceTypes)\s*:\s*\[([\s\S]*?)\]/);
  if (!match?.[1]) {
    return [];
  }

  return Array.from(match[1].matchAll(/["']([^"']+)["']/g))
    .map((entry) => entry[1].trim())
    .filter(Boolean);
}

function expandRealSmokeSdkHomeCandidates(
  sdkRoots: string[],
  requirements: RealSmokeFixtureRequirements,
  platform: NodeJS.Platform,
): string[] {
  const explicitRoots = new Set(
    sdkRoots
      .map((candidate) => path.normalize(candidate))
      .filter(Boolean),
  );
  const actualHomes = sdkRoots.flatMap((sdkRoot) =>
    collectRealSmokeSdkHomes(path.normalize(sdkRoot), requirements.runtimeOS, platform),
  );
  return Array.from(new Set(actualHomes))
    .sort((left, right) =>
      scoreRealSmokeSdkHome(right, requirements, explicitRoots)
      - scoreRealSmokeSdkHome(left, requirements, explicitRoots)
      || left.localeCompare(right),
    );
}

function collectRealSmokeSdkHomes(
  sdkRoot: string,
  runtimeOS: string | undefined,
  platform: NodeJS.Platform,
): string[] {
  if (!fs.existsSync(sdkRoot)) {
    return [];
  }

  const homes: string[] = [];
  if (looksLikeRealSmokeSdkHome(sdkRoot)) {
    homes.push(sdkRoot);
  }

  const defaultRoot = path.basename(sdkRoot).toLowerCase() === 'default'
    ? sdkRoot
    : path.join(sdkRoot, 'default');
  if (fs.existsSync(defaultRoot)) {
    for (const variant of getRuntimeSdkVariantOrder(runtimeOS)) {
      const candidate = path.join(defaultRoot, variant);
      if (looksLikeRealSmokeSdkHome(candidate)) {
        homes.push(candidate);
      }
    }
  }

  try {
    const versionHomes = fs.readdirSync(sdkRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => path.join(sdkRoot, entry.name))
      .filter((candidate) => looksLikeRealSmokeSdkHome(candidate))
      .sort((left, right) => extractSdkVersion(right, platform) - extractSdkVersion(left, platform));
    homes.push(...versionHomes);
  } catch {
    // ignore malformed SDK roots
  }

  return Array.from(new Set(homes.map((candidate) => path.normalize(candidate))));
}

function getRuntimeSdkVariantOrder(runtimeOS: string | undefined): string[] {
  const normalized = runtimeOS?.trim().toLowerCase();
  if (normalized === 'harmonyos') {
    return ['hms', 'harmonyos', 'openharmony'];
  }
  if (normalized === 'openharmony') {
    return ['openharmony', 'harmonyos', 'hms'];
  }
  return ['hms', 'openharmony', 'harmonyos'];
}

function looksLikeRealSmokeSdkHome(candidate: string): boolean {
  try {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  return fs.existsSync(path.join(candidate, 'ets', 'api'))
    || fs.existsSync(path.join(candidate, 'toolchains'))
    || fs.existsSync(path.join(candidate, 'js', 'api'));
}

function scoreRealSmokeSdkHome(
  sdkHome: string,
  requirements: RealSmokeFixtureRequirements,
  explicitRoots: Set<string>,
): number {
  const normalized = path.normalize(sdkHome);
  const lower = normalized.replace(/\\/g, '/').toLowerCase();
  let score = 0;

  if (Array.from(explicitRoots).some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`))) {
    score += 1_000;
  }

  const runtimeOS = requirements.runtimeOS?.trim().toLowerCase();
  if (runtimeOS === 'harmonyos') {
    if (lower.includes('/default/hms') || lower.includes('/hms/')) {
      score += 500;
    } else if (lower.includes('/harmonyos/')) {
      score += 400;
    } else if (lower.includes('/openharmony/')) {
      score -= 100;
    }
  } else if (runtimeOS === 'openharmony') {
    if (lower.includes('/openharmony/')) {
      score += 500;
    } else if (lower.includes('/harmonyos/') || lower.includes('/hms/')) {
      score -= 100;
    }
  }

  score += extractSdkVersion(sdkHome, process.platform);
  return score;
}

function extractSdkVersion(candidate: string, platform: NodeJS.Platform): number {
  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  const basename = platformPath.basename(candidate);
  return /^\d+$/.test(basename) ? Number(basename) : 0;
}

function probeRealSmokeSdkCompatibility(
  sdkHome: string,
  requirements: RealSmokeFixtureRequirements,
): RealSmokeSdkProbeStatus {
  if (requirements.deviceTypes.length === 0) {
    return {
      ok: true,
      kind: 'ready',
      command: `inspect ${path.join(sdkHome, 'ets', 'api', 'device-define')}`,
      output: 'No fixture deviceTypes were declared.',
    };
  }

  const deviceDefineDir = path.join(sdkHome, 'ets', 'api', 'device-define');
  if (!fs.existsSync(deviceDefineDir)) {
    return {
      ok: false,
      kind: 'deviceTypeNotSupported',
      command: `inspect ${deviceDefineDir}`,
      output: `SDK root ${sdkHome} does not contain ets/api/device-define, so it cannot satisfy deviceTypes: ${requirements.deviceTypes.join(', ')}.`,
    };
  }

  const missing = requirements.deviceTypes.filter((deviceType) => {
    const direct = path.join(deviceDefineDir, `${deviceType}.json`);
    const hmos = path.join(deviceDefineDir, `${deviceType}-hmos.json`);
    return !fs.existsSync(direct) && !fs.existsSync(hmos);
  });

  if (missing.length === 0) {
    return {
      ok: true,
      kind: 'ready',
      command: `inspect ${deviceDefineDir}`,
      output: `SDK root ${sdkHome} supports deviceTypes: ${requirements.deviceTypes.join(', ')}.`,
    };
  }

  const available = fs.readdirSync(deviceDefineDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/i, ''))
    .sort();

  return {
    ok: false,
    kind: 'deviceTypeNotSupported',
    command: `inspect ${deviceDefineDir}`,
    output: `SDK root ${sdkHome} does not provide deviceTypes ${missing.join(', ')} for runtimeOS ${requirements.runtimeOS ?? 'unknown'}. Available definitions: ${available.join(', ') || '[none]'}.`,
  };
}

function getSiblingSdkHomes(sdkHome: string): string[] {
  const parent = path.dirname(sdkHome);
  if (path.basename(parent).toLowerCase() !== 'default') {
    return [];
  }

  return ['openharmony', 'harmonyos', 'hms']
    .map((variant) => path.join(parent, variant))
    .filter((candidate) => candidate !== sdkHome && looksLikeRealSmokeSdkHome(candidate));
}

async function resetRealSmokeWorkspace(fixturePath: string, workspacePath: string): Promise<void> {
  await fsp.rm(workspacePath, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(workspacePath), { recursive: true });
  await fsp.cp(fixturePath, workspacePath, { recursive: true });
}

async function seedRealSmokeHvigorCacheFromExistingWorkspace(
  targetStatus: HvigorBootstrapStatus,
  homeDir: string,
): Promise<boolean> {
  const sourceWorkspace = findReusableHvigorWorkspace(homeDir, targetStatus.projectHash);
  if (!sourceWorkspace) {
    return false;
  }

  const targetWorkspaceRoot = path.dirname(targetStatus.nodeModulesPath);
  await fsp.mkdir(path.dirname(targetWorkspaceRoot), { recursive: true });
  await fsp.rm(targetWorkspaceRoot, { recursive: true, force: true });
  await fsp.cp(sourceWorkspace, targetWorkspaceRoot, { recursive: true, force: true });
  return true;
}

function findReusableHvigorWorkspace(homeDir: string, targetProjectHash: string): string | undefined {
  const cachesRoot = path.join(homeDir, '.hvigor', 'project_caches');
  if (!fs.existsSync(cachesRoot)) {
    return undefined;
  }

  const candidates = fs.readdirSync(cachesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== targetProjectHash)
    .map((entry) => path.join(cachesRoot, entry.name, 'workspace'))
    .filter((workspaceRoot) => hasReusableHvigorPackages(workspaceRoot));

  const preferred = candidates.find((workspaceRoot) =>
    fs.existsSync(path.join(workspaceRoot, 'node_modules', '.pnpm')) &&
    fs.existsSync(path.join(workspaceRoot, 'package.json')),
  );

  return preferred ?? candidates[0];
}

function hasReusableHvigorPackages(workspaceRoot: string): boolean {
  return REAL_SMOKE_REQUIRED_HVIGOR_PACKAGES.every((packageName) =>
    fs.existsSync(path.join(workspaceRoot, 'node_modules', ...packageName.split('/'))),
  );
}

function runHvigorBootstrapWarmup(options: {
  workspacePath: string;
  platform: NodeJS.Platform;
  timeoutMs: number;
}): HvigorBootstrapRunResult {
  const sdkHome = readRealSmokeLocalSdkDir(options.workspacePath);
  const devecoSdkHome = sdkHome ? deriveDevEcoSdkHome(sdkHome, options.platform) : undefined;
  const env = {
    ...process.env,
    ...(sdkHome ? {
      OHOS_BASE_SDK_HOME: sdkHome,
      DEVECO_SDK_HOME: devecoSdkHome ?? sdkHome,
    } : {}),
    npm_config_fetch_retries: '0',
    npm_config_fetch_retry_factor: '1',
    npm_config_fetch_retry_mintimeout: '1000',
    npm_config_fetch_retry_maxtimeout: '1000',
  };
  const spec = getHvigorBootstrapSpawnSpec(options.platform);
  const result = spawnSync(spec.command, spec.args, {
    cwd: options.workspacePath,
    env,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    windowsHide: true,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    errorMessage: result.error?.message,
  };
}

function runHvigorSdkProbe(options: {
  workspacePath: string;
  platform: NodeJS.Platform;
  timeoutMs: number;
  sdkHome: string;
}): HvigorBootstrapRunResult {
  const devecoSdkHome = deriveDevEcoSdkHome(options.sdkHome, options.platform);
  const env = {
    ...process.env,
    OHOS_BASE_SDK_HOME: options.sdkHome,
    DEVECO_SDK_HOME: devecoSdkHome,
  };
  const spec = getHvigorSdkProbeSpawnSpec(options.platform);
  const result = spawnSync(spec.command, spec.args, {
    cwd: options.workspacePath,
    env,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    windowsHide: true,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    errorMessage: result.error?.message,
  };
}

async function findSigningSecretsInLocalBuildProfiles(
  candidate: SigningCandidate,
  searchRoots: string[],
): Promise<Partial<SigningSecrets>> {
  const profiles = await collectNamedFiles(searchRoots, 'build-profile.json5', 6);
  const expectedNames = new Set([
    path.basename(candidate.profilePath),
    path.basename(candidate.storeFilePath),
    path.basename(candidate.certPath),
  ]);

  for (const buildProfilePath of profiles) {
    const text = await fsp.readFile(buildProfilePath, 'utf8').catch(() => undefined);
    if (!text) {
      continue;
    }

    const materialValues = [
      extractJson5StringValue(text, 'profile'),
      extractJson5StringValue(text, 'storeFile'),
      extractJson5StringValue(text, 'certpath'),
    ].filter((value): value is string => Boolean(value));
    const hasMatchingMaterial = materialValues.some((value) => expectedNames.has(path.basename(value)));
    if (!hasMatchingMaterial) {
      continue;
    }

    const keyPassword = extractJson5StringValue(text, 'keyPassword');
    const storePassword = extractJson5StringValue(text, 'storePassword');
    if (!keyPassword || !storePassword) {
      continue;
    }

    return {
      keyAlias: extractJson5StringValue(text, 'keyAlias') ?? DEFAULT_KEY_ALIAS,
      keyPassword,
      signAlg: extractJson5StringValue(text, 'signAlg') ?? DEFAULT_SIGN_ALG,
      storePassword,
    };
  }

  return {};
}

async function collectNamedFiles(
  roots: string[],
  fileName: string,
  maxDepth: number,
): Promise<string[]> {
  const results: string[] = [];
  for (const root of roots) {
    await walk(root, 0, maxDepth, fileName, results);
  }
  return results;
}

async function walk(
  currentPath: string,
  depth: number,
  maxDepth: number,
  fileName: string,
  results: string[],
): Promise<void> {
  if (!currentPath || depth > maxDepth || !fs.existsSync(currentPath)) {
    return;
  }

  const stat = await fsp.stat(currentPath).catch(() => undefined);
  if (!stat) {
    return;
  }

  if (stat.isFile()) {
    if (path.basename(currentPath) === fileName) {
      results.push(currentPath);
    }
    return;
  }

  const base = path.basename(currentPath);
  if (base === '.git' || base === 'node_modules' || base === 'build' || base === 'dist' || base.startsWith('.vscode')) {
    return;
  }

  const entries = await fsp.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    await walk(path.join(currentPath, entry.name), depth + 1, maxDepth, fileName, results);
  }
}

function detectLocalEmulatorNames(): string[] {
  const names = new Set<string>();
  for (const dir of getEmulatorSearchDirs({ platform: process.platform, env: process.env })) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        names.add(entry.name);
      }
    }
  }

  if (names.size > 0) {
    return [...names].sort();
  }

  const emulatorBinary = resolveEmulatorBinaryForE2E();
  if (!emulatorBinary) {
    return [];
  }

  try {
    const stdout = execFileSync(emulatorBinary, ['-list'], {
      encoding: 'utf8',
      shell: shouldUseBatchShell(emulatorBinary),
      timeout: 5000,
    });
    return parseListedEmulatorsForSetup(stdout).sort();
  } catch {
    return [];
  }
}

function getUniqueOnlineEmulatorTarget(): string | undefined {
  const hdc = resolveHdcBinaryForE2E();
  if (!hdc) {
    return undefined;
  }

  try {
    const stdout = execFileSync(hdc, ['list', 'targets'], {
      encoding: 'utf8',
      shell: shouldUseBatchShell(hdc),
      timeout: 5000,
    });
    const targets = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== '[Empty]');
    const emulators = targets.filter(isEmulatorTarget);
    return emulators.length === 1 ? emulators[0] : undefined;
  } catch {
    return undefined;
  }
}

function resolveEmulatorNameFromTarget(target: string, emulatorNames: string[]): string | undefined {
  const hdc = resolveHdcBinaryForE2E();
  if (!hdc) {
    return undefined;
  }

  try {
    const stdout = execFileSync(hdc, ['-t', target, 'shell', 'param get const.product.model'], {
      encoding: 'utf8',
      shell: shouldUseBatchShell(hdc),
      timeout: 5000,
    }).trim();
    if (!stdout) {
      return undefined;
    }

    return emulatorNames.find((name) => normalizeName(name) === normalizeName(stdout))
      ?? emulatorNames.find((name) => normalizeName(stdout).includes(normalizeName(name)))
      ?? emulatorNames.find((name) => normalizeName(name).includes(normalizeName(stdout)));
  } catch {
    return undefined;
  }
}

function resolveEmulatorBinaryForE2E(): string | undefined {
  for (const candidate of getEmulatorBinaryCandidatePaths({ platform: process.platform, env: process.env })) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolveHdcBinaryForE2E(): string | undefined {
  const fromPath = resolveExecutableFromPath(process.platform === 'win32' ? 'hdc.exe' : 'hdc');
  if (fromPath) {
    return fromPath;
  }

  for (const candidate of getHdcCandidatePathsForE2E()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getHdcCandidatePathsForE2E(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const hdcBinary = process.platform === 'win32' ? 'hdc.exe' : 'hdc';
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    for (const root of [
      path.join(home, 'Library', 'OpenHarmony', 'Sdk'),
      path.join(home, 'Library', 'Huawei', 'Sdk'),
      path.join(home, 'Library', 'HarmonyOS', 'Sdk'),
      '/Applications/DevEco-Studio.app/Contents/sdk',
    ]) {
      candidates.push(...findHdcInSdkRoot(root, hdcBinary));
    }
  } else if (process.platform === 'win32') {
    for (const root of [
      path.join(home, 'AppData', 'Local', 'OpenHarmony', 'Sdk'),
      path.join(home, 'AppData', 'Local', 'Huawei', 'Sdk'),
      path.join(home, 'AppData', 'Local', 'HarmonyOS', 'Sdk'),
      'C:\\DevEcoStudio\\sdk',
      'C:\\Program Files\\Huawei\\DevEco Studio\\sdk',
    ]) {
      candidates.push(...findHdcInSdkRoot(root, hdcBinary));
    }
  }

  candidates.push(
    ...buildCommandLineToolCandidates(
      'hdc',
      getCommandLineToolRoots({ platform: process.platform, env: process.env }),
      process.platform,
    ),
  );

  return Array.from(new Set(candidates));
}

function findHdcInSdkRoot(sdkRoot: string, hdcBinary: string): string[] {
  try {
    if (!fs.existsSync(sdkRoot)) {
      return [];
    }
    return buildHdcSdkCandidates(sdkRoot, fs.readdirSync(sdkRoot), process.platform)
      .filter((candidate) => candidate.endsWith(hdcBinary));
  } catch {
    return [];
  }
}

function resolveExecutableFromPath(command: string): string | undefined {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  try {
    const stdout = execFileSync(lookup, [command], { encoding: 'utf8', timeout: 3000 });
    const first = stdout.split('\n').map((line) => line.trim()).find(Boolean);
    return first && fs.existsSync(first) ? first : undefined;
  } catch {
    return undefined;
  }
}

function getDefaultSigningDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.ohos', 'config'),
    path.join(home, '.ohos', 'config', 'openharmony'),
  ];
}

function getDefaultPasswordSearchRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
  ];
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function resolveHvigorHashInputPath(workspacePath: string): string {
  try {
    return fs.realpathSync.native?.(workspacePath) ?? fs.realpathSync(workspacePath);
  } catch {
    return path.resolve(workspacePath);
  }
}

function buildHvigorBootstrapCommand(workspacePath: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `cd /d "${workspacePath}" && hvigorw.bat --mode module assembleHap -p product=default -p buildMode=debug`;
  }

  if (platform === 'darwin') {
    return `cd "${workspacePath}" && zsh hvigorw --mode module assembleHap -p product=default -p buildMode=debug`;
  }

  return `cd "${workspacePath}" && sh ./hvigorw --mode module assembleHap -p product=default -p buildMode=debug`;
}

function buildHvigorSdkProbeCommand(workspacePath: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `cd /d "${workspacePath}" && hvigorw.bat tasks --no-daemon`;
  }

  if (platform === 'darwin') {
    return `cd "${workspacePath}" && zsh hvigorw tasks --no-daemon`;
  }

  return `cd "${workspacePath}" && sh ./hvigorw tasks --no-daemon`;
}

function getHvigorBootstrapSpawnSpec(platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'hvigorw.bat --mode module assembleHap -p product=default -p buildMode=debug'],
    };
  }

  if (platform === 'darwin') {
    return {
      command: 'zsh',
      args: ['hvigorw', '--mode', 'module', 'assembleHap', '-p', 'product=default', '-p', 'buildMode=debug'],
    };
  }

  return {
    command: 'sh',
    args: ['./hvigorw', '--mode', 'module', 'assembleHap', '-p', 'product=default', '-p', 'buildMode=debug'],
  };
}

function getHvigorSdkProbeSpawnSpec(platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'hvigorw.bat tasks --no-daemon'],
    };
  }

  if (platform === 'darwin') {
    return {
      command: 'zsh',
      args: ['hvigorw', 'tasks', '--no-daemon'],
    };
  }

  return {
    command: 'sh',
    args: ['./hvigorw', 'tasks', '--no-daemon'],
  };
}

function summarizeWarmupFailure(result: HvigorBootstrapRunResult): string {
  const output = [result.stderr, result.stdout, result.errorMessage ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();
  const summary = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6)
    .join('\n');
  const codeLine = result.exitCode === null || result.exitCode === undefined
    ? 'Warm-up process did not exit cleanly.'
    : `Warm-up exited with code ${result.exitCode}.`;

  return summary ? `${codeLine}\n${summary}` : codeLine;
}

function summarizeProbeOutput(result: HvigorBootstrapRunResult): string {
  return [result.stderr, result.stdout, result.errorMessage ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();
}

function summarizeProbeOutputForError(output: string): string {
  const normalized = stripAnsi(output);
  const summary = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 8)
    .join('\n');
  return `Probe output:\n${summary}`;
}

function buildRealSmokeRetryCommand(): string {
  const emulatorName = process.env.HARMONY_E2E_EMULATOR;
  return emulatorName
    ? `HARMONY_E2E_EMULATOR='${emulatorName.replace(/'/g, `'\\''`)}' pnpm test:e2e`
    : 'pnpm test:e2e';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseListedEmulatorsForSetup(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isEmulatorTarget(target: string): boolean {
  return target.includes('127.0.0.1') || target.includes('localhost') || target.includes('emulator');
}

function parseSigningProfileBundleNameForSetup(content: Uint8Array | string): string | undefined {
  const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
  const start = text.indexOf('{');
  if (start < 0) {
    return undefined;
  }

  const end = findMatchingBrace(text, start);
  if (end < 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      'bundle-info'?: {
        'bundle-name'?: string;
      };
    };
    return parsed['bundle-info']?.['bundle-name'];
  } catch {
    return undefined;
  }
}

function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let quote: '"' | '\'' | undefined;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}
