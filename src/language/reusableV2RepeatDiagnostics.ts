interface ReusableV2Usage {
  componentName: string;
  line: number;
  colStart: number;
  colEnd: number;
}

interface TemplateBlock {
  content: string;
  contentStart: number;
}

const REUSABLE_V2_LOOKAHEAD_LINES = 8;

export function findReusableV2RepeatTemplateUsages(text: string): ReusableV2Usage[] {
  const componentNames = collectReusableV2ComponentNames(text);
  if (componentNames.size === 0) {
    return [];
  }

  const templateBlocks = extractRepeatTemplateBlocks(text);
  if (templateBlocks.length === 0) {
    return [];
  }

  const lines = text.split('\n');
  const usages: ReusableV2Usage[] = [];
  const seen = new Set<string>();

  for (const block of templateBlocks) {
    for (const componentName of componentNames) {
      const usagePattern = new RegExp(`\\b${escapeRegex(componentName)}\\s*\\(`, 'g');
      let match: RegExpExecArray | null;

      while ((match = usagePattern.exec(block.content)) !== null) {
        const absoluteIndex = block.contentStart + match.index;
        const position = indexToLineCol(text, absoluteIndex);
        const lineText = lines[position.line] ?? '';

        if (isCommentedSegment(lineText, position.col)) {
          continue;
        }

        const key = `${componentName}:${position.line}:${position.col}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        usages.push({
          componentName,
          line: position.line,
          colStart: position.col,
          colEnd: position.col + componentName.length,
        });
      }
    }
  }

  return usages;
}

function collectReusableV2ComponentNames(text: string): Set<string> {
  const lines = text.split('\n');
  const componentNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = stripLineComment(lines[i]);
    if (!line.includes('@ReusableV2')) {
      continue;
    }

    for (let j = i; j < Math.min(lines.length, i + REUSABLE_V2_LOOKAHEAD_LINES); j++) {
      const candidate = stripLineComment(lines[j]).trim();
      if (!candidate) {
        continue;
      }

      const structMatch = candidate.match(/\bstruct\s+([A-Za-z_]\w*)\b/);
      if (structMatch) {
        componentNames.add(structMatch[1]);
        break;
      }
    }
  }

  return componentNames;
}

function extractRepeatTemplateBlocks(text: string): TemplateBlock[] {
  const blocks: TemplateBlock[] = [];
  const templatePattern = /\.template\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = templatePattern.exec(text)) !== null) {
    const openParenIndex = text.indexOf('(', match.index);
    if (openParenIndex < 0) {
      continue;
    }

    const closeParenIndex = findMatchingParen(text, openParenIndex);
    if (closeParenIndex < 0) {
      continue;
    }

    blocks.push({
      content: text.slice(openParenIndex + 1, closeParenIndex),
      contentStart: openParenIndex + 1,
    });

    templatePattern.lastIndex = closeParenIndex + 1;
  }

  return blocks;
}

function findMatchingParen(text: string, startIndex: number): number {
  let depth = 0;
  let activeQuote: '"' | '\'' | '`' | null = null;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

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

function isCommentedSegment(line: string, column: number): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    return true;
  }

  const lineCommentIndex = line.indexOf('//');
  return lineCommentIndex >= 0 && lineCommentIndex < column;
}

function stripLineComment(line: string): string {
  const lineCommentIndex = line.indexOf('//');
  return lineCommentIndex >= 0 ? line.slice(0, lineCommentIndex) : line;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
