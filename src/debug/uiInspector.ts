import { buildHdcTargetArgs, execHdc } from '../utils/hdc';

/** A node in the UI component tree */
export interface UINode {
  id: string;
  type: string;            // e.g. 'Column', 'Text', 'Button'
  depth: number;
  bounds: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  children: UINode[];
  sourceInfo?: { file: string; line: number };
}

/**
 * Dump the UI component tree from a connected device via HDC.
 * Uses `hdc shell "hidumper -s WindowManagerService -a -a"` or
 * ArkUI inspector protocol when available.
 */
export async function dumpUITree(deviceId?: string): Promise<UINode | null> {
  const targetArgs = buildHdcTargetArgs(deviceId);

  try {
    // Try ArkUI dump first (more structured)
    const { stdout } = await execHdc(
      [...targetArgs, 'shell', 'aa dump -a'],
      { timeout: 5000 }
    );

    if (stdout.includes('error') || stdout.trim().length < 10) {
      // Fallback: try hidumper
      const { stdout: fallback } = await execHdc(
        [...targetArgs, 'shell', 'hidumper -s WindowManagerService -a -a'],
        { timeout: 5000 }
      );
      return parseHidumperOutput(fallback);
    }

    return parseAaDumpOutput(stdout);
  } catch {
    return null;
  }
}

/** Take a screenshot from device and return base64 PNG */
export async function captureScreenshot(deviceId?: string, format: 'png' | 'jpeg' = 'png'): Promise<string | null> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  const ext = format === 'jpeg' ? 'jpeg' : 'png';
  const tmpDevice = `/data/local/tmp/screenshot.${ext}`;
  const tmpLocal = `/tmp/harmony_screenshot_${Date.now()}.${ext}`;

  try {
    await execHdc([...targetArgs, 'shell', `snapshot_display -f ${tmpDevice}`], { timeout: 5000 });
    await execHdc([...targetArgs, 'file', 'recv', tmpDevice, tmpLocal], { timeout: 5000 });
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(tmpLocal);
    await fs.unlink(tmpLocal).catch(() => {});
    return buffer.toString('base64');
  } catch {
    return null;
  }
}

/** Send a touch/click event to the device */
export async function sendTouchInput(x: number, y: number, deviceId?: string): Promise<void> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  try {
    await execHdc([...targetArgs, 'shell', `uitest uiInput click ${Math.round(x)} ${Math.round(y)}`], { timeout: 3000 });
  } catch { /* best effort */ }
}

/** Send a swipe gesture to the device */
export async function sendSwipeInput(x1: number, y1: number, x2: number, y2: number, durationMs: number = 500, deviceId?: string): Promise<void> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  try {
    await execHdc(
      [...targetArgs, 'shell', `uitest uiInput swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`],
      { timeout: 5000 }
    );
  } catch { /* best effort */ }
}

/** Send a key event to the device */
export async function sendKeyEvent(key: string, deviceId?: string): Promise<void> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  try {
    await execHdc([...targetArgs, 'shell', `uitest uiInput keyEvent ${key}`], { timeout: 3000 });
  } catch { /* best effort */ }
}

/** Send a long-press event to the device */
export async function sendLongPress(x: number, y: number, durationMs: number = 1000, deviceId?: string): Promise<void> {
  const targetArgs = buildHdcTargetArgs(deviceId);
  try {
    await execHdc(
      [...targetArgs, 'shell', `uitest uiInput longClick ${Math.round(x)} ${Math.round(y)} ${durationMs}`],
      { timeout: durationMs + 3000 }
    );
  } catch { /* best effort */ }
}

/** Parse `aa dump` output into UINode tree */
function parseAaDumpOutput(raw: string): UINode | null {
  const lines = raw.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return null;

  const root: UINode = createNode('Root', 0);
  const stack: UINode[] = [root];

  for (const line of lines) {
    const indent = line.search(/\S/);
    const depth = Math.floor(indent / 2) + 1;
    const trimmed = line.trim();

    // Parse component line: "Column [x,y][w,h]" or "Text(Hello) {...}"
    const compMatch = trimmed.match(/^(\w+)(?:\(([^)]*)\))?\s*(?:\[(\d+),\s*(\d+)\]\[(\d+),\s*(\d+)\])?/);
    if (!compMatch) continue;

    const node = createNode(compMatch[1], depth);
    if (compMatch[2]) {
      node.attributes['content'] = compMatch[2];
    }
    if (compMatch[3]) {
      node.bounds = {
        x: parseInt(compMatch[3]),
        y: parseInt(compMatch[4]),
        width: parseInt(compMatch[5]),
        height: parseInt(compMatch[6]),
      };
    }

    // Parse inline attributes
    const attrMatches = trimmed.matchAll(/(\w+):\s*([^,}\]]+)/g);
    for (const am of attrMatches) {
      node.attributes[am[1]] = am[2].trim();
    }

    // Find parent based on depth
    while (stack.length > depth) stack.pop();
    const parent = stack[stack.length - 1];
    parent.children.push(node);
    stack.push(node);
  }

  return root.children.length === 1 ? root.children[0] : root;
}

/** Parse hidumper WindowManagerService output */
function parseHidumperOutput(raw: string): UINode | null {
  // Simplified parsing — hidumper output varies by version
  const root: UINode = createNode('Window', 0);
  const lines = raw.split('\n');

  for (const line of lines) {
    const match = line.match(/\|\s*(\w+)\s*\|.*?(\d+)\s*x\s*(\d+)/);
    if (match) {
      const node = createNode(match[1], 1);
      node.bounds.width = parseInt(match[2]);
      node.bounds.height = parseInt(match[3]);
      root.children.push(node);
    }
  }

  return root;
}

let nodeCounter = 0;
function createNode(type: string, depth: number): UINode {
  return {
    id: `node_${nodeCounter++}`,
    type,
    depth,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    attributes: {},
    children: [],
  };
}

/**
 * Try to map a UI node back to source code by searching .ets files
 * for the component type at roughly the right nesting level.
 */
export async function findSourceLocation(
  node: UINode,
  workspaceRoot: string
): Promise<{ file: string; line: number } | null> {
  const vscode = await import('vscode');
  const files = await vscode.workspace.findFiles('**/*.ets', '**/node_modules/**');

  for (const file of files) {
    const doc = await vscode.workspace.openTextDocument(file);
    const text = doc.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match component call: "Text(", "Column(", "Button(" etc.
      if (line.startsWith(`${node.type}(`) || line.startsWith(`${node.type} (`)) {
        // If node has content attribute, verify it matches
        if (node.attributes['content']) {
          if (line.includes(node.attributes['content'])) {
            return { file: file.fsPath, line: i + 1 };
          }
        } else {
          return { file: file.fsPath, line: i + 1 };
        }
      }
    }
  }
  return null;
}
