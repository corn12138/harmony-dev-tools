import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as config from '../src/utils/config';
import { resolveHvigorExecution } from '../src/utils/hvigor';

describe('hvigor fallback resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to external hvigor when project wrapper points to a missing runtime', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-fallback-'));
    try {
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );

      vi.spyOn(config, 'resolveHvigorPath').mockResolvedValue('/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw');

      const result = await resolveHvigorExecution(root, {
        task: 'assembleHap',
        platform: 'darwin',
      });

      expect(result.source).toBe('external');
      expect(result.executablePath).toBe('/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw');
      expect(result.command).toBe("'/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw' assembleHap --no-daemon");
      expect(result.warnings.some((warning) => warning.includes('hvigor/hvigor-wrapper.js'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers the project wrapper when its runtime files are complete', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-project-'));
    try {
      fs.mkdirSync(path.join(root, 'hvigor'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );
      fs.writeFileSync(path.join(root, 'hvigor', 'hvigor-wrapper.js'), '// wrapper', 'utf8');

      vi.spyOn(config, 'resolveHvigorPath').mockResolvedValue('/external/hvigorw');

      const result = await resolveHvigorExecution(root, {
        task: 'assembleHap',
        platform: 'darwin',
      });

      expect(result.source).toBe('project');
      expect(result.command).toBe('chmod +x ./hvigorw 2>/dev/null && ./hvigorw assembleHap --no-daemon');
      expect(result.warnings).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds a PowerShell-friendly command when Windows falls back to an external hvigor', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-win-'));
    try {
      const externalHvigor = 'C:\\Program Files\\Huawei\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat';
      vi.spyOn(config, 'resolveHvigorPath').mockResolvedValue(externalHvigor);

      const result = await resolveHvigorExecution(root, {
        task: 'assembleHap',
        platform: 'win32',
        powershellCall: true,
      });

      expect(result.source).toBe('external');
      expect(result.command).toBe('& "C:\\Program Files\\Huawei\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat" assembleHap --no-daemon');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('survives 64 parallel resolutions against the same broken project', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-hvigor-stress-'));
    try {
      fs.writeFileSync(
        path.join(root, 'hvigorw'),
        '#!/bin/bash\nHVIGOR_WRAPPER_SCRIPT=${HVIGOR_APP_HOME}/hvigor/hvigor-wrapper.js\n',
        'utf8',
      );

      const externalHvigor = '/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw';
      vi.spyOn(config, 'resolveHvigorPath').mockResolvedValue(externalHvigor);

      const results = await Promise.all(
        Array.from({ length: 64 }, () => resolveHvigorExecution(root, {
          task: 'assembleHap',
          platform: 'darwin',
        })),
      );

      expect(results.every((result) => result.source === 'external')).toBe(true);
      expect(new Set(results.map((result) => result.command))).toEqual(
        new Set([`'${externalHvigor}' assembleHap --no-daemon`]),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
