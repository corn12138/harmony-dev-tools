import * as vscode from 'vscode';

let currentPanel: vscode.WebviewPanel | undefined;

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
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'harmonyPreview',
      `Preview: ${componentName}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    currentPanel.onDidDispose(() => { currentPanel = undefined; });
  }

  currentPanel.title = `Preview: ${componentName}`;
  currentPanel.webview.html = renderPreviewHtml(source, componentName);

  // Auto-update on save
  const disposable = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc === editor.document && currentPanel) {
      const updated = doc.getText();
      const name = extractComponentName(updated);
      currentPanel.title = `Preview: ${name}`;
      currentPanel.webview.html = renderPreviewHtml(updated, name);
    }
  });
  currentPanel.onDidDispose(() => disposable.dispose());
}

function extractComponentName(source: string): string {
  const match = source.match(/@Component\s+struct\s+(\w+)/);
  return match?.[1] ?? 'Component';
}

function renderPreviewHtml(source: string, componentName: string): string {
  const uiElements = parseSimpleUI(source);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1e1e1e; padding: 16px; }
    .device-frame {
      width: 360px; height: 780px; margin: 0 auto;
      border: 2px solid #444; border-radius: 24px;
      overflow: hidden; background: #fff; color: #333;
    }
    .status-bar {
      height: 44px; background: #f5f5f5; display: flex;
      align-items: center; justify-content: center;
      font-size: 12px; color: #666; border-bottom: 1px solid #e0e0e0;
    }
    .content { height: calc(100% - 44px); overflow: auto; padding: 16px; }
    .comp-label { text-align: center; color: #888; font-size: 13px; margin-bottom: 12px; }
    .note {
      text-align: center; color: #666; font-size: 11px;
      padding: 6px; background: #fff3cd; border-radius: 4px; margin-bottom: 12px;
    }
    .el { margin: 4px 0; padding: 8px; border: 1px dashed #ddd; border-radius: 4px; }
    .el-text { font-size: 16px; }
    .el-btn {
      background: #0A59F7; color: #fff; border: none;
      padding: 8px 24px; border-radius: 20px; font-size: 14px; cursor: pointer;
    }
    .el-img {
      width: 60px; height: 60px; background: #e0e0e0; border-radius: 8px;
      display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;
    }
    .el-input {
      width: 100%; padding: 8px 12px; border: 1px solid #ddd;
      border-radius: 8px; font-size: 14px; background: #fafafa;
    }
    .src {
      background: #f5f5f5; border-radius: 8px; padding: 12px;
      font-family: monospace; font-size: 12px; white-space: pre-wrap;
      word-break: break-all; max-height: 600px; overflow: auto; color: #333;
    }
  </style>
</head>
<body>
  <div class="device-frame">
    <div class="status-bar">HarmonyOS Preview</div>
    <div class="content">
      <div class="comp-label">&lt;${esc(componentName)} /&gt;</div>
      <div class="note">Simplified preview — actual rendering may differ</div>
      ${uiElements}
    </div>
  </div>
</body>
</html>`;
}

function parseSimpleUI(source: string): string {
  const els: string[] = [];

  for (const m of source.matchAll(/Text\(\s*(?:this\.\w+|['"\`]([^'"\`]*)['"\`]|\$r\([^)]+\))/g)) {
    const txt = m[1] ?? (m[0].includes('this.') ? '{dynamic}' : '{resource}');
    els.push(`<div class="el"><span class="el-text">${esc(txt)}</span></div>`);
  }
  for (const m of source.matchAll(/Button\(\s*['"\`]([^'"\`]*)['"\`]\s*\)/g)) {
    els.push(`<div class="el"><button class="el-btn">${esc(m[1])}</button></div>`);
  }
  for (const m of source.matchAll(/TextInput\(\s*\{[^}]*placeholder:\s*['"\`]([^'"\`]*)['"\`]/g)) {
    els.push(`<div class="el"><input class="el-input" placeholder="${esc(m[1])}" readonly /></div>`);
  }
  for (const _ of source.matchAll(/Image\(/g)) {
    els.push(`<div class="el"><div class="el-img">IMG</div></div>`);
  }

  if (els.length === 0) {
    els.push(`<div class="src">${esc(source.slice(0, 2000))}</div>`);
  }
  return els.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
