import { describe, expect, it } from 'vitest';
import {
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
      bundleName: undefined,
    });
  });
});
