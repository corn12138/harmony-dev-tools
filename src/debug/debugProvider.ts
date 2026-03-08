import * as vscode from 'vscode';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getHdcPath } from '../utils/config';
import { CONFIG_FILES } from '../utils/constants';

const execAsync = promisify(exec);

/**
 * HarmonyOS Debug Configuration Provider
 *
 * Supports attaching VS Code's JS debugger to a running HarmonyOS app
 * via HDC port forwarding. HarmonyOS apps use the ArkCompiler which
 * exposes a Chrome DevTools Protocol (CDP) debug port.
 *
 * Flow:
 * 1. Forward device debug port to localhost via HDC
 * 2. Attach VS Code's built-in JS debugger via CDP
 * 3. User can set breakpoints, inspect variables, step through code
 */
export class HarmonyDebugConfigProvider implements vscode.DebugConfigurationProvider {

  static readonly type = 'harmonyos';

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    // If launch.json is missing or empty, provide defaults
    if (!config.type && !config.request && !config.name) {
      config.type = HarmonyDebugConfigProvider.type;
      config.name = 'Debug HarmonyOS App';
      config.request = 'launch';
    }

    config.bundleName = config.bundleName || '';
    config.abilityName = config.abilityName || 'EntryAbility';
    config.deviceId = config.deviceId || '';
    config.debugPort = config.debugPort || 9230;

    return config;
  }
}

/**
 * Debug Adapter Descriptor Factory
 * Creates an inline debug adapter that handles HDC port forwarding + CDP attach.
 */
export class HarmonyDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    // We use VS Code's built-in JS debugger by creating a server-based adapter
    // that forwards to the device's debug port via HDC
    return new vscode.DebugAdapterInlineImplementation(
      new HarmonyDebugAdapter(session.configuration)
    );
  }
}

/**
 * Inline Debug Adapter
 * Manages the debug lifecycle: port forward → launch app → attach CDP → cleanup
 */
class HarmonyDebugAdapter implements vscode.DebugAdapter {
  private readonly sendMessageEmitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  readonly onDidSendMessage = this.sendMessageEmitter.event;

  private config: vscode.DebugConfiguration;
  private portForwardProcess: ReturnType<typeof spawn> | null = null;
  private seq = 1;

  constructor(config: vscode.DebugConfiguration) {
    this.config = config;
  }

  async handleMessage(message: vscode.DebugProtocolMessage): Promise<void> {
    const msg = message as { type: string; command?: string; seq: number; arguments?: Record<string, unknown> };

    if (msg.type === 'request') {
      switch (msg.command) {
        case 'initialize':
          await this.handleInitialize(msg.seq);
          break;
        case 'launch':
          await this.handleLaunch(msg.seq);
          break;
        case 'disconnect':
          await this.handleDisconnect(msg.seq);
          break;
        default:
          this.sendResponse(msg.seq, msg.command!, {});
          break;
      }
    }
  }

  private async handleInitialize(reqSeq: number): Promise<void> {
    this.sendResponse(reqSeq, 'initialize', {
      supportsConfigurationDoneRequest: true,
      supportsTerminateRequest: true,
    });
    this.sendEvent('initialized');
  }

  private async handleLaunch(reqSeq: number): Promise<void> {
    const hdc = getHdcPath() || 'hdc';
    const port = this.config.debugPort || 9230;
    const deviceId = this.config.deviceId || '';
    const target = deviceId ? `-t ${deviceId}` : '';

    try {
      // Step 1: Read project info if not provided
      let bundleName = this.config.bundleName;
      let abilityName = this.config.abilityName || 'EntryAbility';

      if (!bundleName) {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
          bundleName = await this.readBundleName(folder.uri.fsPath);
          const detected = await this.readEntryAbility(folder.uri.fsPath);
          if (detected) abilityName = detected;
        }
      }

      if (!bundleName) {
        this.sendErrorResponse(reqSeq, 'launch', 'Cannot find bundleName. Set it in launch.json or open a HarmonyOS project.');
        return;
      }

      this.sendEvent('output', { category: 'console', output: `Debugging ${bundleName}/${abilityName}\n` });

      // Step 2: Set up HDC port forwarding
      this.sendEvent('output', { category: 'console', output: `Forwarding debug port ${port}...\n` });
      try {
        await execAsync(`${hdc} ${target} fport tcp:${port} tcp:${port}`, { timeout: 5000 });
      } catch {
        // fport may already exist, try removing and re-adding
        await execAsync(`${hdc} ${target} fport rm tcp:${port} tcp:${port}`).catch(() => {});
        await execAsync(`${hdc} ${target} fport tcp:${port} tcp:${port}`, { timeout: 5000 });
      }

      // Step 3: Launch app in debug mode
      this.sendEvent('output', { category: 'console', output: 'Launching app in debug mode...\n' });
      await execAsync(
        `${hdc} ${target} shell "aa start -a ${abilityName} -b ${bundleName} -D"`,
        { timeout: 10_000 }
      );

      // Step 4: Attach VS Code's JS debugger via CDP
      this.sendEvent('output', { category: 'console', output: `Attaching debugger on port ${port}...\n` });

      // Start a companion debug session using VS Code's built-in pwa-node debugger
      const debugConfig: vscode.DebugConfiguration = {
        type: 'pwa-chrome',
        request: 'attach',
        name: 'HarmonyOS CDP',
        port,
        address: 'localhost',
        webRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        sourceMaps: true,
        skipFiles: ['<node_internals>/**'],
      };

      // Launch the CDP attach session
      const started = await vscode.debug.startDebugging(
        vscode.workspace.workspaceFolders?.[0],
        debugConfig
      );

      if (started) {
        this.sendEvent('output', { category: 'console', output: 'Debugger attached successfully!\n' });
      } else {
        this.sendEvent('output', { category: 'console', output: 'Debugger attach started (check Debug Console).\n' });
      }

      this.sendResponse(reqSeq, 'launch', {});
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.sendErrorResponse(reqSeq, 'launch', `Debug launch failed: ${errMsg}`);
    }
  }

  private async handleDisconnect(reqSeq: number): Promise<void> {
    // Clean up port forwarding
    const hdc = getHdcPath() || 'hdc';
    const port = this.config.debugPort || 9230;
    const deviceId = this.config.deviceId || '';
    const target = deviceId ? `-t ${deviceId}` : '';

    try {
      await execAsync(`${hdc} ${target} fport rm tcp:${port} tcp:${port}`).catch(() => {});
    } catch { /* best effort cleanup */ }

    if (this.portForwardProcess) {
      this.portForwardProcess.kill();
      this.portForwardProcess = null;
    }

    this.sendResponse(reqSeq, 'disconnect', {});
    this.sendEvent('terminated');
  }

  private sendResponse(reqSeq: number, command: string, body: Record<string, unknown>): void {
    this.sendMessageEmitter.fire({
      type: 'response',
      seq: this.seq++,
      request_seq: reqSeq,
      success: true,
      command,
      body,
    } as unknown as vscode.DebugProtocolMessage);
  }

  private sendErrorResponse(reqSeq: number, command: string, message: string): void {
    this.sendMessageEmitter.fire({
      type: 'response',
      seq: this.seq++,
      request_seq: reqSeq,
      success: false,
      command,
      message,
    } as unknown as vscode.DebugProtocolMessage);
  }

  private sendEvent(event: string, body?: Record<string, unknown>): void {
    this.sendMessageEmitter.fire({
      type: 'event',
      seq: this.seq++,
      event,
      body: body || {},
    } as unknown as vscode.DebugProtocolMessage);
  }

  private async readBundleName(rootPath: string): Promise<string | null> {
    try {
      const uri = vscode.Uri.joinPath(vscode.Uri.file(rootPath), 'AppScope', CONFIG_FILES.APP_JSON);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf8');
      const match = text.match(/"bundleName"\s*:\s*"([^"]+)"/);
      return match?.[1] ?? null;
    } catch { return null; }
  }

  private async readEntryAbility(rootPath: string): Promise<string | null> {
    try {
      const files = await vscode.workspace.findFiles('**/src/main/module.json5', '**/node_modules/**');
      for (const file of files) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8');
        if (text.includes('"entry"')) {
          const m = text.match(/"name"\s*:\s*"(\w*Ability\w*)"/);
          if (m) return m[1];
        }
      }
      return null;
    } catch { return null; }
  }

  dispose(): void {
    this.sendMessageEmitter.dispose();
    if (this.portForwardProcess) {
      this.portForwardProcess.kill();
      this.portForwardProcess = null;
    }
  }
}
