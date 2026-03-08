import * as vscode from 'vscode';

const DOCS_BASE_URL = 'https://developer.huawei.com/consumer/en/doc/harmonyos-guides/';

export async function openDocs(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Search HarmonyOS Documentation',
    placeHolder: 'e.g., State Management, List Component, Navigation...',
  });
  if (!query) return;

  const searchUrl = `https://developer.huawei.com/consumer/en/search?keyword=${encodeURIComponent(query)}&filterType=doc`;
  vscode.env.openExternal(vscode.Uri.parse(searchUrl));
}
