import * as vscode from 'vscode';
import { formatHvigorProjectSetupIssue, resolveHvigorExecution, type ResolvedHvigorExecution } from '../utils/hvigor';
import {
  formatSigningBundleNameMismatch,
  formatSigningProfileSetupIssue,
  inspectSigningProfileSetup,
  type SigningProfileSetup,
} from '../project/signingProfile';
import {
  buildLocalSigningPathCopyText,
  buildLocalSigningRecoverySteps,
  discoverLocalSigningMaterials,
  type LocalSigningCandidate,
} from '../project/localSigning';
import { readBundleName } from '../utils/projectMetadata';

export interface SigningRecoveryHint {
  message: string;
  steps: string[];
  candidate?: LocalSigningCandidate;
  copyText?: string;
}

export interface AssembleHapPreflightResult {
  hvigorExecution: ResolvedHvigorExecution;
  signingSetup?: SigningProfileSetup;
  signingRecoveryHint?: SigningRecoveryHint;
  blockingMessage?: string;
  warnings: string[];
}

export async function resolveAssembleHapPreflight(
  rootPath: string,
  options: {
    task?: string;
    powershellCall?: boolean;
  } = {},
): Promise<AssembleHapPreflightResult> {
  const rootUri = vscode.Uri.file(rootPath);
  const hvigorExecution = await resolveHvigorExecution(rootPath, {
    task: options.task ?? 'assembleHap',
    ...options,
  });

  if (
    !hvigorExecution.projectSetup.exists && !hvigorExecution.executablePath
    || (hvigorExecution.projectSetup.missingRuntimePaths.length > 0 && hvigorExecution.source !== 'external')
  ) {
    return {
      hvigorExecution,
      blockingMessage: formatHvigorProjectSetupIssue(rootPath, hvigorExecution.projectSetup),
      warnings: [...hvigorExecution.warnings],
    };
  }

  const signingSetup = await inspectSigningProfileSetup(rootUri);
  const appBundleName = await readBundleName(rootUri).catch(() => undefined);
  const signingDiscovery = await discoverLocalSigningMaterials(signingSetup?.bundleName ?? appBundleName);
  if (signingSetup?.configured && (!signingSetup.exists || !signingSetup.readable)) {
    const signingRecoveryHint = buildSigningRecoveryHint(signingDiscovery, appBundleName);
    return {
      hvigorExecution,
      signingSetup,
      signingRecoveryHint,
      blockingMessage: formatSigningProfileSetupIssue(signingSetup),
      warnings: [
        ...hvigorExecution.warnings,
        ...signingSetup.warnings,
        ...(signingRecoveryHint ? [signingRecoveryHint.message] : []),
      ],
    };
  }

  if (signingSetup?.bundleName && appBundleName && appBundleName !== signingSetup.bundleName) {
    return {
      hvigorExecution,
      signingSetup,
      blockingMessage: formatSigningBundleNameMismatch(appBundleName, signingSetup.bundleName),
      warnings: [...hvigorExecution.warnings, ...signingSetup.warnings],
    };
  }

  return {
    hvigorExecution,
    signingSetup,
    warnings: [
      ...hvigorExecution.warnings,
      ...(signingSetup?.warnings ?? []),
      ...(
        !signingSetup?.configured
        || signingSetup.warnings.length > 0
          ? buildOptionalSigningDiscoveryWarnings(signingDiscovery, appBundleName)
          : []
      ),
    ],
  };
}

function buildSigningRecoveryHint(
  discovery: Awaited<ReturnType<typeof discoverLocalSigningMaterials>>,
  appBundleName: string | undefined,
): SigningRecoveryHint | undefined {
  if (discovery.status === 'found' && discovery.candidate) {
    return {
      message: '检测到当前机器上有可用的本地签名材料，可直接复用到 build-profile.json5。',
      steps: buildLocalSigningRecoverySteps(discovery.candidate, { bundleName: appBundleName }),
      candidate: discovery.candidate,
      copyText: buildLocalSigningPathCopyText(discovery.candidate),
    };
  }

  if (discovery.status === 'ambiguous') {
    return {
      message: `当前机器上找到了多个可用签名候选，插件不会自动猜测。${discovery.candidates.map((candidate) => candidate.stem).join(', ')}`,
      steps: [
        '打开默认签名目录 ~/.ohos/config、~/.ohos/config/openharmony，或你在 harmony.signingSearchPaths 里配置的目录，确认哪一组 .p7b / .p12 / .cer 与当前工程匹配。',
        '优先选择 bundle-name 与 AppScope/app.json5 一致的那组，再手动更新 build-profile.json5。',
      ],
    };
  }

  return undefined;
}

function buildOptionalSigningDiscoveryWarnings(
  discovery: Awaited<ReturnType<typeof discoverLocalSigningMaterials>>,
  appBundleName: string | undefined,
): string[] {
  if (discovery.status === 'found' && discovery.candidate) {
    const bundleSuffix = appBundleName ? `（bundleName: ${appBundleName}）` : '';
    return [`本机已发现可用签名材料${bundleSuffix}: ${discovery.candidate.stem}`];
  }

  if (discovery.status === 'ambiguous') {
    return [`本机找到了多个可用签名候选，需手动选择: ${discovery.candidates.map((candidate) => candidate.stem).join(', ')}`];
  }

  return [];
}
