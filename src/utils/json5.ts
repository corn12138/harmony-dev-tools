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

function* json5Tokens(text: string) {
  // Consume strings and comments as whole tokens so examples inside them are skipped.
  const tokens = /\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\(?:\r\n|[\s\S])|[^"\\])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\])*'|[$\w\p{ID_Continue}\u200c\u200d]+|[^\s]/gu;
  for (const match of text.matchAll(tokens)) {
    if (!match[0].startsWith('//') && !match[0].startsWith('/*')) yield match;
  }
}

export function findRootObjectFieldStart(text: string, key: string): number | undefined {
  let depth = 0;
  let previous = '';
  let beforePrevious = '';
  for (const match of json5Tokens(text)) {
    const token = match[0];
    if (depth === 1 && previous === ':' && token === '{' &&
        [key, `"${key}"`, `'${key}'`].includes(beforePrevious)) {
      return match.index;
    }
    if (token === '{' || token === '[') depth++;
    if (token === '}' || token === ']') depth--;
    beforePrevious = previous;
    previous = token;
  }
  return undefined;
}

export function findJson5StringValue(text: string, key: string): Json5StringValueMatch | undefined {
  let state: 'key' | 'colon' | 'value' = 'key';

  for (const match of json5Tokens(text)) {
    const token = match[0];

    const quote = token[0];
    const quoted = (quote === '"' || quote === "'") && token.length >= 2;
    if (state === 'value' && quoted) {
      const valueStart = match.index + 1;
      return {
        value: token.slice(1, -1),
        valueStart,
        valueEnd: match.index + token.length - 1,
        quote,
      };
    }
    if (state === 'colon' && token === ':') {
      state = 'value';
      continue;
    }
    state = (quoted ? token.slice(1, -1) : token) === key ? 'colon' : 'key';
  }
  return undefined;
}
