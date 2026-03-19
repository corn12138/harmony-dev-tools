import * as http from 'http';
import * as https from 'https';

export interface DevToolsTarget {
  id?: string;
  type: string;
  title: string;
  url: string;
  description?: string;
  devtoolsFrontendUrl?: string;
  webSocketDebuggerUrl?: string;
}

export function parseDevToolsTargets(text: string): DevToolsTarget[] {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter((item) => typeof item.type === 'string')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : undefined,
        type: String(item.type),
        title: typeof item.title === 'string' ? item.title : '',
        url: typeof item.url === 'string' ? item.url : '',
        description: typeof item.description === 'string' ? item.description : undefined,
        devtoolsFrontendUrl: typeof item.devtoolsFrontendUrl === 'string' ? item.devtoolsFrontendUrl : undefined,
        webSocketDebuggerUrl: typeof item.webSocketDebuggerUrl === 'string' ? item.webSocketDebuggerUrl : undefined,
      }));
  } catch {
    return [];
  }
}

export async function fetchDevToolsTargets(baseUrl: string, timeout = 1500): Promise<DevToolsTarget[]> {
  const endpoints = ['/json/list', '/json'];
  for (const pathname of endpoints) {
    try {
      const payload = await requestText(new URL(pathname, ensureBaseUrl(baseUrl)).toString(), timeout);
      const targets = parseDevToolsTargets(payload);
      if (targets.length > 0) {
        return targets;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export function extractInspectablePageTargets(targets: DevToolsTarget[]): DevToolsTarget[] {
  return targets.filter((target) => target.type === 'page' || target.type === 'webview');
}

export function pickSuggestedInspectableTarget(
  targets: DevToolsTarget[],
  preferredUrls: string[] = [],
): DevToolsTarget | undefined {
  const pages = extractInspectablePageTargets(targets);
  if (pages.length === 0) {
    return undefined;
  }

  const hinted = pickTargetByPreferredUrls(pages, preferredUrls);
  if (hinted) {
    return hinted;
  }

  const meaningful = pages.filter((target) => target.url.trim().length > 0 && target.url !== 'about:blank');
  if (meaningful.length === 1) {
    return meaningful[0];
  }

  if (pages.length === 1) {
    return pages[0];
  }

  return undefined;
}

export function buildDevToolsFrontendUrl(baseUrl: string, target: DevToolsTarget): string | undefined {
  const endpoint = new URL(ensureBaseUrl(baseUrl));
  if (target.devtoolsFrontendUrl) {
    const frontendUrl = new URL(target.devtoolsFrontendUrl, endpoint);
    const wsValue = frontendUrl.searchParams.get('ws');
    if (wsValue) {
      frontendUrl.searchParams.set('ws', `${endpoint.host}/${extractDebuggerPath(wsValue)}`);
    }
    return frontendUrl.toString();
  }

  if (!target.webSocketDebuggerUrl) {
    return undefined;
  }

  const wsUrl = new URL(target.webSocketDebuggerUrl);
  const path = wsUrl.pathname.replace(/^\//, '');
  return new URL(`/devtools/inspector.html?ws=${encodeURIComponent(`${endpoint.host}/${path}`)}`, endpoint).toString();
}

function ensureBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function pickTargetByPreferredUrls(
  targets: DevToolsTarget[],
  preferredUrls: string[],
): DevToolsTarget | undefined {
  if (preferredUrls.length === 0 || targets.length === 0) {
    return undefined;
  }

  let bestScore = 0;
  let bestTarget: DevToolsTarget | undefined;
  let bestCount = 0;

  for (const target of targets) {
    const score = scoreTargetAgainstHints(target, preferredUrls);
    if (score <= 0) {
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
      bestCount = 1;
      continue;
    }

    if (score === bestScore) {
      bestCount++;
    }
  }

  return bestScore >= 75 && bestCount === 1 ? bestTarget : undefined;
}

function scoreTargetAgainstHints(target: DevToolsTarget, preferredUrls: string[]): number {
  return preferredUrls.reduce((best, hint) => Math.max(best, scoreTargetAgainstHint(target, hint)), 0);
}

function scoreTargetAgainstHint(target: DevToolsTarget, hint: string): number {
  const targetUrl = safeParseUrl(target.url);
  const hintUrl = safeParseUrl(hint);

  if (targetUrl && hintUrl) {
    if (targetUrl.href === hintUrl.href) {
      return 100;
    }
    if (targetUrl.origin === hintUrl.origin && targetUrl.pathname === hintUrl.pathname) {
      return 90;
    }
    if (targetUrl.origin === hintUrl.origin && pathsLikelyMatch(targetUrl.pathname, hintUrl.pathname)) {
      return 75;
    }
    if (targetUrl.hostname === hintUrl.hostname) {
      return 50;
    }
  }

  const targetLabel = `${target.title} ${target.url}`.toLowerCase();
  const tail = extractLastPathSegment(hint).toLowerCase();
  if (tail && targetLabel.includes(tail)) {
    return 40;
  }

  return 0;
}

function extractDebuggerPath(value: string): string {
  if (value.startsWith('ws://') || value.startsWith('wss://')) {
    const wsUrl = new URL(value);
    return wsUrl.pathname.replace(/^\//, '');
  }

  const slashIndex = value.indexOf('/');
  return slashIndex >= 0 ? value.slice(slashIndex + 1) : value;
}

function safeParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function pathsLikelyMatch(targetPathname: string, hintPathname: string): boolean {
  const targetPath = normalizePath(targetPathname);
  const hintPath = normalizePath(hintPathname);
  return targetPath.startsWith(`${hintPath}/`);
}

function extractLastPathSegment(value: string): string {
  const parsed = safeParseUrl(value);
  if (parsed) {
    const normalized = normalizePath(parsed.pathname);
    const segment = normalized.slice(normalized.lastIndexOf('/') + 1);
    return segment || parsed.hostname;
  }

  return value;
}

function requestText(urlString: string, timeout: number): Promise<string> {
  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise<string>((resolve, reject) => {
    const request = transport.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        reject(new Error(`DevTools target request failed with status ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve(body);
      });
    });

    request.setTimeout(timeout, () => {
      request.destroy(new Error('DevTools target request timed out'));
    });
    request.on('error', reject);
  });
}
