import { describe, expect, it } from 'vitest';
import { buildHvigorCommand, getHvigorExecutable } from '../src/utils/hvigor';

describe('hvigor utils', () => {
  it('should pick the correct executable for each platform', () => {
    expect(getHvigorExecutable('darwin')).toBe('./hvigorw');
    expect(getHvigorExecutable('linux')).toBe('./hvigorw');
    expect(getHvigorExecutable('win32')).toBe('hvigorw.bat');
  });

  it('should build a POSIX hvigor command with executable permission bootstrap', () => {
    expect(buildHvigorCommand({ task: 'assembleHap', platform: 'darwin' }))
      .toBe('chmod +x ./hvigorw 2>/dev/null && ./hvigorw assembleHap --no-daemon');
  });

  it('should build a Windows hvigor command without POSIX shell fragments', () => {
    expect(buildHvigorCommand({ task: 'clean', module: 'entry', platform: 'win32' }))
      .toBe('hvigorw.bat :entry:clean --no-daemon');
  });
});
