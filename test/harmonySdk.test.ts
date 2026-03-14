import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OH_PACKAGE_MODEL_VERSION,
  DEFAULT_TEMPLATE_TARGET_SDK,
  detectHarmonySdkFromBuildProfile,
  LATEST_HARMONY_RELEASE,
  parseHarmonyApiLevel,
} from '../src/utils/harmonySdk';

describe('harmonySdk', () => {
  describe('parseHarmonyApiLevel', () => {
    it('should parse legacy numeric API values', () => {
      expect(parseHarmonyApiLevel(14)).toBe(14);
      expect(parseHarmonyApiLevel('13')).toBe(13);
    });

    it('should parse modern HarmonyOS sdk strings', () => {
      expect(parseHarmonyApiLevel('6.0.0(20)')).toBe(20);
      expect(parseHarmonyApiLevel('6.0.2(22)')).toBe(22);
    });

    it('should return null for unsupported formats without api suffix', () => {
      expect(parseHarmonyApiLevel('6.0.2')).toBeNull();
    });
  });

  describe('detectHarmonySdkFromBuildProfile', () => {
    it('should prioritize targetSdkVersion over legacy fields', () => {
      const result = detectHarmonySdkFromBuildProfile(`
        {
          app: {
            products: [{
              compatibleSdkVersion: "5.0.5(17)",
              targetSdkVersion: "6.0.0(20)",
              compileSdkVersion: 14
            }]
          }
        }
      `);

      expect(result).toEqual({
        field: 'targetSdkVersion',
        rawValue: '6.0.0(20)',
        apiLevel: 20,
      });
    });

    it('should fall back to compileSdkVersion for legacy projects', () => {
      const result = detectHarmonySdkFromBuildProfile('compileSdkVersion: 14');
      expect(result).toEqual({
        field: 'compileSdkVersion',
        rawValue: '14',
        apiLevel: 14,
      });
    });

    it('should fall back to compatibleSdkVersion when needed', () => {
      const result = detectHarmonySdkFromBuildProfile('{ compatibleSdkVersion: "5.0.5(17)" }');
      expect(result).toEqual({
        field: 'compatibleSdkVersion',
        rawValue: '5.0.5(17)',
        apiLevel: 17,
      });
    });
  });

  describe('defaults', () => {
    it('should expose modern template defaults', () => {
      expect(DEFAULT_TEMPLATE_TARGET_SDK).toBe('6.0.0(20)');
      expect(DEFAULT_OH_PACKAGE_MODEL_VERSION).toBe('5.0.5');
      expect(LATEST_HARMONY_RELEASE.sdkVersion).toBe('6.0.2(22)');
    });
  });
});
