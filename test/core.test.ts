import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonyEventBus } from '../src/core/eventBus';
import { HarmonyModule, ModuleContext, ModuleManager } from '../src/core/module';
import { ExtensionPoints, HarmonyRegistry } from '../src/core/registry';

function createMockContext(): ModuleContext {
  return {
    extensionContext: { subscriptions: [] } as any,
    eventBus: new HarmonyEventBus(),
    registry: new HarmonyRegistry(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
  };
}

function createMockModule(id: string, deps?: string[]): HarmonyModule {
  return {
    id,
    dependencies: deps,
    isActive: false,
    activate: vi.fn(async () => {}),
    deactivate: vi.fn(async () => {}),
  } as unknown as HarmonyModule;
}

describe('HarmonyEventBus', () => {
  let bus: HarmonyEventBus;

  beforeEach(() => {
    bus = new HarmonyEventBus();
  });

  afterEach(() => {
    bus.dispose();
  });

  it('should emit and receive typed events', () => {
    const received: unknown[] = [];
    bus.on('build:started', (data) => {
      received.push(data);
    });

    bus.emit('build:started', { task: 'hap', module: 'app' });

    expect(received).toEqual([{ task: 'hap', module: 'app' }]);
  });

  it('should support multiple listeners on same event', () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('device:connected', a);
    bus.on('device:connected', b);

    bus.emit('device:connected', { id: 'd1', name: 'Dev', type: 'usb' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ id: 'd1', name: 'Dev', type: 'usb' });
  });

  it('should stop receiving after listener dispose', () => {
    const listener = vi.fn();
    const sub = bus.on('resource:changed', listener);
    sub.dispose();

    bus.emit('resource:changed', { type: 'x', path: '/p' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('onPattern should match existing emitters with prefix', () => {
    const patternSpy = vi.fn();
    bus.on('project:detected', () => {});

    bus.onPattern('project:*', patternSpy);
    bus.emit('project:detected', { rootPath: '/', modules: [] });

    expect(patternSpy).toHaveBeenCalledTimes(1);
    expect(patternSpy).toHaveBeenCalledWith('project:detected', { rootPath: '/', modules: [] });
  });

  it('onPattern should match NEW emitters created AFTER subscription', () => {
    const patternSpy = vi.fn();
    bus.onPattern('build:*', patternSpy);

    bus.on('build:started', () => {});
    bus.emit('build:started', { task: 't' });

    expect(patternSpy).toHaveBeenCalledTimes(1);
    expect(patternSpy).toHaveBeenCalledWith('build:started', { task: 't' });
  });

  it('should not fire any events after bus dispose', () => {
    const direct = vi.fn();
    const pattern = vi.fn();
    bus.on('extension:activated', direct);
    bus.onPattern('extension:*', pattern);

    bus.dispose();

    bus.emit('extension:activated', { id: 'm1' });

    expect(direct).not.toHaveBeenCalled();
    expect(pattern).not.toHaveBeenCalled();
  });
});

describe('ModuleManager', () => {
  let ctx: ModuleContext;
  let manager: ModuleManager;

  beforeEach(() => {
    ctx = createMockContext();
    manager = new ModuleManager(ctx);
  });

  afterEach(() => {
    manager.dispose();
  });

  it('should activate a registered module', async () => {
    const mod = createMockModule('alpha');
    manager.register(mod);

    await manager.activate('alpha');

    expect(manager.isActivated('alpha')).toBe(true);
    expect(mod.activate).toHaveBeenCalledTimes(1);
    expect(mod.activate).toHaveBeenCalledWith(ctx);
  });

  it('should not activate twice', async () => {
    const mod = createMockModule('once');
    manager.register(mod);

    await manager.activate('once');
    await manager.activate('once');

    expect(mod.activate).toHaveBeenCalledTimes(1);
  });

  it('should activate dependencies first', async () => {
    const child = createMockModule('child');
    const parent = createMockModule('parent', ['child']);
    manager.register(parent);
    manager.register(child);

    await manager.activate('parent');

    expect(activateOrder(parent, child)).toEqual(['child', 'parent']);
  });

  it('should detect circular dependencies gracefully', async () => {
    const a = createMockModule('a', ['b']);
    const b = createMockModule('b', ['a']);
    manager.register(a);
    manager.register(b);

    await manager.activate('a');

    expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('Circular dependency'));
    expect(manager.isActivated('a')).toBe(true);
    expect(manager.isActivated('b')).toBe(true);
  });

  it('should handle missing module gracefully', async () => {
    await manager.activate('ghost');

    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('ghost'));
    expect(manager.isActivated('ghost')).toBe(false);
  });

  it('should deactivate in reverse order', async () => {
    const core = createMockModule('core');
    const ui = createMockModule('ui');
    manager.register(core);
    manager.register(ui);

    await manager.activateAll();
    await manager.deactivateAll();

    expect(deactivateOrder(ui, core)).toEqual(['ui', 'core']);
  });
});

describe('HarmonyRegistry', () => {
  let registry: HarmonyRegistry;

  beforeEach(() => {
    registry = new HarmonyRegistry();
  });

  afterEach(() => {
    registry.dispose();
  });

  it('should register and retrieve contributors', () => {
    const d = registry.register(ExtensionPoints.SNIPPET, { id: 's1', body: 'x' } as any);
    expect(registry.get(ExtensionPoints.SNIPPET, 's1')).toEqual({ id: 's1', body: 'x' });
    d.dispose();
  });

  it('should dispose individual registrations', () => {
    const d = registry.register(ExtensionPoints.SCHEMA, { id: 'schema-a' } as any);
    expect(registry.has(ExtensionPoints.SCHEMA, 'schema-a')).toBe(true);

    d.dispose();

    expect(registry.get(ExtensionPoints.SCHEMA, 'schema-a')).toBeUndefined();
    expect(registry.has(ExtensionPoints.SCHEMA, 'schema-a')).toBe(false);
  });

  it('should return empty array for unknown extension point', () => {
    expect(registry.getAll('harmony.unknown-point')).toEqual([]);
  });

  it('should support has() check', () => {
    registry.register(ExtensionPoints.DEVICE, { id: 'dev-1' } as any);
    expect(registry.has(ExtensionPoints.DEVICE, 'dev-1')).toBe(true);
    expect(registry.has(ExtensionPoints.DEVICE, 'missing')).toBe(false);
  });

  it('getAll should work after dispose returns empty', () => {
    registry.register(ExtensionPoints.TEMPLATE, { id: 't1' } as any);
    expect(registry.getAll(ExtensionPoints.TEMPLATE).length).toBeGreaterThan(0);

    registry.dispose();

    expect(registry.getAll(ExtensionPoints.TEMPLATE)).toEqual([]);
  });
});

/** Ensures `parent.activate` runs after `child.activate` by comparing mock call indices. */
function activateOrder(parent: HarmonyModule, child: HarmonyModule): string[] {
  const p = parent.activate as ReturnType<typeof vi.fn>;
  const c = child.activate as ReturnType<typeof vi.fn>;
  const order: Array<{ id: string; index: number }> = [];
  if (c.mock.invocationCallOrder[0] !== undefined) {
    order.push({ id: child.id, index: c.mock.invocationCallOrder[0] });
  }
  if (p.mock.invocationCallOrder[0] !== undefined) {
    order.push({ id: parent.id, index: p.mock.invocationCallOrder[0] });
  }
  order.sort((x, y) => x.index - y.index);
  return order.map((o) => o.id);
}

function deactivateOrder(first: HarmonyModule, second: HarmonyModule): string[] {
  const a = first.deactivate as ReturnType<typeof vi.fn>;
  const b = second.deactivate as ReturnType<typeof vi.fn>;
  const order: Array<{ id: string; index: number }> = [];
  if (a.mock.invocationCallOrder[0] !== undefined) {
    order.push({ id: first.id, index: a.mock.invocationCallOrder[0] });
  }
  if (b.mock.invocationCallOrder[0] !== undefined) {
    order.push({ id: second.id, index: b.mock.invocationCallOrder[0] });
  }
  order.sort((x, y) => x.index - y.index);
  return order.map((o) => o.id);
}
