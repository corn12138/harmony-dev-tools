import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const tempRoots: string[] = [];

function writeSigningGroup(root: string, stem: string, bundleName: string): void {
  fs.writeFileSync(path.join(root, `${stem}.p12`), 'store', 'utf8');
  fs.writeFileSync(path.join(root, `${stem}.cer`), 'cert', 'utf8');
  fs.writeFileSync(
    path.join(root, `${stem}.p7b`),
    JSON.stringify({ 'bundle-info': { 'bundle-name': bundleName } }),
    'utf8',
  );
}

describe('local signing discovery', () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
    }
  });

  it('prefers a single auto_ohos candidate matching the bundleName', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-local-signing-'));
    tempRoots.push(root);
    writeSigningGroup(root, 'manual_debug', 'com.other.app');
    writeSigningGroup(root, 'auto_ohos_123_com.demo.app', 'com.demo.app');

    const { discoverLocalSigningMaterials } = await import('../src/project/localSigning');
    const result = await discoverLocalSigningMaterials('com.demo.app', [root]);

    expect(result.status).toBe('found');
    expect(result.candidate?.stem).toBe('auto_ohos_123_com.demo.app');
  });

  it('reports ambiguity instead of guessing between multiple matching candidates', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-local-signing-'));
    tempRoots.push(root);
    writeSigningGroup(root, 'auto_ohos_123_com.demo.app', 'com.demo.app');
    writeSigningGroup(root, 'auto_ohos_456_com.demo.app', 'com.demo.app');

    const { discoverLocalSigningMaterials } = await import('../src/project/localSigning');
    const result = await discoverLocalSigningMaterials('com.demo.app', [root]);

    expect(result.status).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
  });

  it('builds copyable signing path text for manual recovery', async () => {
    const { buildLocalSigningPathCopyText } = await import('../src/project/localSigning');

    expect(buildLocalSigningPathCopyText({
      stem: 'auto_ohos_123_com.demo.app',
      profilePath: '/tmp/demo/profile.p7b',
      storeFilePath: '/tmp/demo/store.p12',
      certPath: '/tmp/demo/cert.cer',
      bundleName: 'com.demo.app',
    })).toContain('profile: "/tmp/demo/profile.p7b"');
  });

  it('prepends configured signing search paths ahead of default locations', async () => {
    const vscode = await import('vscode');
    await vscode.workspace.getConfiguration('harmony').update('signingSearchPaths', ['~/custom-signing'], true);

    const { getEffectiveLocalSigningDirs } = await import('../src/project/localSigning');
    const dirs = getEffectiveLocalSigningDirs('/Users/tester');

    expect(dirs[0]).toBe('/Users/tester/custom-signing');
    expect(dirs).toContain('/Users/tester/.ohos/config');
  });
});
