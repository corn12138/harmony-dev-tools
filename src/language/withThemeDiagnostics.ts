export interface WithThemeUsage {
  line: number;
  colStart: number;
  colEnd: number;
}

export interface CustomThemeShellUsage {
  className: string;
  line: number;
  colStart: number;
  colEnd: number;
}

export function hasComponentV2Decorator(text: string): boolean {
  const lines = text.split('\n');
  return lines.some((line) => stripLineComment(line).includes('@ComponentV2'));
}

export function findWithThemeUsages(text: string): WithThemeUsage[] {
  return findNamedUsages(text, /\bWithTheme\s*\(/, 'WithTheme');
}

export function findWithThemeColorModeUsages(text: string): WithThemeUsage[] {
  return extractCallArgumentBlocks(text, /\bWithTheme\s*\(/, 'WithTheme')
    .filter((block) => /\bcolorMode\s*:/.test(block.args))
    .map((block) => block.usage);
}

export function findOnWillApplyThemeUsages(text: string): WithThemeUsage[] {
  return findNamedUsages(text, /\bonWillApplyTheme\s*\(/, 'onWillApplyTheme');
}

export function findThemeControlSetDefaultThemeUsages(text: string): WithThemeUsage[] {
  return findNamedUsages(text, /\bThemeControl\.setDefaultTheme\s*\(/, 'ThemeControl.setDefaultTheme');
}

export function findCustomThemeShellUsages(text: string): CustomThemeShellUsage[] {
  const classes = collectCustomThemeClasses(text);
  if (classes.length === 0) {
    return [];
  }

  const usages: CustomThemeShellUsage[] = [];
  for (const customThemeClass of classes) {
    if (customThemeClass.hasColorsOverride) {
      continue;
    }

    const usagePattern = new RegExp(`\\bnew\\s+${escapeRegex(customThemeClass.name)}\\s*\\(`);
    if (!usagePattern.test(text)) {
      continue;
    }

    usages.push({
      className: customThemeClass.name,
      line: customThemeClass.line,
      colStart: customThemeClass.colStart,
      colEnd: customThemeClass.colEnd,
    });
  }

  return usages;
}

function findNamedUsages(text: string, pattern: RegExp, label: string): WithThemeUsage[] {
  const lines = text.split('\n');
  const usages: WithThemeUsage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = stripLineComment(lines[i]);
    const match = line.match(pattern);
    if (!match || match.index === undefined) {
      continue;
    }

    usages.push({
      line: i,
      colStart: match.index,
      colEnd: match.index + label.length,
    });
  }

  return usages;
}

function extractCallArgumentBlocks(
  text: string,
  pattern: RegExp,
  label: string,
): Array<{ usage: WithThemeUsage; args: string }> {
  const blocks: Array<{ usage: WithThemeUsage; args: string }> = [];
  const globalPattern = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  let match: RegExpExecArray | null;

  while ((match = globalPattern.exec(text)) !== null) {
    if (match.index === undefined) {
      continue;
    }

    const openParenIndex = text.indexOf('(', match.index);
    if (openParenIndex < 0) {
      continue;
    }

    const closeParenIndex = findMatchingParen(text, openParenIndex);
    if (closeParenIndex < 0) {
      continue;
    }

    const position = indexToLineCol(text, match.index);
    blocks.push({
      usage: {
        line: position.line,
        colStart: position.col,
        colEnd: position.col + label.length,
      },
      args: text.slice(openParenIndex + 1, closeParenIndex),
    });

    globalPattern.lastIndex = closeParenIndex + 1;
  }

  return blocks;
}

function stripLineComment(line: string): string {
  const lineCommentIndex = line.indexOf('//');
  return lineCommentIndex >= 0 ? line.slice(0, lineCommentIndex) : line;
}

function collectCustomThemeClasses(text: string): Array<{
  name: string;
  line: number;
  colStart: number;
  colEnd: number;
  hasColorsOverride: boolean;
}> {
  const classes: Array<{
    name: string;
    line: number;
    colStart: number;
    colEnd: number;
    hasColorsOverride: boolean;
  }> = [];

  const classPattern = /\bclass\s+([A-Za-z_]\w*)\s+implements\s+CustomTheme\b/g;
  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(text)) !== null) {
    const className = match[1];
    const braceIndex = text.indexOf('{', match.index);
    if (braceIndex < 0) {
      continue;
    }

    const bodyEnd = findMatchingBrace(text, braceIndex);
    if (bodyEnd < 0) {
      continue;
    }

    const body = text.slice(braceIndex + 1, bodyEnd);
    const position = indexToLineCol(text, match.index + match[0].indexOf(className));
    classes.push({
      name: className,
      line: position.line,
      colStart: position.col,
      colEnd: position.col + className.length,
      hasColorsOverride: /\bcolors\s*[:=]/.test(body) || /\bthis\.colors\s*=/.test(body),
    });

    classPattern.lastIndex = bodyEnd + 1;
  }

  return classes;
}

function findMatchingBrace(text: string, startIndex: number): number {
  let depth = 0;
  let activeQuote: '"' | '\'' | '`' | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (activeQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      activeQuote = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findMatchingParen(text: string, startIndex: number): number {
  let depth = 0;
  let activeQuote: '"' | '\'' | '`' | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (activeQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      activeQuote = ch;
      continue;
    }

    if (ch === '(') {
      depth++;
      continue;
    }

    if (ch === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function indexToLineCol(text: string, index: number): { line: number; col: number } {
  let line = 0;
  let lineStart = 0;

  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }

  return {
    line,
    col: index - lineStart,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
