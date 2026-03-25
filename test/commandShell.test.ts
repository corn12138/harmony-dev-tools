import { describe, expect, it } from 'vitest';
import { shouldUseBatchShell } from '../src/utils/commandShell';

describe('batch shell detection', () => {
  it('enables shell execution for Windows batch wrappers', () => {
    expect(shouldUseBatchShell('C:\\Harmony\\hdc.cmd', 'win32')).toBe(true);
    expect(shouldUseBatchShell('C:\\Harmony\\emulator.bat', 'win32')).toBe(true);
  });

  it('does not enable shell execution for Windows native executables', () => {
    expect(shouldUseBatchShell('C:\\Harmony\\hdc.exe', 'win32')).toBe(false);
  });

  it('does not enable shell execution on POSIX platforms', () => {
    expect(shouldUseBatchShell('/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw', 'darwin')).toBe(false);
    expect(shouldUseBatchShell('/opt/DevEco-Studio/tools/emulator/emulator', 'linux')).toBe(false);
  });
});
