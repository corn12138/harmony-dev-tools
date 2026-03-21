import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger implements vscode.Disposable {
  private channel: vscode.OutputChannel;
  private level: LogLevel;
  private configDisposable: vscode.Disposable;

  constructor(name: string = 'HarmonyOS') {
    this.channel = vscode.window.createOutputChannel(name);
    this.level = validateLogLevel(vscode.workspace.getConfiguration('harmony').get<string>('logLevel', 'info'));

    this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('harmony.logLevel')) {
        this.level = validateLogLevel(vscode.workspace.getConfiguration('harmony').get<string>('logLevel', 'info'));
      }
    });
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  show(): void {
    this.channel.show();
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const suffix = args.length > 0 ? ' ' + args.map(String).join(' ') : '';
    this.channel.appendLine(`${prefix} ${message}${suffix}`);
  }

  dispose(): void {
    this.configDisposable.dispose();
    this.channel.dispose();
  }
}

function validateLogLevel(raw: string): LogLevel {
  return raw in LOG_LEVELS ? raw as LogLevel : 'info';
}
