import { describe, it, expect } from 'vitest';
import { ARKTS_DECORATORS, DEPRECATED_APIS, API_VERSIONS, COMMANDS, CONFIG_FILES } from '../src/utils/constants';

describe('constants', () => {
  describe('ARKTS_DECORATORS', () => {
    it('should contain all V1 decorators', () => {
      const v1 = ['@Component', '@Entry', '@State', '@Prop', '@Link', '@Provide', '@Consume', '@Watch', '@Observed', '@ObjectLink'];
      for (const dec of v1) {
        expect(ARKTS_DECORATORS).toContain(dec);
      }
    });

    it('should contain all V2 decorators (API 12+)', () => {
      const v2 = ['@ComponentV2', '@ObservedV2', '@Trace', '@Local', '@Param', '@Once', '@Event', '@Monitor', '@Computed', '@Provider', '@Consumer'];
      for (const dec of v2) {
        expect(ARKTS_DECORATORS).toContain(dec);
      }
    });

    it('should contain API 18+ reusable decorator', () => {
      expect(ARKTS_DECORATORS).toContain('@ReusableV2');
    });

    it('should contain API 13+ decorators', () => {
      expect(ARKTS_DECORATORS).toContain('@Require');
    });

    it('should contain API 14+ decorators', () => {
      expect(ARKTS_DECORATORS).toContain('@Type');
    });

    it('should contain @Sendable for concurrency', () => {
      expect(ARKTS_DECORATORS).toContain('@Sendable');
      expect(ARKTS_DECORATORS).toContain('@Concurrent');
    });

    it('should have all entries starting with @', () => {
      for (const dec of ARKTS_DECORATORS) {
        expect(dec.startsWith('@')).toBe(true);
      }
    });
  });

  describe('DEPRECATED_APIS', () => {
    it('should have at least 10 deprecated API entries', () => {
      expect(DEPRECATED_APIS.length).toBeGreaterThanOrEqual(10);
    });

    it('each entry should have required fields', () => {
      for (const api of DEPRECATED_APIS) {
        expect(api.name).toBeTruthy();
        expect(api.replacement).toBeTruthy();
        expect(api.sinceApi).toBeGreaterThanOrEqual(11);
        expect(['function', 'module', 'decorator']).toContain(api.kind);
      }
    });

    it('should include animateTo deprecation', () => {
      const entry = DEPRECATED_APIS.find(a => a.name === 'animateTo');
      expect(entry).toBeDefined();
      expect(entry!.replacement).toContain('UIContext');
      expect(entry!.sinceApi).toBe(11);
    });

    it('should include router deprecation', () => {
      const routerEntries = DEPRECATED_APIS.filter(a => a.name.includes('router'));
      expect(routerEntries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('API_VERSIONS', () => {
    it('should define legacy and modern HarmonyOS api levels', () => {
      expect(API_VERSIONS.API_12).toBe(12);
      expect(API_VERSIONS.API_13).toBe(13);
      expect(API_VERSIONS.API_14).toBe(14);
      expect(API_VERSIONS.API_17).toBe(17);
      expect(API_VERSIONS.API_18).toBe(18);
      expect(API_VERSIONS.API_20).toBe(20);
      expect(API_VERSIONS.API_22).toBe(22);
    });
  });

  describe('COMMANDS', () => {
    it('should define all 23 commands', () => {
      const commandKeys = Object.keys(COMMANDS);
      expect(commandKeys.length).toBeGreaterThanOrEqual(23);
    });

    it('should have all commands prefixed with harmony.', () => {
      for (const value of Object.values(COMMANDS)) {
        expect(value).toMatch(/^harmony\./);
      }
    });
  });

  describe('CONFIG_FILES', () => {
    it('should define standard HarmonyOS config files', () => {
      expect(CONFIG_FILES.BUILD_PROFILE).toBe('build-profile.json5');
      expect(CONFIG_FILES.OH_PACKAGE).toBe('oh-package.json5');
      expect(CONFIG_FILES.MODULE_JSON).toBe('module.json5');
      expect(CONFIG_FILES.APP_JSON).toBe('app.json5');
      expect(CONFIG_FILES.HVIGOR_CONFIG).toBe('hvigor-config.json5');
    });
  });
});
