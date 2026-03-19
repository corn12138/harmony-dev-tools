export interface WebDebuggingAccessConfig {
  enabled: boolean;
  port?: number;
}

const WEB_COMPONENT_PATTERN = /\bWeb\s*\(|WebviewController|@kit\.ArkWeb|@ohos\.web\.webview/;

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
