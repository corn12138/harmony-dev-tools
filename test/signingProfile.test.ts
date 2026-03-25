import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  formatSigningProfileSetupIssue,
  inspectSigningProfileSetupFromBuildProfile,
  parseSigningProfileBundleName,
  resolveSigningProfileInfoFromBuildProfile,
} from '../src/project/signingProfile';

describe('signingProfile', () => {
  it('parses bundle-name from the embedded signing profile payload', () => {
    const content = Buffer.from(
      '{"bundle-info":{"bundle-name":"com.example.myapplication"}}\n-----BEGIN CERTIFICATE-----\nabc\n',
      'utf8',
    );

    expect(parseSigningProfileBundleName(content)).toBe('com.example.myapplication');
  });

  it('returns signing config metadata even when the profile cannot be read', async () => {
    const info = await resolveSigningProfileInfoFromBuildProfile(`{
  app: {
    signingConfigs: [
      {
        name: "release",
        material: {
          profile: "/tmp/missing-profile.p7b"
        }
      }
    ],
    products: [
      {
        name: "default",
        signingConfig: "release"
      }
    ]
  }
}`, '/project');

    expect(info).toEqual({
      productName: 'default',
      signingConfigName: 'release',
      profilePath: '/tmp/missing-profile.p7b',
      profilePathSource: 'absolute',
      bundleName: undefined,
    });
  });

  it('detects missing signing profile files and absolute-path portability warnings', async () => {
    const setup = await inspectSigningProfileSetupFromBuildProfile(`{
  app: {
    signingConfigs: [
      {
        name: "release",
        material: {
          profile: "/tmp/missing-profile.p7b"
        }
      }
    ],
    products: [
      {
        name: "default",
        signingConfig: "release"
      }
    ]
  }
}`, '/project');

    expect(setup).toEqual({
      productName: 'default',
      signingConfigName: 'release',
      profilePath: '/tmp/missing-profile.p7b',
      profilePathSource: 'absolute',
      configured: true,
      exists: false,
      readable: false,
      bundleName: undefined,
      materials: [
        {
          kind: 'profile',
          path: '/tmp/missing-profile.p7b',
          pathSource: 'absolute',
          exists: false,
          readable: false,
        },
      ],
      warnings: ['当前 build-profile.json5 使用了绝对签名 profile 路径，换机器后通常需要重新配置。'],
    });
    expect(formatSigningProfileSetupIssue(setup!)).toContain('/tmp/missing-profile.p7b');
  });

  it('accepts readable relative signing profiles', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-signing-profile-'));
    try {
      const profilePath = path.join(root, 'sign', 'profile.p7b');
      fs.mkdirSync(path.dirname(profilePath), { recursive: true });
      fs.writeFileSync(profilePath, '{"bundle-info":{"bundle-name":"com.example.ok"}}', 'utf8');

      const setup = await inspectSigningProfileSetupFromBuildProfile(`{
  app: {
    signingConfigs: [
      {
        name: "release",
        material: {
          profile: "./sign/profile.p7b"
        }
      }
    ],
    products: [
      {
        name: "default",
        signingConfig: "release"
      }
    ]
  }
}`, root);

      expect(setup).toEqual({
        productName: 'default',
        signingConfigName: 'release',
        profilePath,
        profilePathSource: 'relative',
        configured: true,
        exists: true,
        readable: true,
        bundleName: 'com.example.ok',
        materials: [
          {
            kind: 'profile',
            path: profilePath,
            pathSource: 'relative',
            exists: true,
            readable: true,
          },
        ],
        warnings: [],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks on missing machine-local signing materials beyond profile.p7b', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-signing-storefile-'));
    try {
      const profilePath = path.join(root, 'sign', 'profile.p7b');
      fs.mkdirSync(path.dirname(profilePath), { recursive: true });
      fs.writeFileSync(profilePath, '{"bundle-info":{"bundle-name":"com.example.ok"}}', 'utf8');

      const setup = await inspectSigningProfileSetupFromBuildProfile(`{
  app: {
    signingConfigs: [
      {
        name: "release",
        material: {
          profile: "./sign/profile.p7b",
          storeFile: "/tmp/missing-keystore.p12",
          certpath: "./sign/cert.cer"
        }
      }
    ],
    products: [
      {
        name: "default",
        signingConfig: "release"
      }
    ]
  }
}`, root);

      expect(setup).toEqual({
        productName: 'default',
        signingConfigName: 'release',
        profilePath,
        profilePathSource: 'relative',
        configured: true,
        exists: false,
        readable: false,
        bundleName: 'com.example.ok',
        materials: [
          {
            kind: 'profile',
            path: profilePath,
            pathSource: 'relative',
            exists: true,
            readable: true,
          },
          {
            kind: 'storeFile',
            path: '/tmp/missing-keystore.p12',
            pathSource: 'absolute',
            exists: false,
            readable: false,
          },
          {
            kind: 'certpath',
            path: path.join(root, 'sign', 'cert.cer'),
            pathSource: 'relative',
            exists: false,
            readable: false,
          },
        ],
        warnings: ['当前 build-profile.json5 使用了绝对签名 storeFile 路径，换机器后通常需要重新配置。'],
      });
      expect(formatSigningProfileSetupIssue(setup!)).toContain('/tmp/missing-keystore.p12');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
