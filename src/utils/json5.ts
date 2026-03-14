function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractJson5StringValue(text: string, key: string): string | undefined {
  const keyPattern = `(?:["']${escapeRegExp(key)}["']|\\b${escapeRegExp(key)}\\b)`;
  const match = text.match(new RegExp(
    `${keyPattern}\\s*:\\s*(?:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)')`
  ));

  return match?.[1] ?? match?.[2] ?? undefined;
}

export function hasJson5StringValue(text: string, key: string, expected: string): boolean {
  return extractJson5StringValue(text, key) === expected;
}
