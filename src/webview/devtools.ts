import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractDeviceIdFromCommandArg } from '../device/commandArgs';
import { ensureConnectedDevice } from '../device/devices';
import { buildHdcTargetArgs, execHdc } from '../utils/hdc';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { parseRequestPermissionEntries } from '../project/projectConfigDiagnostics';
import { formatDebugTarget, listHostNetworkAddresses, parseDeviceNetworkAddresses, pickPreferredDeviceAddress } from './network';
import { extractWebViewUrlHints, hasWebViewUsage, parseWebDebuggingAccess, type WebDebuggingAccessConfig } from './projectAnalysis';
import { buildDevToolsFrontendUrl, extractInspectablePageTargets, fetchDevToolsTargets, pickSuggestedInspectableTarget, type DevToolsTarget } from './targets';

const WEBVIEW_DEVTOOLS_DOC_URL = 'https://gitee.com/openharmony/docs/blob/master/zh-cn/application-dev/web/web-debugging-with-devtools.md';
const CHROME_INSPECT_URL = 'chrome://inspect/#devices';
const DEFAULT_WEBVIEW_DEVTOOLS_PORT = 9222;

interface HdcFportMapping {
  local: string;
  remote: string;
}

interface WebViewDebugProjectState {
  hasWebComponent: boolean;
  hasInternetPermission: boolean;
  moduleJsonUri?: vscode.Uri;
  debugAccess?: WebDebuggingAccessConfig;
  preferredUrls: string[];
}

export async function openWebViewDevTools(commandArg?: unknown): Promise<void> {
  const preferredDeviceId = extractDeviceIdFromCommandArg(commandArg);
  const folder = getPreferredWorkspaceFolder();
  const projectState = folder ? await inspectWebViewDebugProject(folder.uri) : undefined;

  const device = await ensureConnectedDevice({
    preferredId: preferredDeviceId,
    placeHolder: 'Select the HarmonyOS device used for WebView DevTools',
  });
  if (!device) {
    return;
  }

  if (projectState?.debugAccess?.port) {
    await handleWirelessWebViewDebugging(
      device.id,
      projectState.debugAccess.port,
      projectState.moduleJsonUri,
      projectState.preferredUrls,
    );
    return;
  }

  if (projectState && !projectState.debugAccess?.enabled) {
    await explainMissingWebDebugAccess(projectState);
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Preparing WebView DevTools',
    },
    async (progress) => {
      progress.report({ message: 'Discovering ArkWeb DevTools sockets...' });
      const sockets = await discoverWebViewDevToolsSockets(device.id);
      if (sockets.length === 0) {
        await explainMissingWebViewSocket(projectState);
        return;
      }

      const socket = await pickWebViewSocket(sockets);
      if (!socket) {
        return;
      }

      progress.report({ message: 'Forwarding WebView DevTools to localhost:9222...' });
      const port = await ensureWebViewDevToolsForward(device.id, socket);
      const endpoint = `http://127.0.0.1:${port}`;
      const targets = await fetchDevToolsTargets(endpoint).catch(() => []);

      progress.report({ message: 'Opening Chrome inspect...' });
      await vscode.env.openExternal(vscode.Uri.parse(CHROME_INSPECT_URL));

      const actions = buildWebViewActions(
        projectState?.moduleJsonUri,
        projectState?.hasInternetPermission,
        targets,
        undefined,
        projectState?.preferredUrls ?? [],
      );

      const action = await vscode.window.showInformationMessage(
        buildWebViewReadyMessage(`localhost:${port}`, targets, false, projectState?.preferredUrls ?? []),
        ...actions,
      );

      await handleWebViewAction(action, endpoint, targets, projectState?.moduleJsonUri, undefined, projectState?.preferredUrls ?? []);
    },
  );
}

export function parseWebViewDevToolsSockets(stdout: string): string[] {
  return Array.from(stdout.matchAll(/\b(webview_devtools_remote_\d+)\b/g))
    .map((item) => item[1])
    .filter((value, index, items) => items.indexOf(value) === index);
}

export function parseHdcFportMappings(stdout: string): HdcFportMapping[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes('[Empty]'))
    .map((line) => {
      const match = line.match(/(tcp:\d+)\s+(localabstract:[^\s]+|tcp:[^\s]+)/);
      if (!match) {
        return undefined;
      }
      return {
        local: match[1],
        remote: match[2],
      } satisfies HdcFportMapping;
    })
    .filter((item): item is HdcFportMapping => Boolean(item));
}

async function inspectWebViewDebugProject(rootUri: vscode.Uri): Promise<WebViewDebugProjectState> {
  const moduleFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(rootUri, '**/src/main/module.json5'),
    '**/node_modules/**',
    20,
  );

  let moduleJsonUri: vscode.Uri | undefined;
  let hasInternetPermission = false;
  for (const uri of moduleFiles) {
    const text = await safeReadText(uri);
    if (!text) {
      continue;
    }
    moduleJsonUri = moduleJsonUri ?? uri;
    hasInternetPermission = parseRequestPermissionEntries(text).some((item) => item.name === 'ohos.permission.INTERNET');
    if (hasInternetPermission) {
      break;
    }
  }

  const etsFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(rootUri, '**/*.ets'),
    '**/node_modules/**',
    200,
  );

  let hasWebComponent = false;
  let debugAccess: WebDebuggingAccessConfig | undefined;
  const preferredUrls: string[] = [];
  const preferredUrlSet = new Set<string>();
  const activeDocument = vscode.window.activeTextEditor?.document;
  const activeUri = activeDocument && isUriInsideRoot(activeDocument.uri, rootUri)
    ? activeDocument.uri.toString()
    : undefined;
  for (const uri of etsFiles) {
    const text = await safeReadText(uri);
    if (!text) {
      continue;
    }

    if (!hasWebComponent && hasWebViewUsage(text)) {
      hasWebComponent = true;
    }

    const config = parseWebDebuggingAccess(text);
    if (config) {
      debugAccess = config;
      if (config.port) {
        // keep scanning for URL hints
      }
    }

    const hints = extractWebViewUrlHints(text);
    if (hints.length > 0) {
      if (uri.toString() === activeUri) {
        for (const hint of [...hints].reverse()) {
          if (preferredUrlSet.has(hint)) {
            continue;
          }
          preferredUrlSet.add(hint);
          preferredUrls.unshift(hint);
        }
      } else {
        for (const hint of hints) {
          if (preferredUrlSet.has(hint)) {
            continue;
          }
          preferredUrlSet.add(hint);
          preferredUrls.push(hint);
        }
      }
    }
  }

  return {
    hasWebComponent,
    hasInternetPermission,
    moduleJsonUri,
    debugAccess,
    preferredUrls,
  };
}

function isUriInsideRoot(candidate: vscode.Uri, rootUri: vscode.Uri): boolean {
  const relative = path.relative(rootUri.fsPath, candidate.fsPath);
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function discoverWebViewDevToolsSockets(deviceId: string): Promise<string[]> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  const { stdout } = await execHdc(
    [...targetArgs, 'shell', 'cat /proc/net/unix | grep devtools'],
    { timeout: 5000 },
  );
  return parseWebViewDevToolsSockets(stdout);
}

async function ensureWebViewDevToolsForward(deviceId: string, socket: string): Promise<number> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  const { stdout } = await execHdc([...targetArgs, 'fport', 'ls'], { timeout: 5000 });
  const mappings = parseHdcFportMappings(stdout);
  const desiredLocal = `tcp:${DEFAULT_WEBVIEW_DEVTOOLS_PORT}`;
  const desiredRemote = `localabstract:${socket}`;

  const existing = mappings.find((item) => item.local === desiredLocal && item.remote === desiredRemote);
  if (existing) {
    return DEFAULT_WEBVIEW_DEVTOOLS_PORT;
  }

  const conflict = mappings.find((item) => item.local === desiredLocal && item.remote !== desiredRemote);
  if (conflict) {
    await execHdc([...targetArgs, 'fport', 'rm', conflict.local, conflict.remote], { timeout: 5000 }).catch(() => undefined);
  }

  try {
    await execHdc([...targetArgs, 'fport', desiredLocal, desiredRemote], { timeout: 5000 });
    return DEFAULT_WEBVIEW_DEVTOOLS_PORT;
  } catch {
    const fallback = mappings.find((item) => item.remote === desiredRemote && /^tcp:\d+$/.test(item.local));
    if (fallback) {
      return Number.parseInt(fallback.local.slice('tcp:'.length), 10);
    }
    throw new Error(`Failed to forward WebView DevTools socket ${socket}.`);
  }
}

async function pickWebViewSocket(sockets: string[]): Promise<string | undefined> {
  if (sockets.length === 1) {
    return sockets[0];
  }

  const pick = await vscode.window.showQuickPick(
    sockets.map((socket) => ({
      label: socket,
      description: 'Running ArkWeb DevTools socket',
      socket,
    })),
    {
      placeHolder: 'Select the running WebView DevTools socket',
    },
  );

  return pick?.socket;
}

async function explainMissingWebDebugAccess(projectState?: WebViewDebugProjectState): Promise<void> {
  const actions = ['Open WebView Docs'];
  if (projectState?.moduleJsonUri && !projectState.hasInternetPermission) {
    actions.unshift('Open module.json5');
  }

  const hint = projectState?.hasWebComponent
    ? 'No setWebDebuggingAccess(true) call was found. Enable Web debugging in app code before opening DevTools.'
    : 'No Web component usage was detected in the current workspace, and no setWebDebuggingAccess(true) call was found.';

  const action = await vscode.window.showWarningMessage(hint, ...actions);
  if (action === 'Open WebView Docs') {
    await vscode.env.openExternal(vscode.Uri.parse(WEBVIEW_DEVTOOLS_DOC_URL));
  } else if (action === 'Open module.json5' && projectState?.moduleJsonUri) {
    await vscode.commands.executeCommand('vscode.open', projectState.moduleJsonUri);
  }
}

async function explainMissingWebViewSocket(projectState?: WebViewDebugProjectState): Promise<void> {
  const actions = ['Open WebView Docs'];
  if (projectState?.moduleJsonUri && !projectState.hasInternetPermission) {
    actions.unshift('Open module.json5');
  }

  const reasons: string[] = [];
  if (projectState && !projectState.hasInternetPermission) {
    reasons.push('module.json5 is missing `ohos.permission.INTERNET`');
  }
  if (!projectState?.hasWebComponent) {
    reasons.push('no Web component was detected in the current workspace');
  }
  if (!projectState?.debugAccess?.enabled) {
    reasons.push('the app does not appear to call `setWebDebuggingAccess(true)`');
  }

  const suffix = reasons.length > 0
    ? ` Likely reasons: ${reasons.join('; ')}.`
    : ' Make sure the target page is open, Web debugging is enabled, and the app is still running.';
  const action = await vscode.window.showWarningMessage(
    `No running WebView DevTools socket was found on the selected device.${suffix}`,
    ...actions,
  );

  if (action === 'Open WebView Docs') {
    await vscode.env.openExternal(vscode.Uri.parse(WEBVIEW_DEVTOOLS_DOC_URL));
  } else if (action === 'Open module.json5' && projectState?.moduleJsonUri) {
    await vscode.commands.executeCommand('vscode.open', projectState.moduleJsonUri);
  }
}

async function handleWirelessWebViewDebugging(
  deviceId: string,
  port: number,
  moduleJsonUri?: vscode.Uri,
  preferredUrls: string[] = [],
): Promise<void> {
  const selectedAddress = await selectWirelessDebugAddress(deviceId);
  const target = selectedAddress ? formatDebugTarget(selectedAddress.address, port) : formatDebugTarget('<device-ip>', port);
  const endpoint = selectedAddress ? buildHttpEndpoint(selectedAddress.address, port) : undefined;
  const targets = endpoint ? await fetchDevToolsTargets(endpoint).catch(() => []) : [];
  const actions = buildWebViewActions(moduleJsonUri, true, targets, target, preferredUrls);

  await vscode.env.openExternal(vscode.Uri.parse(CHROME_INSPECT_URL));

  const action = await vscode.window.showInformationMessage(
    selectedAddress
      ? buildWebViewReadyMessage(target, targets, true, preferredUrls)
      : `This project appears to use API 20+ wireless WebView debugging on port ${port}. Open Chrome inspect, enable “Discover network targets”, and add ${target}.`,
    ...actions,
  );

  await handleWebViewAction(action, endpoint, targets, moduleJsonUri, target, preferredUrls);
}

async function selectWirelessDebugAddress(deviceId: string): Promise<{ address: string } | undefined> {
  const candidates = await discoverDeviceNetworkAddresses(deviceId);
  if (candidates.length === 0) {
    return undefined;
  }

  return pickPreferredDeviceAddress(candidates, listHostNetworkAddresses()) ?? candidates[0];
}

async function discoverDeviceNetworkAddresses(deviceId: string) {
  const targetArgs = buildHdcTargetArgs(deviceId);
  const commands = [
    'ip -o addr show',
    'ifconfig',
  ];

  for (const shellCommand of commands) {
    try {
      const { stdout } = await execHdc([...targetArgs, 'shell', shellCommand], { timeout: 5000 });
      const addresses = parseDeviceNetworkAddresses(stdout);
      if (addresses.length > 0) {
        return addresses;
      }
    } catch {
      continue;
    }
  }

  return [];
}

function buildHttpEndpoint(host: string, port: number): string {
  return host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
}

function buildWebViewReadyMessage(
  targetLabel: string,
  targets: DevToolsTarget[],
  isWireless = false,
  preferredUrls: string[] = [],
): string {
  const pages = extractInspectablePageTargets(targets);
  const suggested = pickSuggestedInspectableTarget(targets, preferredUrls);

  if (suggested) {
    const pageLabel = suggested.title || suggested.url || 'untitled page';
    if (isWireless) {
      return `Detected API 20+ wireless WebView debugging on ${targetLabel}. Chrome inspect has been opened, and the current page appears to be ${pageLabel}.`;
    }
    return `WebView DevTools is ready on ${targetLabel}. Chrome inspect can now discover the running ArkWeb page ${pageLabel}.`;
  }

  if (pages.length > 1) {
    if (isWireless) {
      return `Detected API 20+ wireless WebView debugging on ${targetLabel}. Chrome inspect has been opened, and ${pages.length} inspectable WebView pages were found.`;
    }
    return `WebView DevTools is ready on ${targetLabel}. Chrome inspect can now discover ${pages.length} running ArkWeb pages.`;
  }

  if (isWireless) {
    return `Detected API 20+ wireless WebView debugging on ${targetLabel}. Chrome inspect has been opened; if needed, add ${targetLabel} under “Discover network targets”.`;
  }
  return `WebView DevTools is ready on ${targetLabel}. Chrome inspect can now discover the running ArkWeb page.`;
}

function buildWebViewActions(
  moduleJsonUri: vscode.Uri | undefined,
  hasInternetPermission: boolean | undefined,
  targets: DevToolsTarget[],
  copyTarget?: string,
  preferredUrls: string[] = [],
): string[] {
  const actions = ['Open Chrome Inspect', 'Open WebView Docs'];
  if (copyTarget) {
    actions.unshift(`Copy ${copyTarget}`);
  }

  const pages = extractInspectablePageTargets(targets);
  if (pickSuggestedInspectableTarget(targets, preferredUrls)) {
    actions.unshift('Open Detected Page');
  } else if (pages.length > 1) {
    actions.unshift('Choose Detected Page');
  }

  if (moduleJsonUri && hasInternetPermission === false) {
    actions.unshift('Open module.json5');
  }

  return actions;
}

async function handleWebViewAction(
  action: string | undefined,
  endpoint: string | undefined,
  targets: DevToolsTarget[],
  moduleJsonUri?: vscode.Uri,
  copyTarget?: string,
  preferredUrls: string[] = [],
): Promise<void> {
  if (!action) {
    return;
  }

  if (copyTarget && action === `Copy ${copyTarget}`) {
    await vscode.env.clipboard.writeText(copyTarget);
    return;
  }

  if (action === 'Open Chrome Inspect') {
    await vscode.env.openExternal(vscode.Uri.parse(CHROME_INSPECT_URL));
    return;
  }

  if (action === 'Open WebView Docs') {
    await vscode.env.openExternal(vscode.Uri.parse(WEBVIEW_DEVTOOLS_DOC_URL));
    return;
  }

  if (action === 'Open module.json5' && moduleJsonUri) {
    await vscode.commands.executeCommand('vscode.open', moduleJsonUri);
    return;
  }

  if (!endpoint) {
    return;
  }

  if (action === 'Open Detected Page') {
    const target = pickSuggestedInspectableTarget(targets, preferredUrls);
    await openDevToolsTarget(endpoint, target);
    return;
  }

  if (action === 'Choose Detected Page') {
    const target = await pickDevToolsTarget(targets);
    await openDevToolsTarget(endpoint, target);
  }
}

async function pickDevToolsTarget(targets: DevToolsTarget[]): Promise<DevToolsTarget | undefined> {
  const pages = extractInspectablePageTargets(targets);
  if (pages.length === 0) {
    return undefined;
  }

  if (pages.length === 1) {
    return pages[0];
  }

  const pick = await vscode.window.showQuickPick(
    pages.map((target) => ({
      label: target.title || 'Untitled WebView',
      description: target.url || 'about:blank',
      detail: target.description || target.type,
      target,
    })),
    {
      placeHolder: 'Select the WebView page to inspect',
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );

  return pick?.target;
}

async function openDevToolsTarget(endpoint: string, target: DevToolsTarget | undefined): Promise<void> {
  if (!target) {
    return;
  }

  const frontendUrl = buildDevToolsFrontendUrl(endpoint, target);
  if (!frontendUrl) {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.parse(frontendUrl));
}

async function safeReadText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('utf8');
  } catch {
    return undefined;
  }
}
