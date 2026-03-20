export interface WebDebuggingAccessConfig {
  enabled: boolean;
  port?: number;
}

const WEB_COMPONENT_PATTERN = /\bWeb\s*\(|WebviewController|@kit\.ArkWeb|@ohos\.web\.webview/;
const WEB_URL_PATTERNS = [
  // Keep the scan bounded so it stays cheap on large files, while still tolerating
  // common multiline Web(...) prop blocks before `src`.
  /\bWeb\s*\(\s*\{[\s\S]{0,2000}?\bsrc\s*:\s*['"]([^'"]+)['"]/g,
  /\bloadUrl\s*\(\s*['"]([^'"]+)['"]/g,
] as const;

export function hasWebViewUsage(text: string): boolean {
  return WEB_COMPONENT_PATTERN.test(text);
}

export function parseWebDebuggingAccess(text: string): WebDebuggingAccessConfig | undefined {
  const match = text.match(/\bsetWebDebuggingAccess\s*\(\s*true(?:\s*,\s*(\d+))?\s*\)/);
  if (!match) {
    return undefined;
  }

  return {
    enabled: true,
    port: match[1] ? Number.parseInt(match[1], 10) : undefined,
  };
}

export function extractWebViewUrlHints(text: string): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();

  for (const pattern of WEB_URL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1]?.trim();
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      hints.push(candidate);
    }
  }

  return hints;
}
