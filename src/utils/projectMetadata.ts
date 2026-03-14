import * as vscode from 'vscode';
import { CONFIG_FILES } from './constants';
import { extractJson5StringValue } from './json5';

const ABILITY_NAME_REGEX = /(?:["']name["']|name)\s*:\s*["']([\w$]*Ability[\w$]*)["']/;

export async function readBundleName(rootUri: vscode.Uri): Promise<string | undefined> {
  try {
    const appJsonUri = vscode.Uri.joinPath(rootUri, 'AppScope', CONFIG_FILES.APP_JSON);
    const content = await vscode.workspace.fs.readFile(appJsonUri);
    const text = Buffer.from(content).toString('utf8');
    return extractJson5StringValue(text, 'bundleName');
  } catch {
    return undefined;
  }
}

export async function readEntryAbility(rootUri: vscode.Uri): Promise<string | undefined> {
  try {
    const moduleFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(rootUri, `**/src/main/${CONFIG_FILES.MODULE_JSON}`),
      '**/node_modules/**',
    );

    for (const file of moduleFiles) {
      const content = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(content).toString('utf8');
      if (extractJson5StringValue(text, 'type') !== 'entry') {
        continue;
      }

      const mainElement = extractJson5StringValue(text, 'mainElement');
      if (mainElement) {
        return mainElement.replace(/^\./, '');
      }

      const abilityName = text.match(ABILITY_NAME_REGEX)?.[1];
      if (abilityName) {
        return abilityName;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function findBuiltHapFiles(rootUri: vscode.Uri): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(
    new vscode.RelativePattern(rootUri, '**/build/**/outputs/**/*.hap'),
    '**/node_modules/**',
  );
}
