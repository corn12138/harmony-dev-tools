import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_FILES } from '../utils/constants';
import { extractJson5StringValue, findJson5StringValue } from '../utils/json5';

interface SigningConfigEntry {
  name: string;
  profilePath?: string;
  storeFilePath?: string;
  certPath?: string;
}

interface ProductSigningEntry {
  name: string;
  signingConfig?: string;
}

export interface ResolvedSigningProfileInfo {
  productName?: string;
  signingConfigName?: string;
  profilePath?: string;
  profilePathSource?: 'absolute' | 'relative';
  bundleName?: string;
}

export interface SigningProfileSetup {
  productName?: string;
  signingConfigName?: string;
  profilePath?: string;
  profilePathSource?: 'absolute' | 'relative';
  configured: boolean;
  exists: boolean;
  readable: boolean;
  bundleName?: string;
  materials: SigningMaterialStatus[];
  warnings: string[];
}

interface SelectedSigningProfile {
  productName?: string;
  signingConfigName?: string;
  profilePath?: string;
  profilePathSource?: 'absolute' | 'relative';
  materials: SigningMaterialSelection[];
}

type SigningMaterialKind = 'profile' | 'storeFile' | 'certpath';

interface SigningMaterialSelection {
  kind: SigningMaterialKind;
  path: string;
  pathSource: 'absolute' | 'relative';
}

export interface SigningMaterialStatus extends SigningMaterialSelection {
  exists: boolean;
  readable: boolean;
}

export async function resolveSigningProfileInfo(
  rootUri: vscode.Uri,
  preferredProduct = 'default',
): Promise<ResolvedSigningProfileInfo | undefined> {
  const buildProfileUri = vscode.Uri.joinPath(rootUri, CONFIG_FILES.BUILD_PROFILE);
  let buildProfileText: string;

  try {
    const content = await vscode.workspace.fs.readFile(buildProfileUri);
    buildProfileText = Buffer.from(content).toString('utf8');
  } catch {
    return undefined;
  }

  return resolveSigningProfileInfoFromBuildProfile(buildProfileText, rootUri.fsPath, preferredProduct);
}

export async function resolveSigningProfileInfoFromBuildProfile(
  buildProfileText: string,
  rootPath: string,
  preferredProduct = 'default',
): Promise<ResolvedSigningProfileInfo | undefined> {
  const selected = selectSigningProfile(buildProfileText, rootPath, preferredProduct);
  if (!selected) {
    return undefined;
  }

  if (!selected.profilePath) {
    return {
      productName: selected.productName,
      signingConfigName: selected.signingConfigName,
    };
  }

  const bundleName = await readSigningProfileBundleName(selected.profilePath);
  return {
    productName: selected.productName,
    signingConfigName: selected.signingConfigName,
    profilePath: selected.profilePath,
    profilePathSource: selected.profilePathSource,
    bundleName,
  };
}

export async function inspectSigningProfileSetup(
  rootUri: vscode.Uri,
  preferredProduct = 'default',
): Promise<SigningProfileSetup | undefined> {
  const buildProfileUri = vscode.Uri.joinPath(rootUri, CONFIG_FILES.BUILD_PROFILE);
  let buildProfileText: string;

  try {
    const content = await vscode.workspace.fs.readFile(buildProfileUri);
    buildProfileText = Buffer.from(content).toString('utf8');
  } catch {
    return undefined;
  }

  return inspectSigningProfileSetupFromBuildProfile(buildProfileText, rootUri.fsPath, preferredProduct);
}

export async function inspectSigningProfileSetupFromBuildProfile(
  buildProfileText: string,
  rootPath: string,
  preferredProduct = 'default',
): Promise<SigningProfileSetup | undefined> {
  const selected = selectSigningProfile(buildProfileText, rootPath, preferredProduct);
  if (!selected) {
    return undefined;
  }

  if (!selected.profilePath) {
    return {
      productName: selected.productName,
      signingConfigName: selected.signingConfigName,
      configured: false,
      exists: false,
      readable: false,
      materials: [],
      warnings: [],
    };
  }

  const materialStatuses = await Promise.all(
    selected.materials.map(async (material) => ({
      ...material,
      ...(await readSigningMaterialStatus(material.path)),
    })),
  );
  const warnings = materialStatuses
    .filter((material) => material.pathSource === 'absolute')
    .map((material) => `当前 build-profile.json5 使用了绝对签名 ${material.kind} 路径，换机器后通常需要重新配置。`);
  const profileMaterial = materialStatuses.find((material) => material.kind === 'profile');
  const bundleName = profileMaterial?.readable
    ? await readSigningProfileBundleName(selected.profilePath)
    : undefined;

  if (profileMaterial?.readable && !bundleName) {
    warnings.push('签名 profile 可读取，但没有解析到 bundle-name。');
  }

  return {
    productName: selected.productName,
    signingConfigName: selected.signingConfigName,
    profilePath: selected.profilePath,
    profilePathSource: selected.profilePathSource,
    configured: true,
    exists: materialStatuses.every((material) => material.exists),
    readable: materialStatuses.every((material) => material.readable),
    bundleName,
    materials: materialStatuses,
    warnings,
  };
}

export function formatSigningProfileSetupIssue(setup: SigningProfileSetup): string {
  const failingMaterial = setup.materials.find((material) => !material.exists || !material.readable);
  if (failingMaterial) {
    const label = failingMaterial.kind;
    if (!failingMaterial.exists) {
      return `签名 ${label} 路径不存在: ${failingMaterial.path}`;
    }
    return `签名 ${label} 无法读取: ${failingMaterial.path}`;
  }

  if (!setup.profilePath) {
    if (setup.configured) {
      return '当前 build-profile.json5 选中的 signingConfig 没有声明 profile 字段。';
    }
    return '当前 build-profile.json5 没有声明 signing profile。';
  }

  if (!setup.bundleName) {
    return `签名 profile 可读取，但没有解析到 bundle-name: ${setup.profilePath}`;
  }

  return `签名 profile 可用: ${setup.profilePath}`;
}

export function formatSigningBundleNameMismatch(
  appBundleName: string,
  signingBundleName: string,
): string {
  return `当前 AppScope/app.json5 的 bundleName 为 ${appBundleName}，但签名 profile 里的 bundleName 为 ${signingBundleName}。SignHap 会失败。`;
}

export async function readSigningProfileBundleName(profilePath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(profilePath);
    return parseSigningProfileBundleName(content);
  } catch {
    return undefined;
  }
}

export function parseSigningProfileBundleName(content: Uint8Array | string): string | undefined {
  const text = typeof content === 'string'
    ? content
    : Buffer.from(content).toString('utf8');
  const payload = extractLeadingJsonPayload(text);
  if (!payload) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(payload) as {
      'bundle-info'?: {
        'bundle-name'?: string;
      };
    };
    return parsed['bundle-info']?.['bundle-name'];
  } catch {
    return undefined;
  }
}

export async function syncAppBundleNameToSigningProfile(rootUri: vscode.Uri): Promise<string | undefined> {
  const signingInfo = await resolveSigningProfileInfo(rootUri);
  if (!signingInfo?.bundleName) {
    return undefined;
  }

  const appJsonUri = vscode.Uri.joinPath(rootUri, 'AppScope', CONFIG_FILES.APP_JSON);
  const content = await vscode.workspace.fs.readFile(appJsonUri);
  const text = Buffer.from(content).toString('utf8');
  const match = findJson5StringValue(text, 'bundleName');
  if (!match) {
    return undefined;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    appJsonUri,
    new vscode.Range(
      positionAt(text, match.valueStart),
      positionAt(text, match.valueEnd),
    ),
    signingInfo.bundleName,
  );

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return undefined;
  }

  await vscode.workspace.saveAll(false);
  return signingInfo.bundleName;
}

function selectSigningProfile(
  buildProfileText: string,
  rootPath: string,
  preferredProduct = 'default',
): SelectedSigningProfile | undefined {
  const signingConfigs = parseSigningConfigs(buildProfileText);
  const products = parseProducts(buildProfileText);

  const product = products.find((item) => item.name === preferredProduct)
    ?? products.find((item) => item.signingConfig)
    ?? products[0];

  const signingConfig = product?.signingConfig
    ? signingConfigs.find((item) => item.name === product.signingConfig)
    : signingConfigs[0];

  if (!product && !signingConfig) {
    return undefined;
  }

  const materials = collectSigningMaterials(signingConfig, rootPath);
  const profileMaterial = materials.find((material) => material.kind === 'profile');

  if (!profileMaterial) {
    return {
      productName: product?.name,
      signingConfigName: signingConfig?.name,
      materials,
    };
  }

  return {
    productName: product?.name,
    signingConfigName: signingConfig?.name,
    profilePath: profileMaterial.path,
    profilePathSource: profileMaterial.pathSource,
    materials,
  };
}

async function readSigningMaterialStatus(materialPath: string): Promise<{ exists: boolean; readable: boolean }> {
  try {
    await fs.access(materialPath);
    return { exists: true, readable: true };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === 'ENOENT') {
      return { exists: false, readable: false };
    }
    return { exists: true, readable: false };
  }
}

function parseSigningConfigs(text: string): SigningConfigEntry[] {
  const block = findJson5ArrayBlock(text, 'signingConfigs');
  if (!block) {
    return [];
  }

  return splitTopLevelObjects(block).reduce<SigningConfigEntry[]>((entries, item) => {
    const name = extractJson5StringValue(item, 'name');
    if (!name) {
      return entries;
    }

    entries.push({
      name,
      profilePath: extractJson5StringValue(item, 'profile'),
      storeFilePath: extractJson5StringValue(item, 'storeFile'),
      certPath: extractJson5StringValue(item, 'certpath'),
    });
    return entries;
  }, []);
}

function collectSigningMaterials(
  signingConfig: SigningConfigEntry | undefined,
  rootPath: string,
): SigningMaterialSelection[] {
  if (!signingConfig) {
    return [];
  }

  return [
    resolveSigningMaterial('profile', signingConfig.profilePath, rootPath),
    resolveSigningMaterial('storeFile', signingConfig.storeFilePath, rootPath),
    resolveSigningMaterial('certpath', signingConfig.certPath, rootPath),
  ].filter((material): material is SigningMaterialSelection => Boolean(material));
}

function resolveSigningMaterial(
  kind: SigningMaterialKind,
  configuredPath: string | undefined,
  rootPath: string,
): SigningMaterialSelection | undefined {
  if (!configuredPath) {
    return undefined;
  }

  const pathSource = path.isAbsolute(configuredPath) ? 'absolute' : 'relative';
  return {
    kind,
    path: pathSource === 'absolute' ? configuredPath : path.resolve(rootPath, configuredPath),
    pathSource,
  };
}

function parseProducts(text: string): ProductSigningEntry[] {
  const block = findJson5ArrayBlock(text, 'products');
  if (!block) {
    return [];
  }

  return splitTopLevelObjects(block).reduce<ProductSigningEntry[]>((entries, item) => {
    const name = extractJson5StringValue(item, 'name');
    if (!name) {
      return entries;
    }

    entries.push({
      name,
      signingConfig: extractJson5StringValue(item, 'signingConfig'),
    });
    return entries;
  }, []);
}

function findJson5ArrayBlock(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`(?:["']${escapeRegExp(key)}["']|\\b${escapeRegExp(key)}\\b)\\s*:\\s*\\[`));
  if (!match || match.index === undefined) {
    return undefined;
  }

  const arrayStart = text.indexOf('[', match.index);
  if (arrayStart < 0) {
    return undefined;
  }

  const arrayEnd = findMatchingBracket(text, arrayStart, '[', ']');
  if (arrayEnd < 0) {
    return undefined;
  }

  return text.slice(arrayStart + 1, arrayEnd);
}

function splitTopLevelObjects(arrayText: string): string[] {
  const objects: string[] = [];

  for (let index = 0; index < arrayText.length; index++) {
    if (arrayText[index] !== '{') {
      continue;
    }

    const end = findMatchingBracket(arrayText, index, '{', '}');
    if (end < 0) {
      break;
    }

    objects.push(arrayText.slice(index, end + 1));
    index = end;
  }

  return objects;
}

function findMatchingBracket(text: string, start: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote: '"' | '\'' | undefined;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        index++;
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

    if (char === openChar) {
      depth++;
      continue;
    }

    if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractLeadingJsonPayload(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start < 0) {
    return undefined;
  }

  const end = findMatchingBracket(text, start, '{', '}');
  if (end < 0) {
    return undefined;
  }

  return text.slice(start, end + 1);
}

function positionAt(text: string, offset: number): vscode.Position {
  const before = text.slice(0, Math.max(offset, 0));
  const lines = before.split('\n');
  return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length ?? 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
