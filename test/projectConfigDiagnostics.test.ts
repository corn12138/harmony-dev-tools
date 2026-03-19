import { describe, expect, it } from 'vitest';
import {
  PROJECT_CONFIG_DIAG_CODES,
  analyzeSigningBundleNameDiagnostics,
  analyzeBuildProfileDiagnostics,
  analyzeStartupConfiguration,
  countEntryDecorators,
  extractLoadContentRoutes,
  extractNavigationRouteUsages,
  inspectBuilderFunction,
  parseRouteMapEntries,
} from '../src/project/projectConfigDiagnostics';

describe('projectConfigDiagnostics', () => {
  describe('build-profile migration diagnostics', () => {
    it('should warn when targetSdkVersion is missing', () => {
      const diagnostics = analyzeBuildProfileDiagnostics(`{
  app: {
    products: [
      {
        compatibleSdkVersion: "5.0.5(17)"
      }
    ]
  }
}`);

      expect(diagnostics.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.TARGET_SDK_MISSING)).toBe(true);
    });

    it('should not warn for modern build-profile content', () => {
      const diagnostics = analyzeBuildProfileDiagnostics(`{
  app: {
    buildModeSet: [{ name: "debug" }],
    products: [
      {
        targetSdkVersion: "6.0.2(22)"
      }
    ]
  }
}`);

      expect(diagnostics).toHaveLength(0);
    });

    it('should warn when app bundleName does not match the signing profile bundleName', () => {
      const diagnostics = analyzeSigningBundleNameDiagnostics(
        'com.huangyuming.vpndemo',
        'com.example.myapplication',
      );

      expect(diagnostics).toEqual([
        expect.objectContaining({
          code: PROJECT_CONFIG_DIAG_CODES.SIGNING_BUNDLE_NAME_MISMATCH,
        }),
      ]);
    });
  });

  describe('startup routing analysis', () => {
    it('should detect missing page file and mismatched loadContent route', () => {
      const result = analyzeStartupConfiguration({
        moduleText: `{
  module: {
    type: "entry",
    mainElement: "EntryAbility",
    pages: "$profile:main_pages",
    abilities: [
      {
        name: "EntryAbility",
        srcEntry: "./ets/entryability/EntryAbility.ets"
      }
    ]
  }
}`,
        pagesText: `{
  "src": [
    "pages/Index"
  ]
}`,
        entryAbilityText: `export default class EntryAbility {
  onWindowStageCreate(windowStage) {
    windowStage.loadContent('pages/Home');
  }
}`,
        pageTexts: {},
      });

      expect(result.issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.LOAD_CONTENT_ROUTE_MISMATCH)).toBe(true);
      expect(result.issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PAGE_FILE_MISSING)).toBe(true);
    });

    it('should detect missing @Entry on page files', () => {
      const result = analyzeStartupConfiguration({
        moduleText: `{
  module: {
    type: "entry",
    mainElement: "EntryAbility",
    pages: "$profile:main_pages",
    abilities: [
      {
        name: "EntryAbility",
        srcEntry: "./ets/entryability/EntryAbility.ets"
      }
    ]
  }
}`,
        pagesText: `{
  "src": [
    "pages/Index"
  ]
}`,
        entryAbilityText: `windowStage.loadContent('pages/Index');`,
        pageTexts: {
          'pages/Index': `@Component
struct Index {}`,
        },
      });

      expect(result.issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PAGE_ENTRY_MISSING)).toBe(true);
    });

    it('should accept a healthy startup chain', () => {
      const result = analyzeStartupConfiguration({
        moduleText: `{
  module: {
    type: "entry",
    mainElement: "EntryAbility",
    pages: "$profile:main_pages",
    abilities: [
      {
        name: "EntryAbility",
        srcEntry: "./ets/entryability/EntryAbility.ets"
      }
    ]
  }
}`,
        pagesText: `{
  "src": [
    "pages/Index"
  ]
}`,
        entryAbilityText: `windowStage.loadContent('pages/Index');`,
        pageTexts: {
          'pages/Index': `@Entry
@Component
struct Index {}`,
        },
      });

      expect(result.issues).toHaveLength(0);
    });
  });

  describe('low-level extractors', () => {
    it('should extract loadContent routes', () => {
      const routes = extractLoadContentRoutes(`
        windowStage.loadContent('pages/Index');
        windowStage.loadContent("pages/Detail");
      `);

      expect(routes).toEqual(['pages/Index', 'pages/Detail']);
    });

    it('should count @Entry decorators', () => {
      expect(countEntryDecorators('@Entry\n@Component\nstruct Index {}')).toBe(1);
      expect(countEntryDecorators('@Entry\n@Entry\n@Component\nstruct Index {}')).toBe(2);
    });

    it('should parse route_map entries', () => {
      const entries = parseRouteMapEntries(`{
  "routerMap": [
    {
      "name": "PageOne",
      "pageSourceFile": "src/main/ets/pages/PageOne.ets",
      "buildFunction": "PageOneBuilder"
    }
  ]
}`);

      expect(entries).toEqual([
        {
          name: 'PageOne',
          pageSourceFile: 'src/main/ets/pages/PageOne.ets',
          buildFunction: 'PageOneBuilder',
        },
      ]);
    });

    it('should inspect builder function state', () => {
      expect(inspectBuilderFunction(`
@Builder
export function PageOneBuilder() {}
      `, 'PageOneBuilder')).toBe('ok');

      expect(inspectBuilderFunction(`
export function PageOneBuilder() {}
      `, 'PageOneBuilder')).toBe('missingDecorator');

      expect(inspectBuilderFunction(`
export function AnotherBuilder() {}
      `, 'PageOneBuilder')).toBe('missingFunction');
    });

    it('should extract navigation route usages', () => {
      const usages = extractNavigationRouteUsages(`
        this.stack.pushPath({ name: 'PageOne' });
        navPathStack.pushPathByName("PageTwo");
      `);

      expect(usages.map((item) => item.routeName)).toEqual(['PageOne', 'PageTwo']);
    });
  });
});
