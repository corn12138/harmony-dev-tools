import * as vscode from 'vscode';
import * as path from 'path';
import { generateProject, TemplateId } from './templates';

interface TemplateOption extends vscode.QuickPickItem {
  value: TemplateId;
}

export async function runProjectWizard(): Promise<void> {
  // Step 1: Select template
  const template = await vscode.window.showQuickPick<TemplateOption>(
    [
      { label: '$(file-code) Empty Ability', description: 'Minimal HarmonyOS project with single page', value: 'empty' },
      { label: '$(list-unordered) List App', description: 'App with List + pull-to-refresh', value: 'list' },
      { label: '$(browser) Tab App', description: 'App with bottom Tabs navigation', value: 'tabs' },
      { label: '$(lock) Login App', description: 'App with login form + validation', value: 'login' },
    ],
    { placeHolder: 'Select a project template', title: 'HarmonyOS: Create New Project (Step 1/4)' }
  );
  if (!template) return;

  // Step 2: Project name
  const projectName = await vscode.window.showInputBox({
    prompt: 'Enter project name',
    placeHolder: 'MyApplication',
    title: 'HarmonyOS: Create New Project (Step 2/4)',
    validateInput: (v) => /^[A-Za-z]\w*$/.test(v) ? null : 'Must start with a letter, only letters/digits/underscore',
  });
  if (!projectName) return;

  // Step 3: Bundle name
  const bundleName = await vscode.window.showInputBox({
    prompt: 'Enter bundle name',
    placeHolder: 'com.example.myapp',
    title: 'HarmonyOS: Create New Project (Step 3/4)',
    value: `com.example.${projectName.toLowerCase()}`,
    validateInput: (v) => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(v) ? null : 'Format: com.company.appname',
  });
  if (!bundleName) return;

  // Step 4: Target directory
  const targetDir = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: 'Select Project Location',
    title: 'HarmonyOS: Create New Project (Step 4/4)',
  });
  if (!targetDir?.length) return;

  const projectRoot = path.join(targetDir[0].fsPath, projectName);

  // Generate
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Creating HarmonyOS project...' },
    async (progress) => {
      progress.report({ increment: 0, message: 'Generating project files...' });

      try {
        await generateProject(projectRoot, {
          templateId: template.value,
          projectName,
          bundleName,
        });

        progress.report({ increment: 100, message: 'Done!' });

        const action = await vscode.window.showInformationMessage(
          `Project "${projectName}" created successfully!`,
          'Open in Current Window',
          'Open in New Window'
        );

        const uri = vscode.Uri.file(projectRoot);
        if (action === 'Open in Current Window') {
          vscode.commands.executeCommand('vscode.openFolder', uri, false);
        } else if (action === 'Open in New Window') {
          vscode.commands.executeCommand('vscode.openFolder', uri, true);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create project: ${err}`);
      }
    }
  );
}
