import * as vscode from 'vscode';
import { UINode, dumpUITree, captureScreenshot, findSourceLocation } from './uiInspector';

let panel: vscode.WebviewPanel | undefined;
let liveRefreshTimer: ReturnType<typeof setInterval> | undefined;
let isLiveMode = false;

export async function openUIInspector(): Promise<void> {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'harmonyUIInspector',
    'UI Inspector',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.onDidDispose(() => {
    panel = undefined;
    stopLiveRefresh();
  });

  // Handle messages from WebView
  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'refresh':
        await refreshInspector();
        break;
      case 'selectNode':
        await handleNodeSelect(msg.nodeId, msg.nodeType, msg.nodeAttrs);
        break;
      case 'locateSource':
        await handleLocateSource(msg.node);
        break;
      case 'toggleLive':
        toggleLiveRefresh();
        break;
    }
  });

  await refreshInspector();
}

function toggleLiveRefresh(): void {
  if (isLiveMode) {
    stopLiveRefresh();
  } else {
    startLiveRefresh();
  }
}

function startLiveRefresh(): void {
  isLiveMode = true;
  liveRefreshTimer = setInterval(async () => {
    if (!panel) { stopLiveRefresh(); return; }
    // Only refresh screenshot + tree data, post message to update without full HTML rebuild
    const [tree, screenshot] = await Promise.all([
      dumpUITree(),
      captureScreenshot(),
    ]);
    if (panel) {
      panel.webview.postMessage({ command: 'liveUpdate', tree, screenshot });
    }
  }, 2000);
  panel?.webview.postMessage({ command: 'liveStatus', active: true });
}

function stopLiveRefresh(): void {
  isLiveMode = false;
  if (liveRefreshTimer) {
    clearInterval(liveRefreshTimer);
    liveRefreshTimer = undefined;
  }
  panel?.webview.postMessage({ command: 'liveStatus', active: false });
}

async function refreshInspector(): Promise<void> {
  if (!panel) return;

  panel.webview.html = getLoadingHtml();

  const [tree, screenshot] = await Promise.all([
    dumpUITree(),
    captureScreenshot(),
  ]);

  panel.webview.html = getInspectorHtml(tree, screenshot);
}

async function handleNodeSelect(nodeId: string, nodeType: string, attrs: Record<string, string>): Promise<void> {
  // Show node properties in a quick info panel
  const props = Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const action = await vscode.window.showInformationMessage(
    `${nodeType} — ${Object.keys(attrs).length} properties`,
    'Go to Source',
    'Copy Properties'
  );

  if (action === 'Copy Properties') {
    vscode.env.clipboard.writeText(props);
    vscode.window.showInformationMessage('Properties copied');
  } else if (action === 'Go to Source') {
    await handleLocateSource({ type: nodeType, attributes: attrs } as UINode);
  }
}

async function handleLocateSource(node: Partial<UINode>): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return;

  const location = await findSourceLocation(node as UINode, folders[0].uri.fsPath);
  if (location) {
    const doc = await vscode.workspace.openTextDocument(location.file);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const pos = new vscode.Position(location.line - 1, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } else {
    vscode.window.showWarningMessage(`Could not locate ${(node as UINode).type} in source code`);
  }
}

function getLoadingHtml(): string {
  return `<!DOCTYPE html>
<html><body style="background:#1e1e1e;color:#ccc;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
  <div style="text-align:center">
    <div style="font-size:24px;margin-bottom:12px;">Connecting to device...</div>
    <div style="font-size:14px;color:#888;">Dumping UI hierarchy via HDC</div>
  </div>
</body></html>`;
}

function getInspectorHtml(tree: UINode | null, screenshot: string | null): string {
  const treeHtml = tree ? renderTreeHtml(tree) : '<div class="empty">No UI data — is a HarmonyOS app running on the device?</div>';
  const screenshotSrc = screenshot ? `data:image/png;base64,${screenshot}` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, monospace; background: #1e1e1e; color: #d4d4d4; display: flex; height: 100vh; overflow: hidden; }

  /* Toolbar */
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; height: 36px; z-index: 10;
    background: #2d2d2d; border-bottom: 1px solid #444;
    display: flex; align-items: center; padding: 0 12px; gap: 8px;
  }
  .toolbar button {
    background: #0A59F7; color: #fff; border: none; padding: 4px 12px;
    border-radius: 4px; cursor: pointer; font-size: 12px;
  }
  .toolbar button:hover { background: #0847d4; }
  .toolbar .title { font-size: 13px; font-weight: bold; color: #ccc; }

  /* Layout */
  .main { display: flex; margin-top: 36px; height: calc(100vh - 36px); width: 100%; }

  /* Screenshot panel */
  .screenshot-panel {
    width: 280px; min-width: 200px; border-right: 1px solid #333;
    display: flex; flex-direction: column; align-items: center;
    padding: 12px; overflow: auto; background: #252525;
  }
  .screenshot-panel img { max-width: 100%; border: 1px solid #444; border-radius: 8px; }
  .no-screenshot { color: #666; font-size: 12px; padding: 40px 0; text-align: center; }

  /* Tree panel */
  .tree-panel { flex: 1; overflow: auto; padding: 8px; }

  /* Tree nodes */
  .tree-node { cursor: pointer; user-select: none; }
  .tree-row {
    display: flex; align-items: center; padding: 3px 4px; border-radius: 3px;
    font-size: 13px; line-height: 20px; white-space: nowrap;
  }
  .tree-row:hover { background: #2a2d2e; }
  .tree-row.selected { background: #094771; }
  .tree-toggle { width: 16px; text-align: center; color: #888; flex-shrink: 0; cursor: pointer; }
  .tree-icon { margin-right: 4px; font-size: 12px; }
  .tree-type { color: #4ec9b0; font-weight: bold; }
  .tree-attr { color: #9cdcfe; margin-left: 6px; font-size: 11px; }
  .tree-attr-val { color: #ce9178; }
  .tree-children { margin-left: 16px; }
  .tree-children.collapsed { display: none; }

  /* Properties panel */
  .props-panel {
    width: 280px; min-width: 200px; border-left: 1px solid #333;
    overflow: auto; background: #252525;
  }
  .props-header {
    padding: 8px 12px; font-size: 13px; font-weight: bold;
    border-bottom: 1px solid #333; color: #4ec9b0;
  }
  .props-section { padding: 8px 12px; border-bottom: 1px solid #333; }
  .props-section h4 { font-size: 11px; color: #888; margin-bottom: 6px; text-transform: uppercase; }
  .prop-row { display: flex; font-size: 12px; padding: 2px 0; }
  .prop-key { color: #9cdcfe; min-width: 80px; }
  .prop-val { color: #ce9178; word-break: break-all; }
  .bounds-visual {
    width: 100%; height: 80px; margin: 8px 0;
    border: 1px solid #444; border-radius: 4px;
    position: relative; background: #1e1e1e;
  }
  .bounds-box {
    position: absolute; border: 2px solid #0A59F7; background: rgba(10,89,247,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; color: #0A59F7;
  }
  .source-link { color: #0A59F7; cursor: pointer; font-size: 12px; margin-top: 8px; }
  .source-link:hover { text-decoration: underline; }

  .empty { padding: 40px; text-align: center; color: #666; }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="title">UI Inspector</span>
    <button onclick="refresh()">Refresh</button>
    <button onclick="expandAll()">Expand All</button>
    <button onclick="collapseAll()">Collapse All</button>
    <button id="liveBtn" onclick="toggleLive()" style="background:#444;">Live</button>
  </div>

  <div class="main">
    <div class="screenshot-panel">
      ${screenshotSrc
        ? `<img src="${screenshotSrc}" alt="Device Screenshot" />`
        : '<div class="no-screenshot">No screenshot available.<br/>Ensure a device is connected.</div>'}
    </div>

    <div class="tree-panel" id="tree">
      ${treeHtml}
    </div>

    <div class="props-panel" id="props">
      <div class="props-header">Properties</div>
      <div class="empty" style="padding:20px;">Select a component to inspect</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let selectedRow = null;

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function toggleNode(el) {
      const children = el.parentElement.querySelector('.tree-children');
      const toggle = el.querySelector('.tree-toggle');
      if (children) {
        children.classList.toggle('collapsed');
        toggle.textContent = children.classList.contains('collapsed') ? '▶' : '▼';
      }
    }

    function selectNode(el, nodeData) {
      if (selectedRow) selectedRow.classList.remove('selected');
      el.classList.add('selected');
      selectedRow = el;

      const data = JSON.parse(decodeURIComponent(nodeData));
      showProperties(data);
      vscode.postMessage({ command: 'selectNode', nodeId: data.id, nodeType: data.type, nodeAttrs: data.attributes });
    }

    function showProperties(node) {
      const propsEl = document.getElementById('props');
      const attrs = node.attributes || {};
      const bounds = node.bounds || {};

      let html = '<div class="props-header">' + node.type + '</div>';

      // Bounds section
      html += '<div class="props-section"><h4>Layout</h4>';
      html += '<div class="prop-row"><span class="prop-key">x</span><span class="prop-val">' + (bounds.x ?? '—') + '</span></div>';
      html += '<div class="prop-row"><span class="prop-key">y</span><span class="prop-val">' + (bounds.y ?? '—') + '</span></div>';
      html += '<div class="prop-row"><span class="prop-key">width</span><span class="prop-val">' + (bounds.width ?? '—') + '</span></div>';
      html += '<div class="prop-row"><span class="prop-key">height</span><span class="prop-val">' + (bounds.height ?? '—') + '</span></div>';

      // Bounds visualization
      if (bounds.width && bounds.height) {
        const scale = Math.min(240 / 1080, 70 / 2340);
        const bw = Math.max(bounds.width * scale, 4);
        const bh = Math.max(bounds.height * scale, 4);
        const bx = bounds.x * scale;
        const by = bounds.y * scale;
        html += '<div class="bounds-visual"><div class="bounds-box" style="left:' + bx + 'px;top:' + by + 'px;width:' + bw + 'px;height:' + bh + 'px;">' + bounds.width + 'x' + bounds.height + '</div></div>';
      }
      html += '</div>';

      // Attributes section
      const keys = Object.keys(attrs);
      if (keys.length > 0) {
        html += '<div class="props-section"><h4>Attributes (' + keys.length + ')</h4>';
        for (const k of keys) {
          html += '<div class="prop-row"><span class="prop-key">' + k + '</span><span class="prop-val">' + escHtml(attrs[k]) + '</span></div>';
        }
        html += '</div>';
      }

      // Source link
      html += '<div class="props-section">';
      html += '<div class="source-link" onclick="locateSource(\\'' + encodeURIComponent(JSON.stringify(node)) + '\\')">Go to Source Code →</div>';
      html += '</div>';

      propsEl.innerHTML = html;
    }

    function locateSource(nodeData) {
      const node = JSON.parse(decodeURIComponent(nodeData));
      vscode.postMessage({ command: 'locateSource', node });
    }

    function expandAll() {
      document.querySelectorAll('.tree-children').forEach(el => el.classList.remove('collapsed'));
      document.querySelectorAll('.tree-toggle').forEach(el => { if(el.textContent === '▶') el.textContent = '▼'; });
    }

    function collapseAll() {
      document.querySelectorAll('.tree-children').forEach(el => el.classList.add('collapsed'));
      document.querySelectorAll('.tree-toggle').forEach(el => { if(el.textContent === '▼') el.textContent = '▶'; });
    }

    function toggleLive() {
      vscode.postMessage({ command: 'toggleLive' });
    }

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'liveStatus') {
        const btn = document.getElementById('liveBtn');
        if (btn) {
          btn.style.background = msg.active ? '#e74c3c' : '#444';
          btn.textContent = msg.active ? 'Live (ON)' : 'Live';
        }
      }
      if (msg.command === 'liveUpdate' && msg.screenshot) {
        const img = document.querySelector('.screenshot-panel img');
        if (img) {
          img.src = 'data:image/png;base64,' + msg.screenshot;
        }
      }
    });

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  </script>
</body>
</html>`;
}

function renderTreeHtml(node: UINode, depth: number = 0): string {
  const hasChildren = node.children.length > 0;
  const toggle = hasChildren ? '▼' : '';
  const icon = getNodeIcon(node.type);
  const nodeData = encodeURIComponent(JSON.stringify({
    id: node.id,
    type: node.type,
    bounds: node.bounds,
    attributes: node.attributes,
  }));

  // Show first meaningful attribute inline
  const inlineAttr = node.attributes['content']
    ? ` <span class="tree-attr">=<span class="tree-attr-val">"${escapeHtml(node.attributes['content'])}"</span></span>`
    : '';

  let html = `<div class="tree-node">`;
  html += `<div class="tree-row" onclick="selectNode(this, '${nodeData}')">`;
  html += `<span class="tree-toggle" onclick="event.stopPropagation();toggleNode(this.parentElement)">${toggle}</span>`;
  html += `<span class="tree-icon">${icon}</span>`;
  html += `<span class="tree-type">${node.type}</span>`;
  html += inlineAttr;
  html += `</div>`;

  if (hasChildren) {
    html += `<div class="tree-children">`;
    for (const child of node.children) {
      html += renderTreeHtml(child, depth + 1);
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function getNodeIcon(type: string): string {
  const icons: Record<string, string> = {
    Column: '⬜', Row: '⬜', Stack: '⬜', Flex: '⬜', Grid: '⬜',
    Text: '📝', Span: '📝', Button: '🔘', Image: '🖼',
    TextInput: '📋', TextArea: '📋',
    List: '📋', ListItem: '📄', Scroll: '📜',
    Tabs: '📑', TabContent: '📄', Navigation: '🧭',
    Swiper: '🔄', Refresh: '🔄',
    Root: '🌳', Window: '🪟',
  };
  return icons[type] ?? '◻️';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
