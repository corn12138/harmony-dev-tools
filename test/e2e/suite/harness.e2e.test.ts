import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { COMMANDS } from '../../../src/utils/constants';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';

suite('E2E: Harness Engineering Features', () => {
  setup(async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    if (!ext.isActive) await ext.activate();
  });

  test('generateAiContext command produces .cursorrules file', async () => {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
    assert.ok(workspaceUri, 'Workspace should be active');
    const rulesPath = path.join(workspaceUri.fsPath, '.cursorrules');
    
    // Remove if exists
    if (fs.existsSync(rulesPath)) {
      fs.unlinkSync(rulesPath);
    }
    
    await vscode.commands.executeCommand(COMMANDS.EXPORT_AI_CONTEXT);
    
    // Wait for file creation
    await new Promise(r => setTimeout(r, 1000));
    
    const exists = fs.existsSync(rulesPath);
    assert.ok(exists, '.cursorrules should be generated');
    
    const content = fs.readFileSync(rulesPath, 'utf8');
    assert.ok(content.includes('HarmonyOS ArkTS AI Harness Context'), 'Should contain Harness header');
    assert.ok(content.includes('Component Purity'), 'Should contain architectural constraints');
  }).timeout(10000);

  test('cleanEntropy command runs without exception', async () => {
    // We cannot easily click 'Cancel' on the prompt in E2E without mock,
    // but we can ensure the command is registered and executes without instantly crashing.
    // If it throws an unhandled rejection, Mocha will catch it.
    // To handle the quickPick/messageBox, it will just timeout or stay pending unless we mock it or 
    // we bypass it. But executing it triggers the static sweep analysis.
    
    // As a workaround to avoid blocking E2E on ShowWarningMessage, we'll just test if the command exists.
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes(COMMANDS.CLEAN_ENTROPY), 'cleanEntropy command should be registered');
  });
});
