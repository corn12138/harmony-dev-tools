import * as vscode from 'vscode';
import { resolveHdcPath } from '../utils/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectEmulators, type EmulatorInfo } from './emulatorManager';

const execAsync = promisify(exec);

type TreeNode = DeviceItem | SectionItem;

interface DeviceItem {
  kind: 'device';
  id: string;
  name: string;
  status: 'online' | 'offline';
}

interface EmulatorItem {
  kind: 'emulator';
  info: EmulatorInfo;
}

interface SectionItem {
  kind: 'section';
  label: string;
  children: (DeviceItem | EmulatorItem)[];
}

export class DeviceTreeProvider implements vscode.TreeDataProvider<TreeNode | EmulatorItem>, vscode.Disposable {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private timer?: ReturnType<typeof setInterval>;
  private devices: DeviceItem[] = [];
  private emulators: EmulatorInfo[] = [];

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
        .map((id) => ({
          kind: 'device' as const,
          id: id.trim(),
          name: id.trim(),
          status: 'online' as const,
        }));
    } catch {
      this.devices = [];
    }

    try {
      this.emulators = detectEmulators();
      const onlineIds = this.devices.map(d => d.id);
      for (const emu of this.emulators) {
        emu.running = onlineIds.some(id =>
          id.includes('127.0.0.1') || id.includes('localhost') || id.includes('emulator')
        );
      }
    } catch {
      this.emulators = [];
    }

    this._onDidChange.fire();
  }

  getTreeItem(element: TreeNode | EmulatorItem): vscode.TreeItem {
    if (element.kind === 'section') {
      const item = new vscode.TreeItem(
        element.label,
        element.children.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon(
        element.label === 'Devices' ? 'plug' : 'vm'
      );
      return item;
    }

    if (element.kind === 'emulator') {
      const emu = element.info;
      const item = new vscode.TreeItem(emu.name, vscode.TreeItemCollapsibleState.None);
      item.description = emu.running ? 'running' : emu.platform;
      item.iconPath = new vscode.ThemeIcon(emu.running ? 'vm-active' : 'vm');
      item.contextValue = emu.running ? 'emulator-running' : 'emulator-stopped';
      item.tooltip = `Emulator: ${emu.name}\nPath: ${emu.dir}\nPlatform: ${emu.platform}\nStatus: ${emu.running ? 'running' : 'stopped'}`;
      if (!emu.running) {
        item.command = {
          command: 'harmony.launchEmulator',
          title: 'Launch Emulator',
        };
      } else {
        item.command = {
          command: 'harmony.openDeviceMirror',
          title: 'Open Device Mirror',
        };
      }
      return item;
    }

    // DeviceItem
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.description = element.status;
    item.iconPath = new vscode.ThemeIcon(
      element.status === 'online' ? 'device-mobile' : 'debug-disconnect'
    );
    item.contextValue = 'device';
    item.tooltip = `Device ID: ${element.id}\nStatus: ${element.status}`;
    item.command = {
      command: 'harmony.openDeviceMirror',
      title: 'Open Device Mirror',
    };
    return item;
  }

  getChildren(element?: TreeNode | EmulatorItem): (TreeNode | EmulatorItem)[] {
    if (!element) {
      const sections: SectionItem[] = [];

      const deviceSection: SectionItem = {
        kind: 'section',
        label: 'Devices',
        children: this.devices,
      };
      sections.push(deviceSection);

      if (this.emulators.length > 0) {
        const emulatorSection: SectionItem = {
          kind: 'section',
          label: 'Emulators',
          children: this.emulators.map(info => ({ kind: 'emulator' as const, info })),
        };
        sections.push(emulatorSection);
      }

      return sections;
    }

    if (element.kind === 'section') {
      return element.children;
    }

    return [];
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this._onDidChange.dispose();
  }
}
