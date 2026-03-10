import * as vscode from 'vscode';
import { parseArkUI, renderToHtml } from './arkuiRenderer';

let currentPanel: vscode.WebviewPanel | undefined;
let currentDeviceType: 'phone' | 'tablet' | 'wearable' | 'car' = 'phone';
let panelDisposables: vscode.Disposable[] = [];

const DEVICE_FRAMES: Record<string, { width: number; height: number; radius: number }> = {
  phone:    { width: 360, height: 780, radius: 24 },
  tablet:   { width: 600, height: 400, radius: 16 },
  wearable: { width: 192, height: 192, radius: 96 },
  car:      { width: 720, height: 360, radius: 12 },
};

export async function previewComponent(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'arkts') {
    vscode.window.showWarningMessage('Open an ArkTS (.ets) file to preview');
    return;
  }

  const source = editor.document.getText();
  const componentName = extractComponentName(source);

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    updatePreview(editor.document);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'harmonyPreview',
    `Preview: ${componentName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  currentPanel.webview.html = buildPreviewHtml(source, componentName);

  panelDisposables.push(
    currentPanel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'setDevice') {
        currentDeviceType = msg.type;
        const activeEditor = vscode.window.activeTextEditor;
        if (currentPanel && activeEditor?.document.languageId === 'arkts') {
          updatePreview(activeEditor.document);
        }
      }
    })
  );

  panelDisposables.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'arkts' && currentPanel) {
        updatePreview(doc);
      }
    })
  );

  panelDisposables.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed?.document.languageId === 'arkts' && currentPanel) {
        updatePreview(ed.document);
      }
    })
  );

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    panelDisposables.forEach(d => d.dispose());
    panelDisposables = [];
  });
}

function updatePreview(doc: vscode.TextDocument): void {
  if (!currentPanel) return;
  const source = doc.getText();
  const name = extractComponentName(source);
  currentPanel.title = `Preview: ${name}`;
  currentPanel.webview.html = buildPreviewHtml(source, name);
}

function extractComponentName(source: string): string {
  const match = source.match(/@(?:Component|ComponentV2)\s+struct\s+(\w+)/);
  return match?.[1] ?? 'Component';
}

function buildPreviewHtml(source: string, componentName: string): string {
  const tree = parseArkUI(source);
  const renderedContent = tree ? renderToHtml(tree) : renderFallback(source);
  const device = DEVICE_FRAMES[currentDeviceType];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #1e1e1e; color: #d4d4d4; padding: 12px;
    }

    .toolbar {
      display: flex; gap: 6px; margin-bottom: 12px; align-items: center;
    }
    .toolbar button {
      background: #3c3c3c; color: #ccc; border: 1px solid #555;
      padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;
    }
    .toolbar button:hover { background: #4c4c4c; }
    .toolbar button.active { background: #0A59F7; color: #fff; border-color: #0A59F7; }
    .toolbar .title { font-size: 12px; color: #888; margin-right: 8px; }

    .device-frame {
      width: ${device.width}px; height: ${device.height}px;
      margin: 0 auto; border: 2px solid #444;
      border-radius: ${device.radius}px; overflow: hidden;
      background: #fff; color: #333; display: flex; flex-direction: column;
    }
    .status-bar {
      height: 36px; background: #f5f5f5; display: flex;
      align-items: center; justify-content: center;
      font-size: 11px; color: #666; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;
    }
    .content {
      flex: 1; overflow: auto; padding: 0;
    }

    .comp-label { text-align: center; color: #999; font-size: 12px; padding: 8px; background: #fafafa; border-bottom: 1px solid #eee; }
    .note { text-align: center; color: #888; font-size: 10px; padding: 4px; background: #fff8e1; }

    /* ArkUI node rendering */
    .ark-node { position: relative; min-height: 4px; }
    .ark-node:hover { outline: 1px dashed rgba(10,89,247,0.3); }
    .ark-label {
      position: absolute; top: 0; left: 0; font-size: 8px; color: rgba(10,89,247,0.5);
      pointer-events: none; z-index: 1; background: rgba(255,255,255,0.8);
      padding: 0 3px; border-radius: 0 0 3px 0; display: none;
    }
    .ark-node:hover > .ark-label { display: block; }

    .ark-text { font-size: 16px; padding: 2px; }
    .ark-btn {
      background: #0A59F7; color: #fff; border: none;
      padding: 8px 24px; border-radius: 20px; font-size: 14px; cursor: default;
      width: 100%;
    }
    .ark-image { }
    .ark-img-placeholder {
      width: 60px; height: 60px; background: #e8e8e8; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #999;
    }
    .ark-input {
      width: 100%; padding: 8px 12px; border: 1px solid #ddd;
      border-radius: 8px; font-size: 14px; background: #fafafa;
    }
    .ark-textarea {
      width: 100%; padding: 8px 12px; border: 1px solid #ddd;
      border-radius: 8px; font-size: 14px; background: #fafafa; min-height: 60px; resize: none;
    }
    .ark-search {
      width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #ddd;
      border-radius: 20px; font-size: 14px; background: #f5f5f5;
    }
    .ark-toggle { cursor: default; }
    .ark-slider { width: 100%; }
    .ark-progress {
      height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden;
    }
    .ark-progress::after {
      content: ''; display: block; width: 60%; height: 100%;
      background: #0A59F7; border-radius: 2px;
    }
    .ark-divider { height: 1px; background: #e0e0e0; width: 100%; }
    .ark-rating { color: #ff9800; font-size: 18px; }
    .ark-unknown { color: #999; font-size: 12px; font-style: italic; }

    .fallback-src {
      background: #f5f5f5; border-radius: 8px; padding: 12px;
      font-family: monospace; font-size: 11px; white-space: pre-wrap;
      word-break: break-all; max-height: 600px; overflow: auto; color: #333;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="title">Device:</span>
    <button onclick="setDevice('phone')" ${currentDeviceType === 'phone' ? 'class="active"' : ''}>Phone</button>
    <button onclick="setDevice('tablet')" ${currentDeviceType === 'tablet' ? 'class="active"' : ''}>Tablet</button>
    <button onclick="setDevice('wearable')" ${currentDeviceType === 'wearable' ? 'class="active"' : ''}>Watch</button>
    <button onclick="setDevice('car')" ${currentDeviceType === 'car' ? 'class="active"' : ''}>Car</button>
  </div>

  <div class="device-frame">
    <div class="status-bar">HarmonyOS — ${esc(componentName)}</div>
    <div class="content">
      <div class="note">Simplified preview — saves auto-refresh</div>
      ${renderedContent}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function setDevice(type) {
      vscode.postMessage({ command: 'setDevice', type });
    }
  </script>
</body>
</html>`;
}

function renderFallback(source: string): string {
  return `<div class="fallback-src">${esc(source.slice(0, 3000))}</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
