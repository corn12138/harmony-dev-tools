import * as vscode from 'vscode';
import { promptHdcConfiguration } from '../utils/config';
import { COMMANDS } from '../utils/constants';
import { HdcCommandError, coerceHdcCommandError, describeHdcCommandError, listHdcTargets } from '../utils/hdc';

export interface ConnectedDevice {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
}

export interface DeviceDiscoveryState {
  devices: ConnectedDevice[];
  error?: HdcCommandError;
}

interface PickConnectedDeviceOptions {
  placeHolder?: string;
  preferredId?: string;
  filterType?: ConnectedDevice['type'];
  rememberSelection?: boolean;
  forcePick?: boolean;
}

interface DeviceStatusBarState {
  text: string;
  tooltip: string;
  command: string;
}

let activeDeviceId: string | undefined;
let deviceStatusBarItem: vscode.StatusBarItem | undefined;
let deviceStatusBarTimer: ReturnType<typeof setInterval> | undefined;

export async function listConnectedDevices(): Promise<ConnectedDevice[]> {
  const { devices } = await getConnectedDeviceState();
  return devices;
}

export async function getConnectedDeviceState(): Promise<DeviceDiscoveryState> {
  try {
    const targets = await listHdcTargets(5000);
    return { devices: mapTargetsToDevices(targets) };
  } catch (error) {
    return {
      devices: [],
      error: coerceHdcCommandError(error, 'hdc', ['list', 'targets']),
    };
  }
}

export async function ensureConnectedDevice(
  options: PickConnectedDeviceOptions = {},
): Promise<ConnectedDevice | undefined> {
  const state = await getConnectedDeviceState();
  return pickFromDeviceState(state, options, true);
}

export async function explainDeviceConnectionIssue(error: HdcCommandError): Promise<void> {
  const actions = error.kind === 'not-found' || error.kind === 'permission-denied'
    ? ['Configure HDC', 'Check Environment']
    : ['Check Environment', 'Configure HDC'];

  const action = await vscode.window.showWarningMessage(
    describeHdcCommandError(error),
    ...actions,
  );

  if (action === 'Configure HDC') {
    await promptHdcConfiguration();
    return;
  }

  if (action === 'Check Environment') {
    await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
  }
}

export function getDeviceStatusBarState(args: {
  devices: ConnectedDevice[];
  current?: ConnectedDevice;
  error?: HdcCommandError;
}): DeviceStatusBarState {
  if (args.error) {
    return {
      text: '$(warning) HDC Offline',
      tooltip: `${describeHdcCommandError(args.error)} Click to run HarmonyOS environment checks.`,
      command: COMMANDS.CHECK_ENVIRONMENT,
    };
  }

  if (args.devices.length === 0) {
    return {
      text: '$(device-mobile) No Device',
      tooltip: 'No HarmonyOS devices connected. Click to choose when a device is available.',
      command: COMMANDS.SELECT_DEVICE,
    };
  }

  const label = args.current ? shortenDeviceId(args.current.id) : 'Select Device';
  return {
    text: `$(device-mobile) ${label}`,
    tooltip: args.current
      ? `Current HarmonyOS device: ${args.current.id}\nClick to switch device.`
      : 'Select the HarmonyOS device used by run, mirror, screenshot, and inspector commands.',
    command: COMMANDS.SELECT_DEVICE,
  };
}

export function getActiveDeviceId(): string | undefined {
  return activeDeviceId;
}

export function setActiveDeviceId(deviceId?: string): void {
  activeDeviceId = deviceId;
  updateDeviceStatusBar().catch(() => undefined);
}

export function chooseAutoDevice(
  devices: ConnectedDevice[],
  preferredId?: string,
): ConnectedDevice | undefined {
  if (preferredId) {
    const preferred = devices.find((device) => device.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  if (activeDeviceId) {
    const active = devices.find((device) => device.id === activeDeviceId);
    if (active) {
      return active;
    }
  }

  return devices.length === 1 ? devices[0] : undefined;
}

export async function pickConnectedDevice(
  options: PickConnectedDeviceOptions = {},
): Promise<ConnectedDevice | undefined> {
  const state = await getConnectedDeviceState();
  return pickFromDeviceState(state, options, false);
}

export async function promptAndSelectDevice(): Promise<void> {
  const device = await ensureConnectedDevice({
    placeHolder: 'Select the default HarmonyOS device',
    forcePick: true,
  });

  if (device) {
    void vscode.commands.executeCommand(COMMANDS.VIEW_DEVICES);
    vscode.window.showInformationMessage(`Current device: ${device.id}`);
  }
}

export async function selectDeviceById(deviceId?: string): Promise<boolean> {
  if (!deviceId) {
    return false;
  }

  const state = await getConnectedDeviceState();
  const device = state.devices.find((entry) => entry.id === deviceId);
  if (!device) {
    if (state.error) {
      await explainDeviceConnectionIssue(state.error);
    } else {
      vscode.window.showWarningMessage(`Device not found: ${deviceId}`);
    }
    return false;
  }

  setActiveDeviceId(device.id);
  void vscode.commands.executeCommand(COMMANDS.VIEW_DEVICES);
  vscode.window.showInformationMessage(`Current device: ${device.id}`);
  return true;
}

export function createDeviceStatusBar(context: vscode.ExtensionContext): vscode.Disposable {
  if (!deviceStatusBarItem) {
    deviceStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    deviceStatusBarItem.command = COMMANDS.SELECT_DEVICE;
  }

  if (deviceStatusBarTimer) {
    clearInterval(deviceStatusBarTimer);
  }

  const interval = vscode.workspace.getConfiguration('harmony').get<number>('devicePollInterval', 5000);
  deviceStatusBarTimer = setInterval(() => {
    void updateDeviceStatusBar();
  }, interval);

  void updateDeviceStatusBar();

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('harmony.devicePollInterval')) {
      return;
    }

    if (deviceStatusBarTimer) {
      clearInterval(deviceStatusBarTimer);
    }

    const nextInterval = vscode.workspace.getConfiguration('harmony').get<number>('devicePollInterval', 5000);
    deviceStatusBarTimer = setInterval(() => {
      void updateDeviceStatusBar();
    }, nextInterval);
  });

  const disposable = vscode.Disposable.from(
    deviceStatusBarItem,
    configWatcher,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void updateDeviceStatusBar();
    }),
    {
      dispose: () => {
        if (deviceStatusBarTimer) {
          clearInterval(deviceStatusBarTimer);
          deviceStatusBarTimer = undefined;
        }
      },
    },
  );

  context.subscriptions.push(disposable);
  return disposable;
}

async function pickFromDeviceState(
  state: DeviceDiscoveryState,
  options: PickConnectedDeviceOptions,
  explainUnavailable: boolean,
): Promise<ConnectedDevice | undefined> {
  const devices = options.filterType
    ? state.devices.filter((device) => device.type === options.filterType)
    : state.devices;

  if (devices.length === 0) {
    setActiveDeviceId(undefined);
    if (explainUnavailable) {
      if (state.error) {
        await explainDeviceConnectionIssue(state.error);
      } else {
        vscode.window.showWarningMessage(
          'No HarmonyOS devices connected. Connect a device via USB, Wi-Fi, or start an emulator.',
        );
      }
    }
    return undefined;
  }

  const rememberSelection = options.rememberSelection !== false;
  const autoDevice = options.forcePick ? undefined : chooseAutoDevice(devices, options.preferredId);
  if (autoDevice) {
    if (rememberSelection) {
      setActiveDeviceId(autoDevice.id);
    }
    return autoDevice;
  }

  const pick = await vscode.window.showQuickPick(
    devices.map((device) => ({
      label: device.name,
      description: device.id,
      detail: device.type,
      device,
    })),
    { placeHolder: options.placeHolder ?? 'Select a HarmonyOS device' },
  );

  if (pick?.device && rememberSelection) {
    setActiveDeviceId(pick.device.id);
  }

  return pick?.device;
}

async function updateDeviceStatusBar(): Promise<void> {
  if (!deviceStatusBarItem) {
    return;
  }

  const state = await getConnectedDeviceState();
  if (state.error) {
    activeDeviceId = undefined;
    const status = getDeviceStatusBarState(state);
    deviceStatusBarItem.text = status.text;
    deviceStatusBarItem.tooltip = status.tooltip;
    deviceStatusBarItem.command = status.command;
    deviceStatusBarItem.show();
    return;
  }

  if (state.devices.length === 0) {
    activeDeviceId = undefined;
    const status = getDeviceStatusBarState(state);
    deviceStatusBarItem.text = status.text;
    deviceStatusBarItem.tooltip = status.tooltip;
    deviceStatusBarItem.command = status.command;
    deviceStatusBarItem.show();
    return;
  }

  const current = chooseAutoDevice(state.devices);
  if (current) {
    activeDeviceId = current.id;
  } else if (activeDeviceId && !state.devices.some((device) => device.id === activeDeviceId)) {
    activeDeviceId = undefined;
  }

  const status = getDeviceStatusBarState({ devices: state.devices, current });
  deviceStatusBarItem.text = status.text;
  deviceStatusBarItem.tooltip = status.tooltip;
  deviceStatusBarItem.command = status.command;
  deviceStatusBarItem.show();
}

function mapTargetsToDevices(targets: string[]): ConnectedDevice[] {
  return targets.map((id) => ({
    id,
    name: id,
    type: inferDeviceType(id),
    status: 'online' as const,
  }));
}

function shortenDeviceId(id: string): string {
  if (id.length <= 18) {
    return id;
  }

  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

function inferDeviceType(id: string): string {
  if (id.includes('127.0.0.1') || id.includes('localhost') || id.includes('emulator')) {
    return 'emulator';
  }

  return 'device';
}
