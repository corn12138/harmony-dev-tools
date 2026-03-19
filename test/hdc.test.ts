import { describe, expect, it } from 'vitest';
import {
  buildHdcTargetArgs,
  buildHdcTerminalCommand,
  coerceHdcCommandError,
  describeHdcCommandError,
  parseHdcTargets,
  rawTerminalArg,
} from '../src/utils/hdc';

describe('hdc utils', () => {
  it('should parse device targets and ignore empty markers', () => {
    expect(parseHdcTargets('127.0.0.1:5555\n[Empty]\n192.168.1.8:8710\n')).toEqual([
      '127.0.0.1:5555',
      '192.168.1.8:8710',
    ]);
  });

  it('should build target arguments only when a device id is provided', () => {
    expect(buildHdcTargetArgs()).toEqual([]);
    expect(buildHdcTargetArgs('emulator-5554')).toEqual(['-t', 'emulator-5554']);
  });

  it('should build a POSIX-safe terminal command', () => {
    expect(buildHdcTerminalCommand(
      '/Applications/DevEco Studio/hdc',
      ['-t', '127.0.0.1:5555', 'shell', 'aa start -a EntryAbility -b com.example.app'],
      'darwin',
    )).toBe(
      '\'/Applications/DevEco Studio/hdc\' \'-t\' \'127.0.0.1:5555\' \'shell\' \'aa start -a EntryAbility -b com.example.app\'',
    );
  });

  it('should allow raw shell variables in terminal commands', () => {
    expect(buildHdcTerminalCommand(
      'C:\\Harmony\\hdc.exe',
      ['-t', 'emulator', 'install', rawTerminalArg('$hap.FullName')],
      'win32',
    )).toBe(
      '& \'C:\\Harmony\\hdc.exe\' \'-t\' \'emulator\' \'install\' $hap.FullName',
    );
  });

  it('should classify HDC server connection failures', () => {
    const error = coerceHdcCommandError(
      { message: 'Command failed', stderr: 'Connect server failed\n' },
      '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc',
      ['list', 'targets'],
    );

    expect(error.kind).toBe('connect-failed');
    expect(describeHdcCommandError(error)).toContain('could not connect to the HDC server');
  });

  it('should classify missing HDC binaries', () => {
    const error = coerceHdcCommandError(
      { code: 'ENOENT', message: 'spawn hdc ENOENT' },
      'hdc',
      ['list', 'targets'],
    );

    expect(error.kind).toBe('not-found');
    expect(describeHdcCommandError(error)).toContain('Configure `harmony.hdcPath`');
  });
});
