import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Schema types for versioned metadata
// ---------------------------------------------------------------------------

export interface DecoratorMeta {
  name: string;
  category: 'component' | 'state' | 'style' | 'concurrency' | 'ability' | 'common';
  stateModel: 'v1' | 'v2' | 'common';
  minApi: number;
  en: string;
  zh: string;
  docUrl: string;
  migration?: { to: string; hint: string };
  previewSupported: boolean;
}

export interface ComponentMeta {
  name: string;
  category: 'layout' | 'basic' | 'media' | 'canvas' | 'menu';
  minApi: number;
  hasChildren: boolean;
  previewSupported: boolean;
  en: string;
  zh: string;
  docUrl: string;
}

// ---------------------------------------------------------------------------
// Singleton loader — reads JSON once and caches in memory
// ---------------------------------------------------------------------------

let _decorators: DecoratorMeta[] | undefined;
let _components: ComponentMeta[] | undefined;

function configDir(): string {
  return path.resolve(__dirname, '..', 'config');
}

function loadJson<T>(filename: string): T[] {
  const filePath = path.join(configDir(), filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T[];
}

export function getDecorators(): DecoratorMeta[] {
  if (!_decorators) {
    _decorators = loadJson<DecoratorMeta>('decorators.json');
  }
  return _decorators;
}

export function getComponents(): ComponentMeta[] {
  if (!_components) {
    _components = loadJson<ComponentMeta>('components.json');
  }
  return _components;
}

// ---------------------------------------------------------------------------
// Convenience lookups
// ---------------------------------------------------------------------------

export function getDecoratorByName(name: string): DecoratorMeta | undefined {
  return getDecorators().find(d => d.name === name);
}

export function getComponentByName(name: string): ComponentMeta | undefined {
  return getComponents().find(c => c.name === name);
}

export function getDecoratorNames(): string[] {
  return getDecorators().map(d => d.name);
}

export function getComponentNames(): string[] {
  return getComponents().map(c => c.name);
}

/** Return all items (decorators + components) that require a minimum API > given level */
export function getFeaturesAboveApi(apiLevel: number): Array<{ name: string; kind: 'decorator' | 'component'; minApi: number }> {
  const results: Array<{ name: string; kind: 'decorator' | 'component'; minApi: number }> = [];
  for (const d of getDecorators()) {
    if (d.minApi > apiLevel) {
      results.push({ name: d.name, kind: 'decorator', minApi: d.minApi });
    }
  }
  for (const c of getComponents()) {
    if (c.minApi > apiLevel) {
      results.push({ name: c.name, kind: 'component', minApi: c.minApi });
    }
  }
  return results;
}

export function apiLabel(minApi: number): string {
  if (minApi <= 8) return '';
  return `API ${minApi}+`;
}
