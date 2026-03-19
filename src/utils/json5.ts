function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Json5StringValueMatch {
  value: string;
  valueStart: number;
  valueEnd: number;
  quote: '"' | '\'';
}

export function extractJson5StringValue(text: string, key: string): string | undefined {
  return findJson5StringValue(text, key)?.value;
}

export function hasJson5StringValue(text: string, key: string, expected: string): boolean {
  return extractJson5StringValue(text, key) === expected;
}

export function findJson5StringValue(text: string, key: string): Json5StringValueMatch | undefined {
  const keyPattern = `(?:["']${escapeRegExp(key)}["']|\\b${escapeRegExp(key)}\\b)`;
  const regex = new RegExp(
    `${keyPattern}\\s*:\\s*(?:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)')`
  );
  const match = regex.exec(text);
  if (!match || match.index === undefined) {
    return undefined;
  }

  const value = match[1] ?? match[2];
  if (value === undefined) {
    return undefined;
  }

  const quote = match[1] !== undefined ? '"' : '\'';
  const colonIndex = match[0].indexOf(':');
  const quoteIndex = match[0].indexOf(quote, colonIndex);
  if (quoteIndex < 0) {
    return undefined;
  }

  const valueStart = match.index + quoteIndex + 1;
  return {
    value,
    valueStart,
    valueEnd: valueStart + value.length,
    quote,
  };
}
