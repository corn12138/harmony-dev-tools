import { describe, expect, it } from 'vitest';
import {
  PROJECT_CONFIG_DIAG_CODES,
  analyzePermissionConfiguration,
  analyzeSigningBundleNameDiagnostics,
  analyzeBuildProfileDiagnostics,
  analyzeStartupConfiguration,
  analyzeWebViewDebuggingConfiguration,
  collectStringResourceKeys,
  countEntryDecorators,
  extractRuntimePermissionRequests,
  extractLoadContentRoutes,
  extractNavigationRouteUsages,
  inspectBuilderFunction,
  parseRequestPermissionEntries,
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

    it('should parse requestPermissions entries', () => {
      const entries = parseRequestPermissionEntries(`{
  module: {
    abilities: [{ name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }],
    requestPermissions: [
      {
        name: 'ohos.permission.CAMERA',
        reason: '$string:camera_reason',
        usedScene: {
          abilities: ['EntryAbility'],
          when: 'inuse'
        }
      }
    ]
  }
}`);

      expect(entries).toEqual([
        {
          name: 'ohos.permission.CAMERA',
          reason: '$string:camera_reason',
          reasonResourceKey: 'camera_reason',
          abilities: ['EntryAbility'],
          when: 'inuse',
        },
      ]);
    });

    it('should extract runtime permission requests from requestPermissionsFromUser', () => {
      const requests = extractRuntimePermissionRequests('EntryAbility', `
        atManager.requestPermissionsFromUser(this.context, [
          'ohos.permission.CAMERA',
          "ohos.permission.MICROPHONE"
        ], () => {});
      `);

      expect(requests.map((item) => item.permissionName)).toEqual([
        'ohos.permission.CAMERA',
        'ohos.permission.MICROPHONE',
      ]);
    });

    it('should collect string resource keys from string.json', () => {
      const keys = collectStringResourceKeys(`{
  "string": [
    { "name": "camera_reason", "value": "用于拍照" },
    { "name": "mic_reason", "value": "用于录音" }
  ]
}`);

      expect(Array.from(keys)).toEqual(['camera_reason', 'mic_reason']);
    });
  });

  describe('permission analysis', () => {
    it('should detect duplicate permissions, unknown abilities, and missing reason resources', () => {
      const issues = analyzePermissionConfiguration({
        moduleText: `{
  module: {
    abilities: [
      { name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }
    ],
    requestPermissions: [
      {
        name: 'ohos.permission.CAMERA',
        reason: '$string:camera_reason',
        usedScene: { abilities: ['MissingAbility'], when: 'inuse' }
      },
      {
        name: 'ohos.permission.CAMERA'
      }
    ]
  }
}`,
        abilityTexts: {},
        stringResourceKeys: new Set(['other_reason']),
      });

      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PERMISSION_DUPLICATE)).toBe(true);
      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PERMISSION_USED_SCENE_UNKNOWN_ABILITY)).toBe(true);
      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PERMISSION_REASON_RESOURCE_MISSING)).toBe(true);
    });

    it('should detect undeclared runtime permissions', () => {
      const issues = analyzePermissionConfiguration({
        moduleText: `{
  module: {
    abilities: [
      { name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }
    ]
  }
}`,
        abilityTexts: {
          EntryAbility: `
            atManager.requestPermissionsFromUser(this.context, ['ohos.permission.CAMERA'], () => {});
          `,
        },
      });

      expect(issues).toEqual([
        expect.objectContaining({
          code: PROJECT_CONFIG_DIAG_CODES.PERMISSION_RUNTIME_UNDECLARED,
          target: 'ability',
          abilityName: 'EntryAbility',
        }),
      ]);
    });

    it('should detect runtime declarations missing reason and usedScene ability mapping', () => {
      const issues = analyzePermissionConfiguration({
        moduleText: `{
  module: {
    abilities: [
      { name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' },
      { name: 'OtherAbility', srcEntry: './ets/other/OtherAbility.ets' }
    ],
    requestPermissions: [
      {
        name: 'ohos.permission.CAMERA',
        usedScene: { abilities: ['OtherAbility'], when: 'inuse' }
      }
    ]
  }
}`,
        abilityTexts: {
          EntryAbility: `
            atManager.requestPermissionsFromUser(this.context, ['ohos.permission.CAMERA'], () => {});
          `,
        },
      });

      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PERMISSION_RUNTIME_REASON_MISSING)).toBe(true);
      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.PERMISSION_RUNTIME_ABILITY_MISMATCH)).toBe(true);
    });

    it('should accept a healthy permission declaration and request chain', () => {
      const issues = analyzePermissionConfiguration({
        moduleText: `{
  module: {
    abilities: [
      { name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }
    ],
    requestPermissions: [
      {
        name: 'ohos.permission.CAMERA',
        reason: '$string:camera_reason',
        usedScene: { abilities: ['EntryAbility'], when: 'inuse' }
      }
    ]
  }
}`,
        abilityTexts: {
          EntryAbility: `
            atManager.requestPermissionsFromUser(this.context, ['ohos.permission.CAMERA'], () => {});
          `,
        },
        stringResourceKeys: new Set(['camera_reason']),
      });

      expect(issues).toHaveLength(0);
    });
  });

  describe('webview devtools analysis', () => {
    it('should detect missing WebView debug access and INTERNET permission', () => {
      const issues = analyzeWebViewDebuggingConfiguration({
        moduleText: `{
  module: {
    abilities: [{ name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }]
  }
}`,
        arkTsTexts: {
          'file:///EntryPage.ets': `
            import { Web } from '@kit.ArkWeb';
            @Entry
            @Component
            struct EntryPage {
              build() {
                Web({ src: 'https://example.com' })
              }
            }
          `,
        },
      });

      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.WEBVIEW_DEBUG_ACCESS_MISSING && item.target === 'arkts')).toBe(true);
      expect(issues.some((item) => item.code === PROJECT_CONFIG_DIAG_CODES.WEBVIEW_INTERNET_PERMISSION_MISSING && item.target === 'module')).toBe(true);
    });

    it('should accept a ready WebView DevTools configuration', () => {
      const issues = analyzeWebViewDebuggingConfiguration({
        moduleText: `{
  module: {
    requestPermissions: [
      { name: 'ohos.permission.INTERNET' }
    ]
  }
}`,
        arkTsTexts: {
          'file:///EntryPage.ets': `
            import { webview } from '@kit.ArkWeb';
            webview.WebviewController.setWebDebuggingAccess(true);
            @Entry
            @Component
            struct EntryPage {
              build() {
                Web({ src: 'https://example.com' })
              }
            }
          `,
        },
      });

      expect(issues).toHaveLength(0);
    });
  });
});
