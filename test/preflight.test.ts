import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveHvigorExecution = vi.fn();
const mockFormatHvigorProjectSetupIssue = vi.fn(() => 'broken hvigor');
const mockInspectSigningProfileSetup = vi.fn();
const mockFormatSigningProfileSetupIssue = vi.fn((setup: { materials?: Array<{ path: string }> }) =>
  `broken signing material: ${setup.materials?.[0]?.path ?? 'unknown'}`);
const mockFormatSigningBundleNameMismatch = vi.fn((appBundleName: string, signingBundleName: string) =>
  `bundleName mismatch: ${appBundleName} -> ${signingBundleName}`);
const mockReadBundleName = vi.fn();
const mockDiscoverLocalSigningMaterials = vi.fn();
const mockBuildLocalSigningRecoverySteps = vi.fn(() => ['replace profile', 'replace storeFile', 'replace certpath']);
const mockBuildLocalSigningPathCopyText = vi.fn(() => 'profile: "/tmp/local/profile.p7b"');

vi.mock('../src/utils/hvigor', () => ({
  resolveHvigorExecution: mockResolveHvigorExecution,
  formatHvigorProjectSetupIssue: mockFormatHvigorProjectSetupIssue,
}));

vi.mock('../src/project/signingProfile', () => ({
  inspectSigningProfileSetup: mockInspectSigningProfileSetup,
  formatSigningProfileSetupIssue: mockFormatSigningProfileSetupIssue,
  formatSigningBundleNameMismatch: mockFormatSigningBundleNameMismatch,
}));

vi.mock('../src/utils/projectMetadata', () => ({
  readBundleName: mockReadBundleName,
}));

vi.mock('../src/project/localSigning', () => ({
  discoverLocalSigningMaterials: mockDiscoverLocalSigningMaterials,
  buildLocalSigningRecoverySteps: mockBuildLocalSigningRecoverySteps,
  buildLocalSigningPathCopyText: mockBuildLocalSigningPathCopyText,
}));

describe('assemble HAP preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveHvigorExecution.mockResolvedValue({
      command: './hvigorw assembleHap --no-daemon',
      executablePath: '/workspace/demo/hvigorw',
      source: 'project',
      projectSetup: {
        executablePath: '/workspace/demo/hvigorw',
        exists: true,
        missingRuntimePaths: [],
        warnings: ['hvigor portability warning'],
      },
      warnings: ['hvigor portability warning'],
    });
    mockReadBundleName.mockResolvedValue('com.demo.app');
    mockDiscoverLocalSigningMaterials.mockResolvedValue({
      status: 'none',
      searchRoots: ['/Users/test/.ohos/config'],
      candidates: [],
    });
  });

  it('blocks assemble when a machine-local signing material is missing', async () => {
    mockInspectSigningProfileSetup.mockResolvedValue({
      configured: true,
      exists: false,
      readable: false,
      profilePath: '/workspace/demo/sign/profile.p7b',
      profilePathSource: 'relative',
      bundleName: 'com.demo.app',
      materials: [
        {
          kind: 'storeFile',
          path: '/tmp/missing-keystore.p12',
          pathSource: 'absolute',
          exists: false,
          readable: false,
        },
      ],
      warnings: ['当前 build-profile.json5 使用了绝对签名 storeFile 路径，换机器后通常需要重新配置。'],
    });

    const { resolveAssembleHapPreflight } = await import('../src/build/preflight');
    const result = await resolveAssembleHapPreflight('/workspace/demo');

    expect(result.blockingMessage).toBe('broken signing material: /tmp/missing-keystore.p12');
    expect(result.signingRecoveryHint).toBeUndefined();
    expect(result.warnings).toEqual([
      'hvigor portability warning',
      '当前 build-profile.json5 使用了绝对签名 storeFile 路径，换机器后通常需要重新配置。',
    ]);
  });

  it('surfaces a detected local signing candidate when current machine-local material paths are broken', async () => {
    mockInspectSigningProfileSetup.mockResolvedValue({
      configured: true,
      exists: false,
      readable: false,
      profilePath: '/workspace/demo/sign/profile.p7b',
      profilePathSource: 'relative',
      bundleName: 'com.demo.app',
      materials: [
        {
          kind: 'profile',
          path: '/workspace/demo/sign/profile.p7b',
          pathSource: 'relative',
          exists: false,
          readable: false,
        },
      ],
      warnings: [],
    });
    mockDiscoverLocalSigningMaterials.mockResolvedValue({
      status: 'found',
      searchRoots: ['/Users/test/.ohos/config'],
      candidates: [],
      candidate: {
        stem: 'auto_ohos_123_com.demo.app',
        profilePath: '/tmp/local/profile.p7b',
        storeFilePath: '/tmp/local/store.p12',
        certPath: '/tmp/local/cert.cer',
        bundleName: 'com.demo.app',
      },
    });

    const { resolveAssembleHapPreflight } = await import('../src/build/preflight');
    const result = await resolveAssembleHapPreflight('/workspace/demo');

    expect(result.signingRecoveryHint?.candidate?.profilePath).toBe('/tmp/local/profile.p7b');
    expect(result.signingRecoveryHint?.copyText).toContain('/tmp/local/profile.p7b');
    expect(result.signingRecoveryHint?.steps).toEqual(['replace profile', 'replace storeFile', 'replace certpath']);
    expect(result.warnings).toContain('检测到当前机器上有可用的本地签名材料，可直接复用到 build-profile.json5。');
  });

  it('passes through when hvigor and signing materials are both usable', async () => {
    mockInspectSigningProfileSetup.mockResolvedValue({
      configured: true,
      exists: true,
      readable: true,
      profilePath: '/workspace/demo/sign/profile.p7b',
      profilePathSource: 'relative',
      bundleName: 'com.demo.app',
      materials: [
        {
          kind: 'profile',
          path: '/workspace/demo/sign/profile.p7b',
          pathSource: 'relative',
          exists: true,
          readable: true,
        },
      ],
      warnings: [],
    });

    const { resolveAssembleHapPreflight } = await import('../src/build/preflight');
    const result = await resolveAssembleHapPreflight('/workspace/demo');

    expect(result.blockingMessage).toBeUndefined();
    expect(result.hvigorExecution.command).toBe('./hvigorw assembleHap --no-daemon');
    expect(result.warnings).toEqual(['hvigor portability warning']);
  });

  it('blocks assemble when app.json5 bundleName does not match the signing profile bundleName', async () => {
    mockInspectSigningProfileSetup.mockResolvedValue({
      configured: true,
      exists: true,
      readable: true,
      profilePath: '/workspace/demo/sign/profile.p7b',
      profilePathSource: 'relative',
      bundleName: 'com.signing.profile',
      materials: [
        {
          kind: 'profile',
          path: '/workspace/demo/sign/profile.p7b',
          pathSource: 'relative',
          exists: true,
          readable: true,
        },
      ],
      warnings: [],
    });

    const { resolveAssembleHapPreflight } = await import('../src/build/preflight');
    const result = await resolveAssembleHapPreflight('/workspace/demo');

    expect(mockReadBundleName).toHaveBeenCalled();
    expect(result.blockingMessage).toBe('bundleName mismatch: com.demo.app -> com.signing.profile');
    expect(result.warnings).toEqual(['hvigor portability warning']);
  });
});
