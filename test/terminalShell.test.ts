import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  hdc: vi.fn(),
  bundle: vi.fn(),
  ability: vi.fn(),
}));

vi.mock('../src/build/preflight', () => ({ resolveAssembleHapPreflight: mocks.preflight }));
vi.mock('../src/utils/config', () => ({ resolveHdcPath: mocks.hdc }));
vi.mock('../src/utils/projectMetadata', () => ({
  readBundleName: mocks.bundle,
  readEntryAbility: mocks.ability,
}));
vi.mock('../src/device/devices', () => ({
  ensureConnectedDevice: async () => ({ id: 'phone', status: 'online', type: 'device' }),
}));

// Exercise both host and device shell parsing, with local stand-ins for HDC and aa.
describe.skipIf(process.platform === 'win32')('terminal commands through real POSIX shells', () => {
  let root: string;
  const bundle = 'com.demo.$(printf UNEXPECTED);app';
  const ability = "Entry's ability; printf UNEXPECTED";

  beforeEach(async () => {
    vi.clearAllMocks();
    const vscode = await import('vscode');
    (vscode as any).__reset();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "harmony terminal's-"));
    vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(root), name: 'demo', index: 0 }];
    fs.writeFileSync(path.join(root, 'hdc'), [
      '#!/bin/sh',
      'if [ "$3" = install ]; then exit 0; fi',
      '[ "$3" = shell ] || exit 2',
      'exec /bin/sh -c "$4"',
    ].join('\n'), { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'aa'),
      '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)) + "\\n");\n',
      { mode: 0o755 });
    mocks.hdc.mockResolvedValue(path.join(root, 'hdc'));
    mocks.bundle.mockResolvedValue(bundle);
    mocks.ability.mockResolvedValue(ability);
    mocks.preflight.mockResolvedValue({ hvigorExecution: { command: 'true' }, warnings: [] });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function executeTerminal(vscode: any): string {
    const terminal = vscode.__getCreatedTerminals().at(-1);
    return execFileSync('/bin/sh', ['-c', terminal.sentText[0].text], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
    });
  }

  it('passes launch metadata literally through both shells', async () => {
    const vscode = await import('vscode');
    const { terminalRunOnly } = await import('../src/build/terminalRunner');
    await terminalRunOnly();
    expect(JSON.parse(executeTerminal(vscode))).toEqual(['start', '-a', ability, '-b', bundle]);
  });

  it('passes the stop bundle name as one device argument', async () => {
    const vscode = await import('vscode');
    const { terminalStopApp } = await import('../src/build/terminalRunner');
    await terminalStopApp();
    expect(JSON.parse(executeTerminal(vscode))).toEqual(['force-stop', bundle]);
  });

  it('preserves progress text and launch arguments during build and run', async () => {
    const vscode = await import('vscode');
    const { terminalBuildAndRun } = await import('../src/build/terminalRunner');
    const outputs = path.join(root, 'entry', 'build', 'default', 'outputs', 'default');
    fs.mkdirSync(outputs, { recursive: true });
    fs.writeFileSync(path.join(outputs, 'app-signed.hap'), 'fixture');
    await terminalBuildAndRun();
    const output = executeTerminal(vscode);
    expect(output).toContain(`[4/4] Launching ${bundle}/${ability}...`);
    expect(output.split('\n').filter(line => line.startsWith('["')).map(line => JSON.parse(line)))
      .toEqual([['start', '-a', ability, '-b', bundle]]);
    expect(output.trim()).toMatch(/App launched successfully =+$/);
  });
});
