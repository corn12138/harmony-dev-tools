import { describe, expect, it } from 'vitest';
import {
  buildDevToolsFrontendUrl,
  extractInspectablePageTargets,
  parseDevToolsTargets,
  pickSuggestedInspectableTarget,
} from '../src/webview/targets';

describe('webview targets', () => {
  it('should parse devtools target payloads', () => {
    const payload = JSON.stringify([
      {
        id: 'page-1',
        type: 'page',
        title: 'Home',
        url: 'https://example.com/home',
        devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/page-1',
      },
      {
        type: 'service_worker',
        title: '',
        url: '',
      },
    ]);

    expect(parseDevToolsTargets(payload)).toEqual([
      {
        id: 'page-1',
        type: 'page',
        title: 'Home',
        url: 'https://example.com/home',
        devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/page-1',
        description: undefined,
        webSocketDebuggerUrl: undefined,
      },
      {
        id: undefined,
        type: 'service_worker',
        title: '',
        url: '',
        description: undefined,
        devtoolsFrontendUrl: undefined,
        webSocketDebuggerUrl: undefined,
      },
    ]);
  });

  it('should extract inspectable page-like targets only', () => {
    const targets = [
      { type: 'page', title: 'Page A', url: 'https://a.example' },
      { type: 'webview', title: 'Page B', url: 'https://b.example' },
      { type: 'service_worker', title: '', url: '' },
    ];

    expect(extractInspectablePageTargets(targets)).toEqual([
      { type: 'page', title: 'Page A', url: 'https://a.example' },
      { type: 'webview', title: 'Page B', url: 'https://b.example' },
    ]);
  });

  it('should pick a single meaningful page target automatically', () => {
    const targets = [
      { type: 'page', title: '', url: 'about:blank' },
      { type: 'page', title: 'Checkout', url: 'https://example.com/checkout' },
    ];

    expect(pickSuggestedInspectableTarget(targets)).toEqual(
      { type: 'page', title: 'Checkout', url: 'https://example.com/checkout' },
    );
  });

  it('should not auto-pick when multiple meaningful pages exist', () => {
    const targets = [
      { type: 'page', title: 'Home', url: 'https://example.com/home' },
      { type: 'page', title: 'Checkout', url: 'https://example.com/checkout' },
    ];

    expect(pickSuggestedInspectableTarget(targets)).toBeUndefined();
  });

  it('should build frontend URLs for IPv4 and IPv6 endpoints', () => {
    const target = {
      type: 'page',
      title: 'Home',
      url: 'https://example.com/home',
      devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/page-1',
    };

    expect(buildDevToolsFrontendUrl('http://127.0.0.1:9222', target)).toBe(
      'http://127.0.0.1:9222/devtools/inspector.html?ws=127.0.0.1%3A9222%2Fdevtools%2Fpage%2Fpage-1',
    );
    expect(buildDevToolsFrontendUrl('http://[2408:8711:2222:3333::66]:8888', target)).toBe(
      'http://[2408:8711:2222:3333::66]:8888/devtools/inspector.html?ws=%5B2408%3A8711%3A2222%3A3333%3A%3A66%5D%3A8888%2Fdevtools%2Fpage%2Fpage-1',
    );
  });
});
