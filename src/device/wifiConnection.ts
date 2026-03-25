import * as vscode from 'vscode';
import { COMMANDS } from '../utils/constants';
import { execHdc, listHdcTargets } from '../utils/hdc';
import { setActiveDeviceId } from './devices';

const DEFAULT_WIFI_PORT = 5555;
const LAST_WIFI_TARGET_KEY = 'harmony.lastSuccessfulWifiTarget';

type WifiStorage = {
  get?<T>(key: string, defaultValue?: T): T | undefined;
  update?(key: string, value: unknown): Thenable<void> | Promise<void> | void;
  [key: string]: unknown;
};

let wifiStorage: WifiStorage | undefined;

export function initializeWifiConnectionStorage(storage: WifiStorage | undefined): void {
  wifiStorage = storage;
}

export function getWifiDefaultPort(): number {
  const configured = vscode.workspace.getConfiguration('harmony').get<number>('wifiDefaultPort', DEFAULT_WIFI_PORT);
  return Number.isInteger(configured) && configured > 0 && configured <= 65_535
    ? configured
    : DEFAULT_WIFI_PORT;
}

export async function connectWifiDevice(initialValue?: string): Promise<string | undefined> {
  const rawInput = typeof initialValue === 'string'
    ? initialValue
    : await vscode.window.showInputBox({
        prompt: 'Enter the HarmonyOS device address for hdc tconn',
        placeHolder: `192.168.1.88:${getWifiDefaultPort()}`,
        value: getLastSuccessfulWifiTarget() ?? '',
        ignoreFocusOut: true,
      });

  const target = normalizeWifiDeviceTarget(rawInput);
  if (!target) {
    return undefined;
  }

  try {
    await execHdc(['tconn', target], { timeout: 10_000 });
  } catch (error) {
    const knownTarget = await findKnownWirelessTarget(target).catch(() => undefined);
    if (!knownTarget) {
      const action = await vscode.window.showErrorMessage(
        buildWifiConnectFailureMessage(target, error),
        'Check Environment',
        'Retry',
      );
      if (action === 'Check Environment') {
        await vscode.commands.executeCommand(COMMANDS.CHECK_ENVIRONMENT);
      } else if (action === 'Retry') {
        return connectWifiDevice(target);
      }
      return undefined;
    }
  }

  const connectedTarget = await findKnownWirelessTarget(target).catch(() => undefined) ?? target;
  setActiveDeviceId(connectedTarget);
  await rememberWifiDeviceTarget(connectedTarget);

  const action = await vscode.window.showInformationMessage(
    `Wi-Fi device connected: ${connectedTarget}`,
    'Build & Run',
    'Debug App',
  );
  if (action === 'Build & Run') {
    await vscode.commands.executeCommand(COMMANDS.BUILD_AND_RUN);
  } else if (action === 'Debug App') {
    await vscode.commands.executeCommand(COMMANDS.DEBUG_APP);
  }

  return connectedTarget;
}

export function normalizeWifiDeviceTarget(input?: string): string | undefined {
  const value = input?.trim();
  if (!value) {
    return undefined;
  }
  const defaultPort = getWifiDefaultPort();

  if (/^\[[^\]]+\](?::\d+)?$/.test(value)) {
    return value.includes(']:') ? value : `${value}:${defaultPort}`;
  }

  const colonCount = (value.match(/:/g) ?? []).length;
  if (colonCount === 0) {
    return `${value}:${defaultPort}`;
  }

  if (colonCount === 1 && /:\d+$/.test(value)) {
    return value;
  }

  if (colonCount > 1 && !value.startsWith('[')) {
    return `[${value}]:${defaultPort}`;
  }

  return value;
}

async function findKnownWirelessTarget(target: string): Promise<string | undefined> {
  const targets = await listHdcTargets(5_000);
  if (targets.includes(target)) {
    return target;
  }

  const sanitizedTarget = sanitizeWifiTarget(target);
  return targets.find((entry) => sanitizeWifiTarget(entry) === sanitizedTarget);
}

function sanitizeWifiTarget(target: string): string {
  return target.replace(/^\[/, '').replace(/\]:(\d+)$/, ':$1');
}

function buildWifiConnectFailureMessage(target: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return [
    `Failed to connect to ${target} over Wi-Fi.`,
    'Make sure the computer and device are on the same LAN, wireless debugging is enabled on the device, and the HDC target uses the correct port.',
    detail ? `HDC said: ${detail}` : '',
  ].filter(Boolean).join(' ');
}

function getLastSuccessfulWifiTarget(): string | undefined {
  if (wifiStorage?.get) {
    const value = wifiStorage.get<string>(LAST_WIFI_TARGET_KEY, undefined);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  const value = wifiStorage?.[LAST_WIFI_TARGET_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function rememberWifiDeviceTarget(target: string): Promise<void> {
  if (wifiStorage?.update) {
    await wifiStorage.update(LAST_WIFI_TARGET_KEY, target);
    return;
  }

  if (wifiStorage && typeof wifiStorage === 'object') {
    wifiStorage[LAST_WIFI_TARGET_KEY] = target;
  }
}
