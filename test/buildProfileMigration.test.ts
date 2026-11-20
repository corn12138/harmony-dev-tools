import { describe, expect, it } from 'vitest';
import {
  analyzeBuildProfileMigration,
  applyBuildProfileMigration,
} from '../src/project/buildProfileMigration';

describe('buildProfileMigration', () => {
  it('keeps the implicit target when compilation and minimum SDKs differ', () => {
    const text = "{app:{buildModeSet:[],products:[{compatibleSdkVersion:'6.1.1(24)',compileSdkVersion:'26.0.0'}]}}";
    expect(analyzeBuildProfileMigration(text).issues).toEqual([]);
    expect(applyBuildProfileMigration(text).text).toBe(text);
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
    expect(result.changes).toEqual(['buildModeSetMissing']);
    expect(result.text).not.toContain('targetSdkVersion');
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

  it('preserves individual products without inheriting another target', () => {
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
    expect(result.text.match(/targetSdkVersion:\s*"6\.0\.2\(22\)"/g)).toHaveLength(1);
  });

  it('inserts into the live root app only and is idempotent', () => {
    const text = "// app: {\r\n{extra: {app: {}}, 'app' /* active */ : {runtimeOS:'HarmonyOS'}}";
    const first = applyBuildProfileMigration(text);
    expect(first.changed).toBe(true);
    expect(first.text).toContain("extra: {app: {}}");
    expect(first.text).toContain("'app' /* active */ : {\r\n    buildModeSet:");
    expect(applyBuildProfileMigration(first.text).text).toBe(first.text);
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
