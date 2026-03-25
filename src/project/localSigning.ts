import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { readSigningProfileBundleName } from './signingProfile';

export interface LocalSigningCandidate {
  stem: string;
  profilePath: string;
  storeFilePath: string;
  certPath: string;
  bundleName?: string;
}

export interface LocalSigningDiscoveryResult {
  status: 'found' | 'ambiguous' | 'none';
  searchRoots: string[];
  candidates: LocalSigningCandidate[];
  candidate?: LocalSigningCandidate;
}

export function getDefaultLocalSigningDirs(homeDir = os.homedir()): string[] {
  return [
    path.join(homeDir, '.ohos', 'config'),
    path.join(homeDir, '.ohos', 'config', 'openharmony'),
  ];
}

export function getConfiguredLocalSigningDirs(
  homeDir = os.homedir(),
): string[] {
  const configured = vscode.workspace.getConfiguration('harmony').get<unknown>('signingSearchPaths', []);
  const values = Array.isArray(configured)
    ? configured
    : typeof configured === 'string'
      ? configured.split(/[\n,;]/)
      : [];

  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => expandHomePath(value, homeDir));
}

export function getEffectiveLocalSigningDirs(
  homeDir = os.homedir(),
): string[] {
  return Array.from(new Set([
    ...getConfiguredLocalSigningDirs(homeDir),
    ...getDefaultLocalSigningDirs(homeDir),
  ]));
}

export async function collectLocalSigningCandidates(
  searchRoots = getEffectiveLocalSigningDirs(),
): Promise<LocalSigningCandidate[]> {
  const grouped = new Map<string, Partial<LocalSigningCandidate>>();

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) {
      continue;
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const match = entry.name.match(/^(.*)\.(p7b|p12|cer)$/i);
      if (!match) {
        continue;
      }

      const stem = match[1];
      const candidate = grouped.get(stem) ?? { stem };
      const filePath = path.join(root, entry.name);
      const ext = match[2].toLowerCase();
      if (ext === 'p7b') {
        candidate.profilePath = filePath;
      } else if (ext === 'p12') {
        candidate.storeFilePath = filePath;
      } else if (ext === 'cer') {
        candidate.certPath = filePath;
      }
      grouped.set(stem, candidate);
    }
  }

  const candidates: LocalSigningCandidate[] = [];
  for (const item of grouped.values()) {
    if (!item.stem || !item.profilePath || !item.storeFilePath || !item.certPath) {
      continue;
    }

    candidates.push({
      stem: item.stem,
      profilePath: item.profilePath,
      storeFilePath: item.storeFilePath,
      certPath: item.certPath,
      bundleName: await readSigningProfileBundleName(item.profilePath),
    });
  }

  return candidates.sort((left, right) => left.stem.localeCompare(right.stem));
}

export async function discoverLocalSigningMaterials(
  preferredBundleName?: string,
  searchRoots = getEffectiveLocalSigningDirs(),
): Promise<LocalSigningDiscoveryResult> {
  const candidates = await collectLocalSigningCandidates(searchRoots);
  if (candidates.length === 0) {
    return {
      status: 'none',
      searchRoots,
      candidates,
    };
  }

  const preferred = preferredBundleName?.trim();
  const bundleMatched = preferred
    ? candidates.filter((candidate) => candidate.bundleName === preferred)
    : [];
  const preferredPool = bundleMatched.length > 0 ? bundleMatched : candidates;
  const stemMatched = preferred
    ? preferredPool.filter((candidate) => path.basename(candidate.stem).includes(preferred))
    : [];
  const narrowedPool = stemMatched.length > 0 ? stemMatched : preferredPool;
  const autoCandidates = narrowedPool.filter((candidate) => path.basename(candidate.stem).startsWith('auto_ohos_'));
  const finalPool = autoCandidates.length > 0 ? autoCandidates : narrowedPool;

  if (preferred && bundleMatched.length === 0 && stemMatched.length === 0) {
    return {
      status: 'none',
      searchRoots,
      candidates,
    };
  }

  if (finalPool.length === 1) {
    return {
      status: 'found',
      searchRoots,
      candidates,
      candidate: finalPool[0],
    };
  }

  return {
    status: 'ambiguous',
    searchRoots,
    candidates: finalPool,
  };
}

export function buildLocalSigningPathCopyText(candidate: LocalSigningCandidate): string {
  return [
    `profile: "${candidate.profilePath}"`,
    `storeFile: "${candidate.storeFilePath}"`,
    `certpath: "${candidate.certPath}"`,
  ].join('\n');
}

export function buildLocalSigningRecoverySteps(
  candidate: LocalSigningCandidate,
  options: {
    bundleName?: string;
  } = {},
): string[] {
  const steps = [
    '打开项目根目录 build-profile.json5，保留现有 storePassword / keyAlias / keyPassword / signAlg 不变。',
    `把 profile 改成: ${candidate.profilePath}`,
    `把 storeFile 改成: ${candidate.storeFilePath}`,
    `把 certpath 改成: ${candidate.certPath}`,
  ];

  if (candidate.bundleName && options.bundleName && candidate.bundleName === options.bundleName) {
    steps.unshift(`本机找到了与当前 bundleName (${options.bundleName}) 匹配的签名材料。`);
  } else if (candidate.bundleName) {
    steps.unshift(`本机找到了签名材料，profile bundle-name 为 ${candidate.bundleName}。`);
  }

  return steps;
}

export function formatLocalSigningCandidates(candidates: LocalSigningCandidate[]): string[] {
  return candidates.map((candidate) => {
    const label = candidate.bundleName
      ? `${candidate.stem} (${candidate.bundleName})`
      : candidate.stem;
    return `- ${label}`;
  });
}

function expandHomePath(value: string, homeDir: string): string {
  if (value === '~') {
    return homeDir;
  }

  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homeDir, value.slice(2));
  }

  return path.resolve(value);
}
