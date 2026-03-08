import * as vscode from 'vscode';
import { HarmonyEventBus } from './eventBus';
import { HarmonyRegistry } from './registry';
import { Logger } from '../utils/logger';

export interface ModuleContext {
  extensionContext: vscode.ExtensionContext;
  eventBus: HarmonyEventBus;
  registry: HarmonyRegistry;
  logger: Logger;
}

export interface HarmonyModule {
  readonly id: string;
  readonly dependencies?: string[];
  activate(context: ModuleContext): Promise<void>;
  deactivate(): Promise<void>;
  readonly isActive: boolean;
}

export class ModuleManager implements vscode.Disposable {
  private modules = new Map<string, HarmonyModule>();
  private activated = new Set<string>();
  private context: ModuleContext;

  constructor(context: ModuleContext) {
    this.context = context;
  }

  register(module: HarmonyModule): void {
    this.modules.set(module.id, module);
  }

  async activate(moduleId: string): Promise<void> {
    if (this.activated.has(moduleId)) return;

    const mod = this.modules.get(moduleId);
    if (!mod) {
      this.context.logger.warn(`Module "${moduleId}" not found`);
      return;
    }

    // Activate dependencies first
    for (const dep of mod.dependencies ?? []) {
      await this.activate(dep);
    }

    try {
      await mod.activate(this.context);
      this.activated.add(moduleId);
      this.context.eventBus.emit('extension:activated', { id: moduleId });
      this.context.logger.info(`Module "${moduleId}" activated`);
    } catch (err) {
      this.context.logger.error(`Failed to activate module "${moduleId}": ${err}`);
    }
  }

  async activateAll(): Promise<void> {
    for (const id of this.modules.keys()) {
      await this.activate(id);
    }
  }

  async deactivateAll(): Promise<void> {
    // Deactivate in reverse order
    const ids = Array.from(this.activated).reverse();
    for (const id of ids) {
      const mod = this.modules.get(id);
      if (mod) {
        try {
          await mod.deactivate();
          this.context.logger.info(`Module "${id}" deactivated`);
        } catch (err) {
          this.context.logger.error(`Failed to deactivate module "${id}": ${err}`);
        }
      }
    }
    this.activated.clear();
  }

  isActivated(moduleId: string): boolean {
    return this.activated.has(moduleId);
  }

  dispose(): void {
    // deactivateAll should be called explicitly before dispose
    this.modules.clear();
    this.activated.clear();
  }
}
