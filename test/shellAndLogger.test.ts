import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { quoteShellArg } from '../src/utils/shell';
import { Logger } from '../src/utils/logger';

describe('quoteShellArg', () => {
  it('should wrap POSIX args in single quotes', () => {
    expect(quoteShellArg('hello', 'darwin')).toBe(`'hello'`);
    expect(quoteShellArg('hello', 'linux')).toBe(`'hello'`);
  });

  it('should escape single quotes inside POSIX args', () => {
    expect(quoteShellArg("a'b", 'linux')).toBe(`'a'\\''b'`);
    expect(quoteShellArg("it's", 'darwin')).toBe(`'it'\\''s'`);
  });

  it('should wrap Windows args in double quotes', () => {
    expect(quoteShellArg('hello', 'win32')).toBe(`"hello"`);
  });

  it('should escape special chars in Windows args (%, ^, &, |, <, >, !, ")', () => {
    expect(quoteShellArg('%"^&|<>!', 'win32')).toBe(`"^%^"^^^&^|^<^>^!"`);
    expect(quoteShellArg('a"b', 'win32')).toBe(`"a^"b"`);
  });

  it('should handle empty string on both platforms', () => {
    expect(quoteShellArg('', 'linux')).toBe(`''`);
    expect(quoteShellArg('', 'win32')).toBe(`""`);
  });

  it('should handle strings with spaces', () => {
    expect(quoteShellArg('hello world', 'linux')).toBe(`'hello world'`);
    expect(quoteShellArg('hello world', 'win32')).toBe(`"hello world"`);
  });

  it('should handle strings with shell metacharacters', () => {
    expect(quoteShellArg('; rm -rf /', 'linux')).toBe(`'; rm -rf /'`);
    expect(quoteShellArg('$(echo pwned)', 'linux')).toBe(`'$(echo pwned)'`);
    expect(quoteShellArg('foo&bar|baz', 'win32')).toBe(`"foo^&bar^|baz"`);
  });
});

describe('Logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create output channel with given name', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    new Logger('MyExtensionLog');
    expect(spy).toHaveBeenCalledWith('MyExtensionLog');
  });

  it('should use default channel name HarmonyOS when omitted', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    new Logger();
    expect(spy).toHaveBeenCalledWith('HarmonyOS');
  });

  it('should log messages with timestamp and level prefix', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    logger.info('hello');
    const channel = spy.mock.results[0].value as { lines: string[] };
    expect(channel.lines).toHaveLength(1);
    expect(channel.lines[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] hello$/);
  });

  it('should append extra args after the message', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    logger.warn('count', 3, true);
    const channel = spy.mock.results[0].value as { lines: string[] };
    expect(channel.lines[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[WARN\] count 3 true$/);
  });

  it('should respect log level filtering (default info — debug not emitted)', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    logger.debug('skip');
    logger.info('keep');
    const channel = spy.mock.results[0].value as { lines: string[] };
    expect(channel.lines.map((l) => l.replace(/^\[[^\]]+\] \[[^\]]+\] /, ''))).toEqual(['keep']);
  });

  it('should emit debug when harmony.logLevel is debug', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (_key: string, defaultValue?: string) => (defaultValue === 'info' && _key === 'logLevel' ? 'debug' : defaultValue),
    } as vscode.WorkspaceConfiguration);

    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    logger.debug('shown');
    const channel = spy.mock.results[0].value as { lines: string[] };
    expect(channel.lines.some((l) => l.includes('[DEBUG]') && l.includes('shown'))).toBe(true);
  });

  it('should dispose channel on dispose', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    const channel = spy.mock.results[0].value as { lines: string[]; dispose: () => void };
    const disposeSpy = vi.spyOn(channel, 'dispose');
    logger.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('should forward show to the output channel', () => {
    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    const channel = spy.mock.results[0].value as { show: () => void };
    const showSpy = vi.spyOn(channel, 'show');
    logger.show();
    expect(showSpy).toHaveBeenCalled();
  });

  it('validateLogLevel should fallback to info for invalid values (via Logger behavior)', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (_key: string, defaultValue?: string) => (_key === 'logLevel' ? 'verbose' : defaultValue),
    } as vscode.WorkspaceConfiguration);

    const spy = vi.spyOn(vscode.window, 'createOutputChannel');
    const logger = new Logger('t');
    logger.debug('no-debug');
    logger.info('yes-info');
    const channel = spy.mock.results[0].value as { lines: string[] };
    expect(channel.lines.some((l) => l.includes('no-debug'))).toBe(false);
    expect(channel.lines.some((l) => l.includes('yes-info'))).toBe(true);
  });
});
