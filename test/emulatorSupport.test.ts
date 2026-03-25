import { describe, expect, it } from 'vitest';
import { summarizeEmulatorLaunchFailure } from '../src/device/emulatorSupport';

describe('emulatorSupport', () => {
  it('explains common macOS CLI startup failures with actionable hints', () => {
    const summary = summarizeEmulatorLaunchFailure({
      emulatorName: 'Mate 70 Pro',
      binaryPath: '/Applications/DevEco-Studio.app/Contents/tools/emulator/emulator',
      code: 1,
      stderr: 'sysmon request failed with error: sysmond service not found\nUnable to start the emulator',
      platform: 'darwin',
    });

    expect(summary.message).toContain('Mate 70 Pro');
    expect(summary.message).toContain('exit code 1');
    expect(summary.details.some((line) => line.includes('DevEco 模拟器返回了明确的启动失败'))).toBe(true);
    expect(summary.details.some((line) => line.includes('macOS'))).toBe(true);
    expect(summary.details.some((line) => line.includes('sysmond'))).toBe(true);
  });

  it('keeps a generic fallback when there is no recognized launch output', () => {
    const summary = summarizeEmulatorLaunchFailure({
      emulatorName: 'Watch X',
      binaryPath: 'C:\\DevEcoStudio\\tools\\emulator\\emulator.exe',
      code: 1,
      platform: 'win32',
    });

    expect(summary.details.some((line) => line.includes('模拟器在出现在 HDC 之前就退出了'))).toBe(true);
    expect(summary.details.some((line) => line.includes('Windows'))).toBe(true);
  });
});
