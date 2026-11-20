import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

const { execHdc } = vi.hoisted(() => ({ execHdc: vi.fn() }));
vi.mock('../src/utils/hdc', () => ({
  execHdc,
  buildHdcTargetArgs: (id: string) => id ? ['-t', id] : [],
}));

describe('debug adapter device launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode as any).__reset();
    execHdc.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('quotes launch metadata for the device while retaining the debug flag', async () => {
    const { HarmonyDebugAdapterFactory } = await import('../src/debug/debugProvider');
    const descriptor = new HarmonyDebugAdapterFactory().createDebugAdapterDescriptor({
      configuration: {
        type: 'harmonyos', request: 'launch', name: 'test',
        deviceId: 'phone', bundleName: 'com.demo.$(printf BAD)', abilityName: "Entry's ability",
      },
    } as any, undefined) as vscode.DebugAdapterInlineImplementation;
    const adapter = descriptor.implementation;
    const messages: any[] = [];
    adapter.onDidSendMessage((message: any) => messages.push(message));
    try {
      await adapter.handleMessage({ type: 'request', command: 'launch', seq: 1 });
      expect(execHdc).toHaveBeenCalledWith(
        ['-t', 'phone', 'fport', 'tcp:9230', 'tcp:9230'], { timeout: 5000 },
      );
      expect(execHdc).toHaveBeenCalledWith(
        ['-t', 'phone', 'shell', "aa start -a 'Entry'\\''s ability' -b 'com.demo.$(printf BAD)' -D"],
        { timeout: 10_000 },
      );
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'response', command: 'launch', success: true,
      }));
    } finally {
      adapter.dispose();
    }
  });
});
