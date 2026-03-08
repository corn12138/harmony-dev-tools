import * as vscode from 'vscode';

export function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('harmony').get<T>(key, defaultValue);
}

export function getSdkPath(): string {
  return getConfig<string>('sdkPath', '');
}

export function getHdcPath(): string {
  return getConfig<string>('hdcPath', '');
}
