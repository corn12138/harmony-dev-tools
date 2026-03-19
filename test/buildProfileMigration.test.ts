import { describe, expect, it } from 'vitest';
import {
  analyzeBuildProfileMigration,
  applyBuildProfileMigration,
} from '../src/project/buildProfileMigration';

describe('buildProfileMigration', () => {
  it('should flag legacy products without targetSdkVersion', () => {
    const text = `{
  app: {
    products: [
      {
        name: "default",
        compatibleSdkVersion: "5.0.5(17)",
        compileSdkVersion: 14
      }
    ]
  }
}`;

    const result = analyzeBuildProfileMigration(text);
    expect(result.issues.map((issue) => issue.code)).toContain('targetSdkVersionMissing');
    expect(result.suggestedTargetSdkVersion).toBe('5.0.5(17)');
  });

  it('should flag missing buildModeSet', () => {
    const text = `{
  app: {
    products: [
      {
        name: "default",
        targetSdkVersion: "6.0.2(22)"
      }
    ]
  }
}`;

    const result = analyzeBuildProfileMigration(text);
    expect(result.issues.map((issue) => issue.code)).toContain('buildModeSetMissing');
  });

  it('should migrate legacy build-profile content in one pass', () => {
    const text = `{
  app: {
    products: [
      {
        name: "default",
        compatibleSdkVersion: "5.0.5(17)",
        runtimeOS: "HarmonyOS"
      }
    ]
  },
  modules: []
}`;

    const result = applyBuildProfileMigration(text);
    expect(result.changed).toBe(true);
    expect(result.changes).toEqual(['targetSdkVersionMissing', 'buildModeSetMissing']);
    expect(result.text).toContain('targetSdkVersion: "5.0.5(17)"');
    expect(result.text).toContain('buildModeSet: [');
    expect(result.text).toContain('name: "debug"');
    expect(result.text).toContain('name: "release"');
  });

  it('should leave modern build-profile content unchanged', () => {
    const text = `{
  app: {
    buildModeSet: [
      {
        name: "debug"
      }
    ],
    products: [
      {
        name: "default",
        targetSdkVersion: "6.0.2(22)"
      }
    ]
  }
}`;

    const result = applyBuildProfileMigration(text);
    expect(result.changed).toBe(false);
    expect(result.text).toBe(text);
    expect(result.changes).toEqual([]);
  });

  it('should not warn pure numeric legacy projects by default', () => {
    const text = `{
  app: {
    products: [
      {
        compileSdkVersion: 14
      }
    ]
  }
}`;

    const result = analyzeBuildProfileMigration(text);
    expect(result.issues).toHaveLength(0);
  });

  it('should migrate every missing product targetSdkVersion', () => {
    const text = `{
  app: {
    products: [
      {
        name: "phone",
        targetSdkVersion: "6.0.2(22)"
      },
      {
        name: "tablet",
        compatibleSdkVersion: "6.0.2(22)"
      },
      {
        name: "tv",
        runtimeOS: "HarmonyOS"
      }
    ]
  }
}`;

    const result = applyBuildProfileMigration(text);
    expect(result.changed).toBe(true);
    expect(result.text.match(/targetSdkVersion:\s*"6\.0\.2\(22\)"/g)).toHaveLength(3);
  });

  it('should not inject targetSdkVersion when products array is empty', () => {
    const text = `{
  app: {
    runtimeOS: "HarmonyOS",
    products: []
  },
  modules: [
    {
      name: "entry"
    }
  ]
}`;

    const result = applyBuildProfileMigration(text);
    expect(result.text).not.toContain('targetSdkVersion');
    expect(result.text).toContain('products: []');
    expect(result.text).toContain('modules: [');
  });
});
