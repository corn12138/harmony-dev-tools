import * as vscode from 'vscode';
import { resolveHdcPath } from '../utils/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DeviceItem {
  id: string;
  name: string;
  status: 'online' | 'offline';
}

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceItem>, vscode.Disposable {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private timer?: ReturnType<typeof setInterval>;
  private devices: DeviceItem[] = [];

  constructor() {
    const interval = vscode.workspace.getConfiguration('harmony').get<number>('devicePollInterval', 5000);
    this.timer = setInterval(() => this.refresh(), interval);
    this.refresh();
  }

  async refresh(): Promise<void> {
    const hdc = await resolveHdcPath();
    try {
      const { stdout } = await execAsync(`${hdc} list targets`, { timeout: 3000 });
      this.devices = stdout.trim().split('\n')
        .filter((l) => l.trim() && !l.includes('[Empty]'))
        .map((id) => ({ id: id.trim(), name: id.trim(), status: 'online' as const }));
    } catch {
      this.devices = [];
    }
    this._onDidChange.fire();
  }

  getTreeItem(element: DeviceItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.description = element.status;
    item.iconPath = new vscode.ThemeIcon(
      element.status === 'online' ? 'device-mobile' : 'debug-disconnect'
    );
    item.contextValue = 'device';
    item.tooltip = `Device ID: ${element.id}\nStatus: ${element.status}`;
    return item;
  }

  getChildren(): DeviceItem[] {
    return this.devices;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this._onDidChange.dispose();
  }
}
