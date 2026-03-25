import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveHvigorExecution } from '../../../src/utils/hvigor';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';

async function ensureActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
  if (!ext.isActive) await ext.activate();
}

suite('E2E: Hvigor Fallback Resolution', () => {
  setup(async () => {
    await ensureActivated();
  });

  test('configured hvigorPath is used when the project wrapper is broken', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-hvigor-broken-'));
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-hvigor-external-'));
    const externalHvigor = path.join(externalDir, process.platform === 'win32' ? 'hvigorw.bat' : 'hvigorw');

    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      fs.writeFileSync(
        path.join(root, process.platform === 'win32' ? 'hvigorw.bat' : 'hvigorw'),
        process.platform === 'win32'
          ? '@echo off\r\nset HVIGOR_WRAPPER_SCRIPT=%~dp0hvigor\\bin\\hvigorw.js\r\n'
          : '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      fs.writeFileSync(externalHvigor, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/bash\n', 'utf8');

      await vscode.workspace.getConfiguration('harmony').update('hvigorPath', externalHvigor, true);

      const result = await resolveHvigorExecution(root, {
        task: 'assembleHap',
        platform: process.platform,
        powershellCall: process.platform === 'win32',
      });

      assert.strictEqual(result.source, 'external');
      assert.strictEqual(result.executablePath, externalHvigor);
      assert.ok(result.command.includes('assembleHap --no-daemon'));
      assert.ok(result.warnings.some((warning) => warning.includes('缺少它引用的运行时文件')));
    } finally {
      await vscode.workspace.getConfiguration('harmony').update('hvigorPath', '', true);
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  }).timeout(15000);

  test('project hvigor wrapper stays preferred over configured external fallback', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-hvigor-project-'));
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-e2e-hvigor-override-'));
    const externalHvigor = path.join(externalDir, process.platform === 'win32' ? 'hvigorw.bat' : 'hvigorw');

    try {
      fs.writeFileSync(path.join(root, 'build-profile.json5'), '{}', 'utf8');
      if (process.platform === 'win32') {
        fs.mkdirSync(path.join(root, 'hvigor', 'bin'), { recursive: true });
        fs.writeFileSync(path.join(root, 'hvigor', 'bin', 'hvigorw.js'), '// wrapper', 'utf8');
        fs.writeFileSync(
          path.join(root, 'hvigorw.bat'),
          '@echo off\r\nset HVIGOR_WRAPPER_SCRIPT=%~dp0hvigor\\bin\\hvigorw.js\r\n',
          'utf8',
        );
      } else {
        fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
        fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');
        fs.writeFileSync(
          path.join(root, 'hvigorw'),
          '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
          'utf8',
        );
      }
      fs.writeFileSync(externalHvigor, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/bash\n', 'utf8');

      await vscode.workspace.getConfiguration('harmony').update('hvigorPath', externalHvigor, true);

      const result = await resolveHvigorExecution(root, {
        task: 'assembleHap',
        platform: process.platform,
        powershellCall: process.platform === 'win32',
      });

      assert.strictEqual(result.source, 'project');
      assert.ok(result.command.includes(process.platform === 'win32' ? 'hvigorw.bat' : './hvigorw'));
      assert.strictEqual(result.warnings.length, 0);
    } finally {
      await vscode.workspace.getConfiguration('harmony').update('hvigorPath', '', true);
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  }).timeout(15000);
});
