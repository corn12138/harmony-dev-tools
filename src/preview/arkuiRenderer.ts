/**
 * ArkUI-to-HTML renderer.
 * Parses ArkTS build() methods into a simple AST, then renders to HTML/CSS
 * that approximates the ArkUI layout.
 */

import { getComponentByName, apiLabel } from '../utils/metadata';

export interface ArkNode {
  type: string;
  params: string;
  styles: Record<string, string>;
  children: ArkNode[];
}

/** Parse an ArkTS source file's build() method into an ArkNode tree. */
export function parseArkUI(source: string): ArkNode | null {
  const buildMatch = source.match(/build\s*\(\s*\)\s*\{/);
  if (!buildMatch || buildMatch.index === undefined) return null;

  const startIdx = buildMatch.index + buildMatch[0].length;
  const buildBody = extractBalancedBlock(source, startIdx - 1);
  if (!buildBody) return null;

  const inner = buildBody.slice(1, -1).trim();
  const children = parseChildren(inner);
  if (children.length === 0) return null;

  return children.length === 1 ? children[0] : {
    type: 'Column',
    params: '',
    styles: {},
    children,
  };
}

function parseChildren(code: string): ArkNode[] {
  const nodes: ArkNode[] = [];
  let i = 0;

  while (i < code.length) {
    // Skip whitespace and comments
    while (i < code.length && /\s/.test(code[i])) i++;
    if (i >= code.length) break;

    // Skip line comments
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    // Skip control flow: if/else, ForEach, LazyForEach
    if (code.substring(i).match(/^(if|else)\s*[\({]/)) {
      const block = skipControlFlow(code, i);
      i = block;
      continue;
    }

    if (code.substring(i).match(/^(ForEach|LazyForEach|Repeat)\s*\(/)) {
      i = skipFunctionCall(code, i);
      continue;
    }

    // Match component call: ComponentName(params) { children } .styles()
    const compMatch = code.substring(i).match(/^([A-Z]\w*)\s*\(/);
    if (compMatch) {
      const name = compMatch[1];
      const paramStart = i + compMatch[0].length;
      const paramEnd = findClosingParen(code, paramStart - 1);
      const params = code.substring(paramStart, paramEnd).trim();
      i = paramEnd + 1;

      // Skip whitespace
      while (i < code.length && /\s/.test(code[i])) i++;

      // Check for children block { ... }
      let children: ArkNode[] = [];
      if (i < code.length && code[i] === '{') {
        const block = extractBalancedBlock(code, i);
        if (block) {
          children = parseChildren(block.slice(1, -1));
          i += block.length;
        }
      }

      // Parse chained style methods: .width(...).height(...)
      const styles: Record<string, string> = {};
      while (i < code.length) {
        while (i < code.length && /\s/.test(code[i])) i++;
        if (code[i] === '.' && code[i + 1] !== '.') {
          const styleMatch = code.substring(i).match(/^\.(\w+)\s*\(/);
          if (styleMatch) {
            const styleName = styleMatch[1];
            const sParamStart = i + styleMatch[0].length;
            const sParamEnd = findClosingParen(code, sParamStart - 1);
            const sValue = code.substring(sParamStart, sParamEnd).trim();
            styles[styleName] = cleanStyleValue(sValue);
            i = sParamEnd + 1;
            continue;
          }
        }
        break;
      }

      nodes.push({ type: name, params, styles, children });
      continue;
    }

    // Skip this. expressions, function calls, etc.
    i = skipToNext(code, i);
  }

  return nodes;
}

function cleanStyleValue(val: string): string {
  // Remove quotes, $$, $r() wrappers
  return val
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/^\$r\([^)]+\)$/, '#resource#')
    .replace(/^Color\.(\w+)$/, (_, c) => colorMap[c] || c)
    .replace(/^FontWeight\.(\w+)$/, (_, w) => w.toLowerCase())
    .replace(/^FlexAlign\.(\w+)$/, (_, a) => flexAlignMap[a] || a)
    .replace(/^HorizontalAlign\.(\w+)$/, (_, a) => horizontalAlignMap[a] || a)
    .replace(/^Alignment\.(\w+)$/, (_, a) => a.toLowerCase());
}

const colorMap: Record<string, string> = {
  Red: '#FF0000', Green: '#00FF00', Blue: '#0000FF', Black: '#000000',
  White: '#FFFFFF', Gray: '#808080', Orange: '#FFA500', Yellow: '#FFFF00',
  Pink: '#FFC0CB', Transparent: 'transparent',
};

const flexAlignMap: Record<string, string> = {
  Start: 'flex-start', End: 'flex-end', Center: 'center',
  SpaceBetween: 'space-between', SpaceAround: 'space-around', SpaceEvenly: 'space-evenly',
};

const horizontalAlignMap: Record<string, string> = {
  Start: 'flex-start', End: 'flex-end', Center: 'center',
};

/** Render an ArkNode tree to HTML. */
export function renderToHtml(node: ArkNode, depth: number = 0): string {
  const unsupported = checkPreviewSupport(node.type);
  if (unsupported) {
    return renderUnsupported(node, unsupported, depth);
  }

  const css = buildCss(node);
  const label = `<div class="ark-label">${esc(node.type)}</div>`;

  if (isLeafComponent(node.type)) {
    return renderLeaf(node, css, depth);
  }

  const childrenHtml = node.children.map(c => renderToHtml(c, depth + 1)).join('\n');
  return `<div class="ark-node" style="${css}" data-type="${esc(node.type)}">
  ${label}
  ${childrenHtml}
</div>`;
}

function renderLeaf(node: ArkNode, css: string, _depth: number): string {
  const label = `<div class="ark-label">${esc(node.type)}</div>`;
  switch (node.type) {
    case 'Text': {
      const content = extractStringParam(node.params) || '{text}';
      return `<div class="ark-node ark-text" style="${css}">${label}<span>${esc(content)}</span></div>`;
    }
    case 'Button': {
      const text = extractStringParam(node.params) || 'Button';
      return `<div class="ark-node" style="${css}">${label}<button class="ark-btn">${esc(text)}</button></div>`;
    }
    case 'Image': {
      return `<div class="ark-node ark-image" style="${css}">${label}<div class="ark-img-placeholder">IMG</div></div>`;
    }
    case 'TextInput': {
      const ph = extractObjectField(node.params, 'placeholder') || 'Input';
      return `<div class="ark-node" style="${css}">${label}<input class="ark-input" placeholder="${esc(ph)}" readonly /></div>`;
    }
    case 'TextArea': {
      const ph = extractObjectField(node.params, 'placeholder') || 'TextArea';
      return `<div class="ark-node" style="${css}">${label}<textarea class="ark-textarea" placeholder="${esc(ph)}" readonly></textarea></div>`;
    }
    case 'Toggle':
      return `<div class="ark-node" style="${css}">${label}<label class="ark-toggle"><input type="checkbox" /><span></span></label></div>`;
    case 'Slider':
      return `<div class="ark-node" style="${css}">${label}<input type="range" class="ark-slider" /></div>`;
    case 'Progress':
    case 'LoadingProgress':
      return `<div class="ark-node" style="${css}">${label}<div class="ark-progress"></div></div>`;
    case 'Divider':
      return `<div class="ark-divider" style="${css}"></div>`;
    case 'Blank':
      return `<div class="ark-blank" style="flex:1;${css}"></div>`;
    case 'Search': {
      const ph = extractObjectField(node.params, 'placeholder') || 'Search';
      return `<div class="ark-node" style="${css}">${label}<input class="ark-search" placeholder="${esc(ph)}" readonly /></div>`;
    }
    case 'Checkbox':
      return `<div class="ark-node" style="${css}">${label}<input type="checkbox" /></div>`;
    case 'Radio':
      return `<div class="ark-node" style="${css}">${label}<input type="radio" /></div>`;
    case 'Rating':
      return `<div class="ark-node" style="${css}">${label}<span class="ark-rating">★★★★☆</span></div>`;
    default:
      return `<div class="ark-node" style="${css}">${label}<span class="ark-unknown">${esc(node.type)}</span></div>`;
  }
}

function isLeafComponent(type: string): boolean {
  return [
    'Text', 'Span', 'Button', 'Image', 'ImageSpan', 'TextInput', 'TextArea',
    'Toggle', 'Slider', 'Progress', 'LoadingProgress', 'Divider', 'Blank',
    'Search', 'Checkbox', 'Radio', 'Rating', 'Badge', 'Counter',
    'DatePicker', 'TimePicker', 'TextPicker',
  ].includes(type);
}

function buildCss(node: ArkNode): string {
  const parts: string[] = [];
  const s = node.styles;

  // Layout direction
  switch (node.type) {
    case 'Column':
      parts.push('display:flex;flex-direction:column');
      break;
    case 'Row':
      parts.push('display:flex;flex-direction:row');
      break;
    case 'Stack':
      parts.push('display:grid;place-items:center');
      break;
    case 'Flex':
      parts.push('display:flex;flex-wrap:wrap');
      break;
    case 'Grid':
      parts.push('display:grid');
      break;
    case 'List':
      parts.push('display:flex;flex-direction:column;overflow:auto');
      break;
    case 'Scroll':
      parts.push('overflow:auto');
      break;
    case 'Tabs':
      parts.push('display:flex;flex-direction:column');
      break;
    case 'RelativeContainer':
      parts.push('position:relative');
      break;
    case 'Navigation':
      parts.push('display:flex;flex-direction:column');
      break;
  }

  // Space from constructor params
  if (node.params) {
    const spaceMatch = node.params.match(/space\s*:\s*(\d+)/);
    if (spaceMatch) parts.push(`gap:${spaceMatch[1]}px`);
  }

  // Mapped styles
  if (s.width) parts.push(`width:${toCssSize(s.width)}`);
  if (s.height) parts.push(`height:${toCssSize(s.height)}`);
  if (s.padding) parts.push(`padding:${toCssSize(s.padding)}`);
  if (s.margin) parts.push(`margin:${toCssSize(s.margin)}`);
  if (s.backgroundColor) parts.push(`background-color:${s.backgroundColor}`);
  if (s.borderRadius) parts.push(`border-radius:${toCssSize(s.borderRadius)}`);
  if (s.fontSize) parts.push(`font-size:${toCssSize(s.fontSize)}`);
  if (s.fontColor) parts.push(`color:${s.fontColor}`);
  if (s.fontWeight) parts.push(`font-weight:${s.fontWeight}`);
  if (s.opacity) parts.push(`opacity:${s.opacity}`);
  if (s.layoutWeight) parts.push(`flex:${s.layoutWeight}`);
  if (s.flexGrow) parts.push(`flex-grow:${s.flexGrow}`);
  if (s.justifyContent) parts.push(`justify-content:${s.justifyContent}`);
  if (s.alignItems) parts.push(`align-items:${s.alignItems}`);
  if (s.alignSelf) parts.push(`align-self:${s.alignSelf}`);
  if (s.border) parts.push(`border:1px solid #ddd`);
  if (s.columnsTemplate) {
    const cols = s.columnsTemplate.replace(/'/g, '').trim();
    parts.push(`grid-template-columns:${cols}`);
  }
  if (s.rowsGap) parts.push(`row-gap:${toCssSize(s.rowsGap)}`);
  if (s.columnsGap) parts.push(`column-gap:${toCssSize(s.columnsGap)}`);

  return parts.join(';');
}

function toCssSize(val: string): string {
  if (/^\d+$/.test(val)) return val + 'px';
  if (val.endsWith('%') || val.endsWith('px') || val.endsWith('vp') || val.endsWith('fp')) {
    return val.replace(/vp$/, 'px').replace(/fp$/, 'px');
  }
  return val;
}

// ---- Parsing helpers ----

function extractBalancedBlock(code: string, startIdx: number): string | null {
  if (code[startIdx] !== '{') return null;
  let depth = 0;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === "'" || code[i] === '"' || code[i] === '`') {
      const q = code[i];
      i++;
      while (i < code.length) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === q) break;
        i++;
      }
      continue;
    }
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) return code.substring(startIdx, i + 1); }
  }
  return null;
}

function findClosingParen(code: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === "'" || code[i] === '"' || code[i] === '`') {
      const q = code[i];
      i++;
      while (i < code.length) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === q) break;
        i++;
      }
      continue;
    }
    if (code[i] === '(') depth++;
    else if (code[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return code.length;
}

function skipControlFlow(code: string, idx: number): number {
  // Skip 'if (...) { ... }' or 'else { ... }' or 'else if (...) { ... }'
  let i = idx;
  while (i < code.length && code[i] !== '{' && code[i] !== ';') i++;
  if (code[i] === '{') {
    const block = extractBalancedBlock(code, i);
    if (block) i += block.length;
  }
  // Skip trailing else
  const rest = code.substring(i).match(/^\s*(else\s*)/);
  if (rest) {
    return skipControlFlow(code, i + rest[0].length);
  }
  return i;
}

function skipFunctionCall(code: string, idx: number): number {
  let i = idx;
  while (i < code.length && code[i] !== '(') i++;
  i = findClosingParen(code, i) + 1;
  return i;
}

function skipToNext(code: string, idx: number): number {
  let i = idx;
  while (i < code.length && code[i] !== '\n' && code[i] !== ';') {
    if (code[i] === '{') {
      const block = extractBalancedBlock(code, i);
      if (block) return i + block.length;
    }
    i++;
  }
  return i + 1;
}

function extractStringParam(params: string): string | null {
  const match = params.match(/['"`]([^'"`]*)['"`]/);
  return match ? match[1] : null;
}

function extractObjectField(params: string, field: string): string | null {
  const re = new RegExp(`${field}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`);
  const match = params.match(re);
  return match ? match[1] : null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Preview support check — returns a reason string if unsupported, else null
// ---------------------------------------------------------------------------

function checkPreviewSupport(type: string): string | null {
  const meta = getComponentByName(type);
  if (!meta) return null;
  if (meta.previewSupported) return null;
  const tag = apiLabel(meta.minApi);
  const prefix = tag ? `[${tag}] ` : '';
  return `${prefix}${meta.zh || meta.en}`;
}

function renderUnsupported(node: ArkNode, reason: string, depth: number): string {
  const childrenHtml = node.children.length
    ? node.children.map(c => renderToHtml(c, depth + 1)).join('\n')
    : '';
  const badge = `<div style="background:#fff3e0;border:1px dashed #ff9800;border-radius:6px;padding:6px 10px;margin:4px 0;font-size:11px;color:#e65100;">` +
    `<span style="font-weight:600;">${esc(node.type)}</span>` +
    `<span style="color:#bf360c;margin-left:6px;">⚠ 预览不支持 / Preview unsupported</span>` +
    `<div style="color:#795548;font-size:10px;margin-top:2px;">${esc(reason)}</div>` +
    `</div>`;
  return childrenHtml ? `${badge}<div style="opacity:0.6">${childrenHtml}</div>` : badge;
}
