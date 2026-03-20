import { describe, expect, it } from 'vitest';
import { HarmonyEventBus } from '../src/core/eventBus';
import { summarizeTrackedFiles, type HarmonyTrackedFile } from '../src/project/fileTracker';
import { parseWebViewDevToolsSockets } from '../src/webview/devtools';
import { parseDevToolsTargets, pickSuggestedInspectableTarget } from '../src/webview/targets';

describe('stress regressions', () => {
  it('keeps DevTools target parsing and hint matching stable on large payloads', () => {
    const specialTarget = {
      id: 'page-special',
      type: 'page',
      title: 'Checkout Complete',
      url: 'https://example.com/orders/final',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/page-special',
    };

    const payload = Array.from({ length: 5000 }, (_, index) => {
      if (index === 4999) {
        return specialTarget;
      }

      if (index % 17 === 0) {
        return { title: `broken-${index}` };
      }

      if (index % 13 === 0) {
        return {
          id: `worker-${index}`,
          type: 'service_worker',
          title: '',
          url: '',
        };
      }

      return {
        id: `page-${index}`,
        type: 'page',
        title: `Page ${index}`,
        url: `https://example.com/orders/${index}`,
        devtoolsFrontendUrl: `/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/page-${index}`,
      };
    });

    const parsed = parseDevToolsTargets(JSON.stringify(payload));

    expect(parsed).toHaveLength(
      payload.filter((item) => typeof (item as Record<string, unknown>).type === 'string').length,
    );
    expect(pickSuggestedInspectableTarget(parsed, [specialTarget.url])).toMatchObject(specialTarget);
  });

  it('dedupes repeated WebView DevTools sockets in noisy shell output', () => {
    const stdout = Array.from(
      { length: 4000 },
      (_, index) => `00000000: 00000002 00000000 00010000 0001 01 ${12000 + index} @webview_devtools_remote_${index % 120}`,
    ).join('\n');

    const sockets = parseWebViewDevToolsSockets(stdout);

    expect(sockets).toHaveLength(120);
    expect(sockets[0]).toBe('webview_devtools_remote_0');
    expect(sockets[119]).toBe('webview_devtools_remote_119');
  });

  it('keeps tracked file summaries correct with thousands of duplicate paths', () => {
    const root = '/workspace/demo';
    const files: HarmonyTrackedFile[] = [];

    files.push({ path: `${root}/build-profile.json5`, kind: 'buildProfile' });
    files.push({ path: `${root}\\build-profile.json5`, kind: 'buildProfile' });

    for (const moduleName of ['entry', 'featureA', 'featureB']) {
      files.push({
        path: `${root}/${moduleName}/src/main/module.json5`,
        kind: 'moduleJson',
        module: moduleName,
      });
      files.push({
        path: `${root}\\${moduleName}\\src\\main\\module.json5`,
        kind: 'moduleJson',
        module: moduleName,
      });

      for (let index = 0; index < 250; index += 1) {
        const arktsPath = `${root}/${moduleName}/src/main/ets/pages/Page${index}.ets`;
        const resourcePath = `${root}/${moduleName}/src/main/resources/base/element/string${index}.json`;

        files.push({ path: arktsPath, kind: 'arkts', module: moduleName });
        files.push({ path: arktsPath.replace(/\//g, '\\'), kind: 'arkts', module: moduleName });
        files.push({ path: resourcePath, kind: 'resource', module: moduleName });
        files.push({ path: resourcePath.replace(/\//g, '\\'), kind: 'resource', module: moduleName });
      }
    }

    const summary = summarizeTrackedFiles(`${root}/`, files);

    expect(summary.modules).toEqual(['entry', 'featureA', 'featureB']);
    expect(summary.files).toHaveLength(1504);
    expect(summary.counts.buildProfile).toBe(1);
    expect(summary.counts.moduleJson).toBe(3);
    expect(summary.counts.arkts).toBe(750);
    expect(summary.counts.resource).toBe(750);
  });

  it('delivers high-volume event traffic exactly once per active subscriber', () => {
    const bus = new HarmonyEventBus();
    const counts = Array.from({ length: 64 }, () => 0);
    const subscriptions = counts.map((_, index) =>
      bus.on('project:fileChanged', () => {
        counts[index] += 1;
      }),
    );

    for (let index = 0; index < 1000; index += 1) {
      bus.emit('project:fileChanged', {
        file: `/workspace/demo/entry/src/main/ets/pages/Page${index}.ets`,
        kind: 'arkts',
        change: 'changed',
        module: 'entry',
      });
    }

    expect(counts.every((count) => count === 1000)).toBe(true);

    subscriptions.slice(0, 32).forEach((subscription) => subscription.dispose());

    for (let index = 0; index < 200; index += 1) {
      bus.emit('project:fileChanged', {
        file: `/workspace/demo/entry/src/main/ets/pages/Page${index}.ets`,
        kind: 'arkts',
        change: 'created',
        module: 'entry',
      });
    }

    expect(counts.slice(0, 32).every((count) => count === 1000)).toBe(true);
    expect(counts.slice(32).every((count) => count === 1200)).toBe(true);

    bus.dispose();
    bus.emit('project:fileChanged', {
      file: '/workspace/demo/entry/src/main/ets/pages/Final.ets',
      kind: 'arkts',
      change: 'deleted',
      module: 'entry',
    });

    expect(counts.slice(32).every((count) => count === 1200)).toBe(true);
  });
});
