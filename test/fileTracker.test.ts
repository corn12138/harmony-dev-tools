import { describe, it, expect } from 'vitest';
import {
  classifyHarmonyFile,
  normalizeFsPath,
  summarizeTrackedFiles,
  type HarmonyTrackedFile,
} from '../src/project/fileTracker';

describe('fileTracker', () => {
  const root = '/workspace/demo';

  describe('normalizeFsPath', () => {
    it('should normalize windows separators and trailing slash', () => {
      expect(normalizeFsPath('C:\\repo\\demo\\')).toBe('C:/repo/demo');
    });
  });

  describe('classifyHarmonyFile', () => {
    it('should classify root build-profile.json5', () => {
      expect(classifyHarmonyFile(root, `${root}/build-profile.json5`)).toEqual({
        path: `${root}/build-profile.json5`,
        kind: 'buildProfile',
      });
    });

    it('should classify AppScope app.json5', () => {
      expect(classifyHarmonyFile(root, `${root}/AppScope/app.json5`)).toEqual({
        path: `${root}/AppScope/app.json5`,
        kind: 'appJson',
      });
    });

    it('should classify module.json5 under module', () => {
      expect(classifyHarmonyFile(root, `${root}/entry/src/main/module.json5`)).toEqual({
        path: `${root}/entry/src/main/module.json5`,
        kind: 'moduleJson',
        module: 'entry',
      });
    });

    it('should classify ArkTS source files', () => {
      expect(classifyHarmonyFile(root, `${root}/entry/src/main/ets/pages/Index.ets`)).toEqual({
        path: `${root}/entry/src/main/ets/pages/Index.ets`,
        kind: 'arkts',
        module: 'entry',
      });
    });

    it('should classify resource files', () => {
      expect(classifyHarmonyFile(root, `${root}/entry/src/main/resources/base/element/string.json`)).toEqual({
        path: `${root}/entry/src/main/resources/base/element/string.json`,
        kind: 'resource',
        module: 'entry',
      });
    });

    it('should classify module oh-package.json5', () => {
      expect(classifyHarmonyFile(root, `${root}/feature/oh-package.json5`)).toEqual({
        path: `${root}/feature/oh-package.json5`,
        kind: 'ohPackage',
        module: 'feature',
      });
    });

    it('should classify hvigor files', () => {
      expect(classifyHarmonyFile(root, `${root}/hvigor/hvigor-config.json5`)).toEqual({
        path: `${root}/hvigor/hvigor-config.json5`,
        kind: 'hvigorConfig',
      });
      expect(classifyHarmonyFile(root, `${root}/hvigorw`)).toEqual({
        path: `${root}/hvigorw`,
        kind: 'hvigorScript',
      });
    });

    it('should ignore unrelated files', () => {
      expect(classifyHarmonyFile(root, `${root}/README.md`)).toBeUndefined();
      expect(classifyHarmonyFile(root, '/other/build-profile.json5')).toBeUndefined();
    });
  });

  describe('summarizeTrackedFiles', () => {
    it('should dedupe files, collect modules, and count kinds', () => {
      const files: HarmonyTrackedFile[] = [
        { path: `${root}/build-profile.json5`, kind: 'buildProfile' },
        { path: `${root}/entry/src/main/module.json5`, kind: 'moduleJson', module: 'entry' },
        { path: `${root}/entry/src/main/ets/pages/Index.ets`, kind: 'arkts', module: 'entry' },
        { path: `${root}/entry/src/main/resources/base/element/string.json`, kind: 'resource', module: 'entry' },
        { path: `${root}/feature/oh-package.json5`, kind: 'ohPackage', module: 'feature' },
        { path: `${root}/feature/oh-package.json5`, kind: 'ohPackage', module: 'feature' },
      ];

      const summary = summarizeTrackedFiles(root, files);

      expect(summary.modules).toEqual(['entry', 'feature']);
      expect(summary.files).toHaveLength(5);
      expect(summary.counts.buildProfile).toBe(1);
      expect(summary.counts.moduleJson).toBe(1);
      expect(summary.counts.arkts).toBe(1);
      expect(summary.counts.resource).toBe(1);
      expect(summary.counts.ohPackage).toBe(1);
      expect(summary.counts.appJson).toBe(0);
    });
  });
});
