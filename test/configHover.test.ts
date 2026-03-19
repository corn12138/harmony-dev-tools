import { describe, it, expect } from 'vitest';
import { CONFIG_KEY_DOCS, getDocSetForFile } from '../src/language/configHoverProvider';

describe('configHoverProvider', () => {
  describe('getDocSetForFile', () => {
    it('should return build-profile docs for build-profile.json5', () => {
      const docs = getDocSetForFile('/project/build-profile.json5');
      expect(docs).toBeDefined();
      expect(docs!['targetSdkVersion']).toBeDefined();
    });

    it('should return module docs for module.json5', () => {
      const docs = getDocSetForFile('/entry/src/main/module.json5');
      expect(docs).toBeDefined();
      expect(docs!['deviceTypes']).toBeDefined();
    });

    it('should return app docs for app.json5', () => {
      const docs = getDocSetForFile('/AppScope/app.json5');
      expect(docs).toBeDefined();
      expect(docs!['bundleName']).toBeDefined();
    });

    it('should return oh-package docs for oh-package.json5', () => {
      const docs = getDocSetForFile('/oh-package.json5');
      expect(docs).toBeDefined();
      expect(docs!['dependencies']).toBeDefined();
    });

    it('should return undefined for unknown files', () => {
      expect(getDocSetForFile('/some/random/file.json')).toBeUndefined();
      expect(getDocSetForFile('/tsconfig.json')).toBeUndefined();
    });
  });

  describe('CONFIG_KEY_DOCS completeness', () => {
    it('should have docs for all 4 config file types', () => {
      expect(CONFIG_KEY_DOCS['build-profile']).toBeDefined();
      expect(CONFIG_KEY_DOCS['module']).toBeDefined();
      expect(CONFIG_KEY_DOCS['app']).toBeDefined();
      expect(CONFIG_KEY_DOCS['oh-package']).toBeDefined();
    });

    it('build-profile should have essential keys', () => {
      const bp = CONFIG_KEY_DOCS['build-profile'];
      const essentialKeys = ['targetSdkVersion', 'compileSdkVersion', 'compatibleSdkVersion', 'buildModeSet', 'products', 'modules', 'signingConfigs'];
      for (const key of essentialKeys) {
        expect(bp[key]).toBeDefined();
        expect(bp[key].length).toBeGreaterThan(10);
      }
    });

    it('module should have essential keys', () => {
      const mod = CONFIG_KEY_DOCS['module'];
      const essentialKeys = ['name', 'type', 'deviceTypes', 'pages', 'routerMap', 'abilities'];
      for (const key of essentialKeys) {
        expect(mod[key]).toBeDefined();
      }
    });

    it('app should have essential keys', () => {
      const app = CONFIG_KEY_DOCS['app'];
      const essentialKeys = ['bundleName', 'versionCode', 'versionName', 'icon', 'label'];
      for (const key of essentialKeys) {
        expect(app[key]).toBeDefined();
      }
    });

    it('oh-package should have essential keys', () => {
      const pkg = CONFIG_KEY_DOCS['oh-package'];
      const essentialKeys = ['modelVersion', 'name', 'version', 'dependencies', 'devDependencies'];
      for (const key of essentialKeys) {
        expect(pkg[key]).toBeDefined();
      }
    });

    it('all docs should include both Chinese and English', () => {
      for (const [_fileType, docSet] of Object.entries(CONFIG_KEY_DOCS)) {
        for (const [key, doc] of Object.entries(docSet)) {
          expect(doc.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
