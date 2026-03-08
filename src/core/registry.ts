import * as vscode from 'vscode';
import { eventBus } from './eventBus';

export const ExtensionPoints = {
  SNIPPET: 'harmony.snippets',
  SCHEMA: 'harmony.schemas',
  TEMPLATE: 'harmony.templates',
  LINT_RULE: 'harmony.lintRules',
  DEVICE: 'harmony.devices',
  BUILD_TASK: 'harmony.buildTasks',
  PREVIEW: 'harmony.preview',
  CODE_ACTION: 'harmony.codeActions',
} as const;

export type ExtensionPointKey = (typeof ExtensionPoints)[keyof typeof ExtensionPoints];

export interface Contributor {
  id: string;
}

export class HarmonyRegistry implements vscode.Disposable {
  private contributors = new Map<string, Map<string, any>>();

  register<T extends Contributor>(point: string, contributor: T): vscode.Disposable {
    if (!this.contributors.has(point)) {
      this.contributors.set(point, new Map());
    }
    this.contributors.get(point)!.set(contributor.id, contributor);
    eventBus.emit('extension:registered', { point, contributor: contributor.id });

    return {
      dispose: () => {
        this.contributors.get(point)?.delete(contributor.id);
      },
    };
  }

  getAll<T>(point: string): T[] {
    return Array.from(this.contributors.get(point)?.values() ?? []);
  }

  get<T>(point: string, id: string): T | undefined {
    return this.contributors.get(point)?.get(id);
  }

  has(point: string, id: string): boolean {
    return this.contributors.get(point)?.has(id) ?? false;
  }

  dispose(): void {
    this.contributors.clear();
  }
}

export const registry = new HarmonyRegistry();
