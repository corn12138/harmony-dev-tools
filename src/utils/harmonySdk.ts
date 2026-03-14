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
  { apiLevel: 22, sdkVersion: '6.0.2(22)', label: 'HarmonyOS 6.0.2' },
] as const;

export const LATEST_HARMONY_RELEASE = HARMONY_RELEASES[HARMONY_RELEASES.length - 1];
export const DEFAULT_TEMPLATE_TARGET_SDK = '6.0.0(20)';
export const DEFAULT_TEMPLATE_COMPATIBLE_SDK = '6.0.0(20)';
export const DEFAULT_OH_PACKAGE_MODEL_VERSION = '5.0.5';

export function parseHarmonyApiLevel(rawValue: string | number): number | null {
  const normalized = String(rawValue).trim();
  if (!normalized) return null;

  const sdkStyleMatch = normalized.match(/\((\d+)\)/);
  if (sdkStyleMatch) {
    return parseInt(sdkStyleMatch[1], 10);
  }

  if (/^\d+$/.test(normalized)) {
    return parseInt(normalized, 10);
  }

  return null;
}

export function detectHarmonySdkFromBuildProfile(text: string): DetectedHarmonySdk | null {
  for (const field of SDK_FIELD_PRIORITY) {
    const match = text.match(new RegExp(
      `["']?${field}["']?\\s*[:=]\\s*(?:"([^"]+)"|'([^']+)'|(\\d+))`
    ));
    if (!match) {
      continue;
    }

    const rawValue = match[1] ?? match[2] ?? match[3] ?? '';
    return {
      field,
      rawValue,
      apiLevel: parseHarmonyApiLevel(rawValue),
    };
  }

  return null;
}

export function getHarmonyReleaseByApi(apiLevel: number): HarmonyRelease | undefined {
  return HARMONY_RELEASES.find((release) => release.apiLevel === apiLevel);
}
