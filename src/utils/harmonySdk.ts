import JSON5 from 'json5';

export interface HarmonyRelease {
  apiLevel: number;
  sdkVersion: string;
  label: string;
}

export interface DetectedHarmonySdk {
  field: 'targetSdkVersion' | 'compileSdkVersion' | 'compatibleSdkVersion';
  rawValue: string;
  apiLevel: number | null;
}

const SDK_FIELD_PRIORITY = [
  'targetSdkVersion',
  'compileSdkVersion',
  'compatibleSdkVersion',
] as const;

export const HARMONY_RELEASES: HarmonyRelease[] = [
  { apiLevel: 12, sdkVersion: '5.0.0(12)', label: 'HarmonyOS 5.0.0' },
  { apiLevel: 13, sdkVersion: '5.0.1(13)', label: 'HarmonyOS 5.0.1' },
  { apiLevel: 14, sdkVersion: '5.0.2(14)', label: 'HarmonyOS 5.0.2' },
  { apiLevel: 17, sdkVersion: '5.0.5(17)', label: 'HarmonyOS 5.0.5' },
  { apiLevel: 20, sdkVersion: '6.0.0(20)', label: 'HarmonyOS 6.0.0' },
  { apiLevel: 21, sdkVersion: '6.0.1(21)', label: 'HarmonyOS 6.0.1' },
  { apiLevel: 22, sdkVersion: '6.0.2(22)', label: 'HarmonyOS 6.0.2' },
  { apiLevel: 23, sdkVersion: '6.1.0(23)', label: 'HarmonyOS 6.1.0' },
  { apiLevel: 24, sdkVersion: '6.1.1(24)', label: 'HarmonyOS 6.1.1' },
  { apiLevel: 26, sdkVersion: '26.0.0', label: 'HarmonyOS 7.0' },
] as const;

export const LATEST_HARMONY_RELEASE = HARMONY_RELEASES[HARMONY_RELEASES.length - 1];
export const DEFAULT_TEMPLATE_TARGET_SDK = '6.0.0(20)';
export const DEFAULT_TEMPLATE_COMPATIBLE_SDK = '6.0.0(20)';
export const DEFAULT_OH_PACKAGE_MODEL_VERSION = '5.0.5';

// Preserve minor and patch versions for comparisons. Feature gates use the major.
function sdkComponents(value: unknown): number[] | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const raw = String(value).trim();
  const modern = /^([1-9]\d?)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/.exec(raw);
  if (modern && Number(modern[1]) >= 26) return modern.slice(1).map(Number);
  const legacy = /^\d+\.\d+\.\d+\(([1-9]\d?)\)$/.exec(raw);
  const level = legacy?.[1] ?? raw;
  return /^[1-9]\d?$/.test(level) ? [Number(level), 0, 0] : undefined;
}

export function parseHarmonyApiLevel(rawValue: string | number): number | null {
  return sdkComponents(rawValue)?.[0] ?? null;
}

interface ProductSdkConfig {
  name?: string;
  runtimeOS?: string;
  compatibleSdkVersion?: string | number;
  compileSdkVersion?: string | number;
  targetSdkVersion?: string | number;
}

export interface BuildProfile extends ProductSdkConfig {
  app?: ProductSdkConfig & { products?: ProductSdkConfig[]; buildModeSet?: unknown };
}

export function readBuildProfile(text: string): BuildProfile | undefined {
  try {
    const profile = JSON5.parse(text);
    if (profile && typeof profile === 'object' && !Array.isArray(profile)) return profile;
  } catch { /* An unfinished editor document may not parse yet. */ }
  return undefined;
}

export function detectHarmonySdkFromBuildProfile(text: string): DetectedHarmonySdk | null {
  const profile = readBuildProfile(text) ?? readBuildProfile('{' + text.replace(/^(\s*\w+\s*)=/, '$1:') + '}');
  if (!profile) return null;
  const products = profile.app?.products;
  const product = Array.isArray(products)
    ? products.find(entry => entry?.name === 'default') ?? products[0]
    : profile.app ?? profile;
  for (const field of SDK_FIELD_PRIORITY) {
    const value = product?.[field] ?? profile.app?.[field] ?? profile[field];
    if (typeof value === 'string' || typeof value === 'number') {
      return { field, rawValue: String(value), apiLevel: parseHarmonyApiLevel(value) };
    }
  }
  return null;
}

function sdkGreaterThan(left: unknown, right: unknown): boolean {
  const a = sdkComponents(left);
  const b = sdkComponents(right);
  if (!a || !b) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function checkProductSdkOrder(product: ProductSdkConfig): string[] {
  const { compatibleSdkVersion: min, targetSdkVersion: target, compileSdkVersion: compile } = product;
  const messages: string[] = [];
  if (sdkGreaterThan(min, target ?? compile)) {
    const upperField = target == null ? 'compileSdkVersion' : 'targetSdkVersion';
    messages.push(`compatibleSdkVersion (${min}) 超过 ${upperField} (${target ?? compile})`);
  }
  if (sdkGreaterThan(target, compile)) {
    messages.push(`targetSdkVersion (${target}) 超过 compileSdkVersion (${compile})`);
  }
  return messages;
}

export function getHarmonyReleaseByApi(apiLevel: number): HarmonyRelease | undefined {
  return HARMONY_RELEASES.find((release) => release.apiLevel === apiLevel);
}
