import * as vscode from 'vscode';
import { KNOWN_PACKAGES, analyzeDependencies } from './ohpmInsight';

interface DepAction extends vscode.QuickPickItem {
  action: 'update' | 'add' | 'install' | 'audit';
  packageName?: string;
  targetVersion?: string;
}

export async function manageDeps(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }

  const ohPkgFiles = await vscode.workspace.findFiles('**/oh-package.json5', '**/node_modules/**', 5);
  if (ohPkgFiles.length === 0) {
    vscode.window.showWarningMessage('No oh-package.json5 found in the workspace.');
    return;
  }

  const targetFile = ohPkgFiles.length === 1
    ? ohPkgFiles[0]
    : await pickOhPackageFile(ohPkgFiles);
  if (!targetFile) return;

  const content = await vscode.workspace.fs.readFile(targetFile);
  const text = Buffer.from(content).toString('utf8');
  const issues = analyzeDependencies(text);

  const items: DepAction[] = [];

  if (issues.length > 0) {
    items.push({
      label: '$(arrow-up) 更新全部过时依赖',
      description: `${issues.length} outdated`,
      action: 'audit',
    });
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, action: 'audit' });

    for (const issue of issues) {
      items.push({
        label: `$(package) ${issue.packageName}`,
        description: `${issue.currentVersion} → ${issue.latestVersion}`,
        detail: issue.message,
        action: 'update',
        packageName: issue.packageName,
        targetVersion: issue.latestVersion,
      });
    }
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, action: 'audit' });
  }

  items.push({
    label: '$(add) 添加新依赖 / Add Dependency',
    description: 'ohpm install <package>',
    action: 'add',
  });

  items.push({
    label: '$(sync) 安装全部依赖 / Install All',
    description: 'ohpm install',
    action: 'install',
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: 'OHPM 依赖管理 / Dependency Management',
    placeHolder: '选择操作…',
  });
  if (!pick) return;

  switch (pick.action) {
    case 'update':
      if (pick.packageName && pick.targetVersion) {
        await updateDependencyVersion(targetFile, text, pick.packageName, pick.targetVersion);
      }
      break;
    case 'add':
      await addDependency(folder.uri);
      break;
    case 'install':
      await runOhpmInstall(folder.uri);
      break;
    case 'audit':
      await updateAllOutdated(targetFile, text, issues);
      break;
  }
}

async function pickOhPackageFile(files: vscode.Uri[]): Promise<vscode.Uri | undefined> {
  const items = files.map((f) => ({
    label: vscode.workspace.asRelativePath(f),
    uri: f,
  }));
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select oh-package.json5',
  });
  return pick?.uri;
}

async function updateDependencyVersion(
  file: vscode.Uri,
  text: string,
  packageName: string,
  newVersion: string,
): Promise<void> {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(["']${escaped}["']\\s*:\\s*["'])[^"']+(["'])`, 'g');
  const updated = text.replace(re, `$1^${newVersion}$2`);

  if (updated === text) {
    vscode.window.showWarningMessage(`Could not locate ${packageName} in the file.`);
    return;
  }

  await vscode.workspace.fs.writeFile(file, Buffer.from(updated, 'utf8'));
  vscode.window.showInformationMessage(`${packageName} updated to ^${newVersion}`);
}

async function updateAllOutdated(
  file: vscode.Uri,
  text: string,
  issues: { packageName: string; latestVersion?: string }[],
): Promise<void> {
  let updated = text;
  let count = 0;

  for (const issue of issues) {
    if (!issue.latestVersion) continue;
    const escaped = issue.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(["']${escaped}["']\\s*:\\s*["'])[^"']+(["'])`, 'g');
    const before = updated;
    updated = updated.replace(re, `$1^${issue.latestVersion}$2`);
    if (updated !== before) count++;
  }

  if (count === 0) {
    vscode.window.showInformationMessage('All dependencies are up to date.');
    return;
  }

  await vscode.workspace.fs.writeFile(file, Buffer.from(updated, 'utf8'));
  vscode.window.showInformationMessage(`Updated ${count} dependencies. Run "ohpm install" to apply.`);
}

async function addDependency(rootUri: vscode.Uri): Promise<void> {
  const knownItems = Object.entries(KNOWN_PACKAGES).map(([name, info]) => ({
    label: name,
    description: info.latest,
    detail: info.description,
  }));

  const pick = await vscode.window.showQuickPick(
    [...knownItems, { label: '$(edit) 输入自定义包名 / Enter custom package…', description: '', detail: '' }],
    { title: 'Add Dependency', placeHolder: '选择或搜索包名' },
  );
  if (!pick) return;

  let packageName: string;
  if (pick.label.includes('custom') || pick.label.includes('自定义')) {
    const input = await vscode.window.showInputBox({
      prompt: 'Package name (e.g. @ohos/axios)',
      placeHolder: '@ohos/package-name',
    });
    if (!input) return;
    packageName = input;
  } else {
    packageName = pick.label;
  }

  const terminal = vscode.window.createTerminal({ name: 'OHPM', cwd: rootUri.fsPath });
  terminal.show();
  terminal.sendText(`ohpm install ${packageName}`);
}

async function runOhpmInstall(rootUri: vscode.Uri): Promise<void> {
  const terminal = vscode.window.createTerminal({ name: 'OHPM', cwd: rootUri.fsPath });
  terminal.show();
  terminal.sendText('ohpm install');
}
