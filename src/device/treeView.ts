import * as vscode from 'vscode';
import { getEmulatorStatus, type EmulatorInfo } from './emulatorManager';
import { getActiveDeviceId, listConnectedDevices } from './devices';
import type { HarmonyEventBus } from '../core/eventBus';

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
  private lastDeviceIds = new Set<string>();

  constructor(private readonly eventBus?: HarmonyEventBus) {
    const interval = vscode.workspace.getConfiguration('harmony').get<number>('devicePollInterval', 5000);
    this.timer = setInterval(() => this.refresh(), interval);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const connectedDevices = await listConnectedDevices();
    this.devices = connectedDevices.map((device) => ({
      kind: 'device' as const,
      id: device.id,
      name: device.name,
      status: device.status,
    }));

    try {
      this.emulators = await getEmulatorStatus();
    } catch {
      this.emulators = [];
    }

    this.emitDeviceChanges(connectedDevices);
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
      const isActive = emu.deviceId && emu.deviceId === getActiveDeviceId();
      const item = new vscode.TreeItem(emu.name, vscode.TreeItemCollapsibleState.None);
      item.description = emu.running
        ? (isActive ? 'running · active' : 'running')
        : emu.platform;
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
          arguments: emu.deviceId ? [emu.deviceId] : undefined,
        };
      }
      return item;
    }

    // DeviceItem
    const isActive = element.id === getActiveDeviceId();
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.description = isActive ? `${element.status} · active` : element.status;
    item.iconPath = new vscode.ThemeIcon(
      element.status === 'online' ? 'device-mobile' : 'debug-disconnect'
    );
    item.contextValue = element.status === 'online' ? 'device-online' : 'device-offline';
    item.tooltip = `Device ID: ${element.id}\nStatus: ${element.status}`;
    item.command = {
      command: 'harmony.openDeviceMirror',
      title: 'Open Device Mirror',
      arguments: [element.id],
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

  private emitDeviceChanges(devices: Array<{ id: string; name: string; type: string }>): void {
    if (!this.eventBus) {
      this.lastDeviceIds = new Set(devices.map((device) => device.id));
      return;
    }

    const nextIds = new Set(devices.map((device) => device.id));
    for (const device of devices) {
      if (!this.lastDeviceIds.has(device.id)) {
        this.eventBus.emit('device:connected', device);
      }
    }

    for (const previousId of this.lastDeviceIds) {
      if (!nextIds.has(previousId)) {
        this.eventBus.emit('device:disconnected', { id: previousId });
      }
    }

    this.lastDeviceIds = nextIds;
  }
}
