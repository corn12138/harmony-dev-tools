import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_FILES } from '../utils/constants';
import { extractJson5StringValue, findJson5StringValue } from '../utils/json5';

interface SigningConfigEntry {
  name: string;
  profilePath?: string;
}

interface ProductSigningEntry {
  name: string;
  signingConfig?: string;
}

export interface ResolvedSigningProfileInfo {
  productName?: string;
  signingConfigName?: string;
  profilePath?: string;
  bundleName?: string;
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
  const signingConfigs = parseSigningConfigs(buildProfileText);
  const products = parseProducts(buildProfileText);

  const product = products.find((item) => item.name === preferredProduct)
    ?? products.find((item) => item.signingConfig)
    ?? products[0];

  const signingConfig = product?.signingConfig
    ? signingConfigs.find((item) => item.name === product.signingConfig)
    : signingConfigs[0];

  if (!signingConfig?.profilePath) {
    return {
      productName: product?.name,
      signingConfigName: signingConfig?.name,
    };
  }

  const profilePath = path.isAbsolute(signingConfig.profilePath)
    ? signingConfig.profilePath
    : path.resolve(rootPath, signingConfig.profilePath);

  const bundleName = await readSigningProfileBundleName(profilePath);
  return {
    productName: product?.name,
    signingConfigName: signingConfig.name,
    profilePath,
    bundleName,
  };
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
    });
    return entries;
  }, []);
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
