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

  constructor(name: string = 'HarmonyOS') {
    this.channel = vscode.window.createOutputChannel(name);
    this.level = vscode.workspace.getConfiguration('harmony').get<LogLevel>('logLevel', 'info');

    // Watch for config changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('harmony.logLevel')) {
        this.level = vscode.workspace.getConfiguration('harmony').get<LogLevel>('logLevel', 'info');
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
    this.channel.dispose();
  }
}
