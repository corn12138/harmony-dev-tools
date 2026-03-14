import * as vscode from 'vscode';
import { HarmonyEventBus, eventBus } from './core/eventBus';
import { HarmonyRegistry, registry } from './core/registry';
import { ModuleManager } from './core/module';
import { Logger } from './utils/logger';
import { createPublicAPI, HarmonyDevToolsAPI } from './core/api';
import { COMMANDS, LANGUAGE_ID } from './utils/constants';
import { getPreferredWorkspaceFolder } from './utils/workspace';

// Module imports — only type references at top level, actual code loaded dynamically
import { ProjectDetectorModule } from './project/projectDetector';

let moduleManager: ModuleManager;

export function activate(context: vscode.ExtensionContext): HarmonyDevToolsAPI {
  const logger = new Logger('HarmonyOS');
  logger.info('HarmonyOS Dev Tools activating...');

  // ---- Initialize microkernel ----
  context.subscriptions.push(eventBus, registry, logger);

  const moduleContext = { extensionContext: context, eventBus, registry, logger };
  moduleManager = new ModuleManager(moduleContext);
  context.subscriptions.push(moduleManager);

  // ---- Register core modules ----
  moduleManager.register(new ProjectDetectorModule());

  // Activate project detector immediately (lightweight)
  moduleManager.activate('harmony.projectDetector');

  // ---- Layer 1: Language features — lazy on first .ets file ----
  registerLazyLanguageFeatures(context);

  // ---- Layer 1.5: TreeView & Task Provider ----
  registerTreeViewsAndTasks(context);

  // ---- Layer 1.5: Debug Configuration Provider ----
  registerDebugProvider(context);

  // ---- Layer 1.8: DX Enhancement — real-time diagnostics, quick fix, perf lens ----
  registerDxEnhancements(context);

  // ---- Layer 2: Command-triggered features — dynamic import ----
  registerLazyCommands(context);

  // ---- Public API ----
  const api = createPublicAPI(registry, eventBus);
  logger.info('HarmonyOS Dev Tools activated');
  return api;
}

export async function deactivate(): Promise<void> {
  if (moduleManager) {
    await moduleManager.deactivateAll();
  }
}

// ---- Layer 1: Auto-activated language features (on .ets file open) ----

function registerLazyLanguageFeatures(context: vscode.ExtensionContext): void {
  let resourceProvidersPromise:
    | Promise<{
        completion: import('./resource/resourceCompletion').ResourceCompletionProvider;
        definition: import('./resource/resourceDefinition').ResourceDefinitionProvider;
      }>
    | undefined;

  const getResourceProviders = async () => {
    if (!resourceProvidersPromise) {
      resourceProvidersPromise = Promise.all([
        import('./resource/resourceCompletion'),
        import('./resource/resourceDefinition'),
      ]).then(([completionModule, definitionModule]) => ({
        completion: new completionModule.ResourceCompletionProvider(),
        definition: new definitionModule.ResourceDefinitionProvider(),
      }));
    }
    return resourceProvidersPromise;
  };

  // Completion provider — dynamically loads the completion module
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(LANGUAGE_ID, {
      async provideCompletionItems(document, position, token, completionContext) {
        const { provideCompletionItems } = await import('./language/completionProvider');
        return provideCompletionItems(document, position, token, completionContext);
      },
    }, '.', '@', '\'', '"')
  );

  // Hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(LANGUAGE_ID, {
      async provideHover(document, position, token) {
        const { provideHover } = await import('./language/hoverProvider');
        return provideHover(document, position, token);
      },
    })
  );

  // CodeLens provider
  const codeLensEnabled = vscode.workspace.getConfiguration('harmony').get('enableCodeLens', true);
  if (codeLensEnabled) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(LANGUAGE_ID, {
        async provideCodeLenses(document, token) {
          const { provideCodeLenses } = await import('./language/codeLensProvider');
          return provideCodeLenses(document, token);
        },
      })
    );
  }

  // Color provider
  context.subscriptions.push(
    vscode.languages.registerColorProvider(LANGUAGE_ID, {
      async provideDocumentColors(document, token) {
        const { provideDocumentColors } = await import('./language/colorProvider');
        return provideDocumentColors(document, token);
      },
      async provideColorPresentations(color, colorContext, token) {
        const { provideColorPresentations } = await import('./language/colorProvider');
        return provideColorPresentations(color, colorContext, token);
      },
    })
  );

  // $r() Resource completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(LANGUAGE_ID, {
      async provideCompletionItems(document, position) {
        const providers = await getResourceProviders();
        return providers.completion.provideCompletionItems(document, position);
      },
    }, '\'', '"', '.')
  );

  // $r() Definition provider (Ctrl+Click jump to resource)
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(LANGUAGE_ID, {
      async provideDefinition(document, position) {
        const providers = await getResourceProviders();
        return providers.definition.provideDefinition(document, position);
      },
    })
  );

  // $r() Resource validation diagnostics
  if (vscode.workspace.getConfiguration('harmony').get('enableResourceValidation', true)) {
    import('./resource/resourceDefinition').then(({ ResourceDiagnosticProvider }) => {
      context.subscriptions.push(new ResourceDiagnosticProvider());
    });
  }
}

// ---- Layer 1.5: TreeView panels & Task Provider ----

function registerTreeViewsAndTasks(context: vscode.ExtensionContext): void {
  // Project Files TreeView — uses getCurrentProjectFileIndex(), refreshes on project:indexUpdated
  import('./project/projectFilesTreeView').then(({ ProjectFilesTreeProvider }) => {
    const projectFilesProvider = new ProjectFilesTreeProvider(eventBus);
    context.subscriptions.push(projectFilesProvider);
    vscode.window.createTreeView('harmony.projectView', {
      treeDataProvider: projectFilesProvider,
    });
  });

  import('./resource/resourceTreeView').then(({ ResourceTreeProvider }) => {
    const resourceProvider = new ResourceTreeProvider();
    context.subscriptions.push(resourceProvider);
    const treeView = vscode.window.createTreeView('harmony.resourceView', {
      treeDataProvider: resourceProvider,
    });
    context.subscriptions.push(treeView);
  });

  // Device TreeView — lazy import, register immediately so the panel exists
  import('./device/treeView').then(({ DeviceTreeProvider }) => {
    const deviceProvider = new DeviceTreeProvider(eventBus);
    context.subscriptions.push(deviceProvider);
    const treeView = vscode.window.createTreeView('harmony.deviceView', {
      treeDataProvider: deviceProvider,
    });
    context.subscriptions.push(treeView);

    // Wire refresh command to the tree provider
    context.subscriptions.push(
      vscode.commands.registerCommand(COMMANDS.VIEW_DEVICES, () => deviceProvider.refresh())
    );
  });

  // Hvigor Task Provider
  import('./build/taskProvider').then(({ HvigorTaskProvider }) => {
    context.subscriptions.push(
      vscode.tasks.registerTaskProvider(HvigorTaskProvider.type, new HvigorTaskProvider())
    );
  });
}

// ---- Layer 1.5: Debug Provider ----

function registerDebugProvider(context: vscode.ExtensionContext): void {
  import('./debug/debugProvider').then(({ HarmonyDebugConfigProvider, HarmonyDebugAdapterFactory }) => {
    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider(
        HarmonyDebugConfigProvider.type,
        new HarmonyDebugConfigProvider()
      )
    );
    context.subscriptions.push(
      vscode.debug.registerDebugAdapterDescriptorFactory(
        HarmonyDebugConfigProvider.type,
        new HarmonyDebugAdapterFactory()
      )
    );
  });
}

// ---- Layer 1.8: DX Enhancement providers ----

function registerDxEnhancements(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('harmony');

  // Real-time ArkTS diagnostics (any/unknown, state traps, perf anti-patterns)
  if (config.get('enableDiagnostics', true)) {
    import('./language/diagnosticProvider').then(({ createDiagnosticProvider }) => {
      createDiagnosticProvider(context);
    });

    // Quick Fix code actions for all diagnostic rules (only meaningful with diagnostics)
    import('./language/codeFixProvider').then(({ createCodeFixProvider }) => {
      createCodeFixProvider(context);
    });
  }

  // Performance insight CodeLens on build() / ForEach / struct
  if (config.get('enablePerfLens', true)) {
    import('./language/perfLens').then(({ createPerfLensProvider }) => {
      createPerfLensProvider(context);
    });
  }

  // Config file hover documentation (build-profile, module, app, oh-package)
  import('./language/configHoverProvider').then(({ createConfigHoverProvider }) => {
    createConfigHoverProvider(context);
  });

  // OHPM dependency insight (outdated deps, CodeLens on oh-package.json5)
  if (config.get('enableOhpmInsight', true)) {
    import('./project/ohpmInsight').then(({ createOhpmInsightProvider }) => {
      createOhpmInsightProvider(context);
    });
  }
}

// ---- Layer 2: Command-triggered features ----

function registerLazyCommands(context: vscode.ExtensionContext): void {
  const lazyCommand = (commandId: string, handler: () => Promise<void>) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, handler)
    );
  };

  lazyCommand(COMMANDS.CREATE_PROJECT, async () => {
    const { runProjectWizard } = await import('./project/wizard');
    await runProjectWizard();
  });

  lazyCommand(COMMANDS.BUILD_HAP, async () => {
    const { buildHap } = await import('./build/runner');
    await buildHap();
  });

  lazyCommand(COMMANDS.RUN_ON_DEVICE, async () => {
    const { runOnDevice } = await import('./device/manager');
    await runOnDevice();
  });

  lazyCommand(COMMANDS.CLEAN, async () => {
    const { cleanBuild } = await import('./build/runner');
    await cleanBuild();
  });

  // VIEW_DEVICES is registered in registerTreeViewsAndTasks

  lazyCommand(COMMANDS.INSTALL_HAP, async () => {
    const { installHap } = await import('./device/manager');
    await installHap();
  });

  lazyCommand(COMMANDS.VIEW_LOGS, async () => {
    const { viewLogs } = await import('./device/logViewer');
    await viewLogs();
  });

  lazyCommand(COMMANDS.PREVIEW_COMPONENT, async () => {
    const { previewComponent } = await import('./preview/panel');
    await previewComponent();
  });

  lazyCommand(COMMANDS.FORMAT_DOCUMENT, async () => {
    const { formatDocument } = await import('./tools/formatter');
    await formatDocument();
  });

  lazyCommand(COMMANDS.ORGANIZE_IMPORTS, async () => {
    const { organizeImports } = await import('./tools/importOrganizer');
    await organizeImports();
  });

  lazyCommand(COMMANDS.EXTRACT_COMPONENT, async () => {
    const { extractComponent } = await import('./tools/codeActions');
    await extractComponent();
  });

  lazyCommand(COMMANDS.EXTRACT_BUILDER, async () => {
    const { extractBuilder } = await import('./tools/codeActions');
    await extractBuilder();
  });

  lazyCommand(COMMANDS.EXTRACT_STRING, async () => {
    const { extractString } = await import('./tools/codeActions');
    await extractString();
  });

  lazyCommand(COMMANDS.MANAGE_DEPS, async () => {
    const { manageDeps } = await import('./project/deps');
    await manageDeps();
  });

  lazyCommand(COMMANDS.OPEN_DOCS, async () => {
    const { openDocs } = await import('./tools/docsSearch');
    await openDocs();
  });

  lazyCommand(COMMANDS.UI_INSPECTOR, async () => {
    const { openUIInspector } = await import('./debug/inspectorPanel');
    await openUIInspector();
  });

  lazyCommand(COMMANDS.BUILD_AND_RUN, async () => {
    const { buildAndRun } = await import('./build/buildAndRun');
    await buildAndRun({ openInspector: true });
  });

  lazyCommand(COMMANDS.TERMINAL_BUILD_RUN, async () => {
    const { terminalBuildAndRun } = await import('./build/terminalRunner');
    await terminalBuildAndRun();
  });

  lazyCommand(COMMANDS.STOP_APP, async () => {
    const { terminalStopApp } = await import('./build/terminalRunner');
    await terminalStopApp();
  });

  lazyCommand(COMMANDS.DEBUG_APP, async () => {
    // Start a debug session using our HarmonyOS debug type
    const folder = getPreferredWorkspaceFolder();
    await vscode.debug.startDebugging(folder, {
      type: 'harmonyos',
      request: 'launch',
      name: 'Debug HarmonyOS App',
    });
  });

  lazyCommand(COMMANDS.MIGRATE_V1_TO_V2, async () => {
    const { migrateV1ToV2 } = await import('./tools/codeActions');
    await migrateV1ToV2();
  });

  lazyCommand(COMMANDS.CHECK_API_COMPAT, async () => {
    const { checkApiCompatibility } = await import('./tools/apiCompatChecker');
    await checkApiCompatibility();
  });

  lazyCommand(COMMANDS.DEVICE_MIRROR, async () => {
    const { openDeviceMirror } = await import('./device/mirrorPanel');
    await openDeviceMirror();
  });

  lazyCommand(COMMANDS.LAUNCH_EMULATOR, async () => {
    const { launchEmulator } = await import('./device/emulatorManager');
    await launchEmulator();
  });

  lazyCommand(COMMANDS.STOP_EMULATOR, async () => {
    const { stopEmulator } = await import('./device/emulatorManager');
    await stopEmulator();
  });

  lazyCommand(COMMANDS.CHECK_ENVIRONMENT, async () => {
    const { checkEnvironment } = await import('./project/checkEnvironment');
    await checkEnvironment();
  });

  lazyCommand(COMMANDS.TAKE_SCREENSHOT, async () => {
    const { captureScreenshot } = await import('./debug/uiInspector');
    const base64 = await captureScreenshot();
    if (base64) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const folder = getPreferredWorkspaceFolder()?.uri.fsPath ?? '/tmp';
      const file = path.join(folder, `screenshot_${Date.now()}.png`);
      await fs.writeFile(file, Buffer.from(base64, 'base64'));
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
      vscode.window.showInformationMessage(`Screenshot saved: ${file}`);
    } else {
      vscode.window.showWarningMessage('Failed to capture screenshot. Is a device connected?');
    }
  });
}
