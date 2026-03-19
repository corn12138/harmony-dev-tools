import * as vscode from 'vscode';
import { chooseAutoDevice, getActiveDeviceId, getConnectedDeviceState } from '../device/devices';
import { HARMONY_ACTIONS } from './actions';
import { COMMANDS } from '../utils/constants';

export function createControlCenterStatusBar(context: vscode.ExtensionContext): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  item.text = '$(rocket) HarmonyOS';
  item.tooltip = 'Open the HarmonyOS control center for build, device, inspect, and setup actions.';
  item.command = COMMANDS.OPEN_CONTROL_CENTER;
  item.show();

  context.subscriptions.push(item);
  return item;
}

export async function openControlCenter(): Promise<void> {
  const state = await getConnectedDeviceState();
  const current = chooseAutoDevice(state.devices, getActiveDeviceId());

  const pick = await vscode.window.showQuickPick(
    HARMONY_ACTIONS.map((action) => ({
      label: action.label,
      description: action.description,
      detail: `${action.section} · ${action.tooltip}`,
      action,
    })),
    {
      placeHolder: getControlCenterPlaceholder({
        currentDeviceId: current?.id,
        deviceCount: state.devices.length,
        hasDeviceError: Boolean(state.error),
      }),
    },
  );

  if (!pick) {
    return;
  }

  await vscode.commands.executeCommand(pick.action.command);
}

function getControlCenterPlaceholder(args: {
  currentDeviceId?: string;
  deviceCount: number;
  hasDeviceError: boolean;
}): string {
  if (args.hasDeviceError) {
    return 'HarmonyOS Control Center · HDC is offline, but you can still run setup and project actions';
  }

  if (args.currentDeviceId) {
    return `HarmonyOS Control Center · Active device: ${args.currentDeviceId}`;
  }

  if (args.deviceCount > 1) {
    return `HarmonyOS Control Center · ${args.deviceCount} devices connected`;
  }

  if (args.deviceCount === 1) {
    return 'HarmonyOS Control Center · 1 device connected';
  }

  return 'HarmonyOS Control Center · No device selected yet';
}
