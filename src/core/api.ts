import * as vscode from 'vscode';
import { HarmonyRegistry, Contributor } from './registry';
import { HarmonyEventBus } from './eventBus';
import { ProjectInfo } from '../project/projectDetector';

// ---- Extension Point Interfaces ----

export interface SnippetContributor extends Contributor {
  language: string;
  snippets: { prefix: string; body: string[]; description: string }[];
}

export interface SchemaContributor extends Contributor {
  filePattern: string;
  schema: object | string;
}

export interface TemplateContributor extends Contributor {
  name: string;
  description: string;
  category: 'app' | 'module' | 'library';
  generate(targetDir: string, options: Record<string, any>): Promise<void>;
}

export interface LintRuleContributor extends Contributor {
  name: string;
  severity: vscode.DiagnosticSeverity;
  check(document: vscode.TextDocument): vscode.Diagnostic[];
}

export interface DeviceAdapter extends Contributor {
  name: string;
  protocol: string;
  discover(): Promise<DeviceInfo[]>;
  install(device: DeviceInfo, hapPath: string): Promise<void>;
  uninstall(device: DeviceInfo, bundleName: string): Promise<void>;
  shell(device: DeviceInfo, command: string): Promise<string>;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
}

export interface BuildTaskContributor extends Contributor {
  taskType: string;
  label: string;
  execute(workspace: string, options: Record<string, any>): Promise<BuildResult>;
}

export interface BuildResult {
  success: boolean;
  duration: number;
  outputPath?: string;
  errors?: string[];
}

export interface PreviewRenderer extends Contributor {
  name: string;
  supportedComponents: string[];
  render(componentSource: string, context: any): Promise<string>;
}

export interface CodeActionContributor extends Contributor {
  title: string;
  kind: vscode.CodeActionKind;
  applicableWhen(document: vscode.TextDocument, range: vscode.Range): boolean;
  execute(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.WorkspaceEdit | vscode.Command>;
}

// ---- Public API ----

export interface HarmonyDevToolsAPI {
  readonly apiVersion: number;

  // Registration
  registerSnippetContributor(contributor: SnippetContributor): vscode.Disposable;
  registerSchemaContributor(contributor: SchemaContributor): vscode.Disposable;
  registerTemplateContributor(contributor: TemplateContributor): vscode.Disposable;
  registerLintRule(rule: LintRuleContributor): vscode.Disposable;
  registerDeviceAdapter(adapter: DeviceAdapter): vscode.Disposable;
  registerBuildTask(task: BuildTaskContributor): vscode.Disposable;
  registerPreviewRenderer(renderer: PreviewRenderer): vscode.Disposable;
  registerCodeAction(action: CodeActionContributor): vscode.Disposable;

  // Queries
  getProjectInfo(): ProjectInfo | undefined;
  getDevices(): Promise<DeviceInfo[]>;

  // Events
  onBuildStarted: vscode.Event<{ task: string; module?: string }>;
  onBuildCompleted: vscode.Event<{ task: string; success: boolean; duration: number }>;
  onDeviceChanged: vscode.Event<{ id: string; name: string; type: string }>;
  onProjectDetected: vscode.Event<{ rootPath: string; modules: string[] }>;
}

export function createPublicAPI(
  registry: HarmonyRegistry,
  eventBus: HarmonyEventBus
): HarmonyDevToolsAPI {
  const { ExtensionPoints } = require('./registry');

  return {
    apiVersion: 1,

    registerSnippetContributor: (c) => registry.register(ExtensionPoints.SNIPPET, c),
    registerSchemaContributor: (c) => registry.register(ExtensionPoints.SCHEMA, c),
    registerTemplateContributor: (c) => registry.register(ExtensionPoints.TEMPLATE, c),
    registerLintRule: (r) => registry.register(ExtensionPoints.LINT_RULE, r),
    registerDeviceAdapter: (a) => registry.register(ExtensionPoints.DEVICE, a),
    registerBuildTask: (t) => registry.register(ExtensionPoints.BUILD_TASK, t),
    registerPreviewRenderer: (r) => registry.register(ExtensionPoints.PREVIEW, r),
    registerCodeAction: (a) => registry.register(ExtensionPoints.CODE_ACTION, a),

    getProjectInfo: () => undefined, // Will be wired up after project detection
    getDevices: async () => [],

    onBuildStarted: eventBus.on.bind(eventBus, 'build:started') as any,
    onBuildCompleted: eventBus.on.bind(eventBus, 'build:completed') as any,
    onDeviceChanged: eventBus.on.bind(eventBus, 'device:connected') as any,
    onProjectDetected: eventBus.on.bind(eventBus, 'project:detected') as any,
  };
}
