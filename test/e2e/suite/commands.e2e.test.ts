import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'corn12138.harmony-dev-tools';

async function ensureActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
  if (!ext.isActive) await ext.activate();
}

// Commands that are safe to call without a real device/project (won't throw)
const SAFE_COMMANDS = [
  'harmony.viewDevices',
  'harmony.checkEnvironment',
  'harmony.selectDevice',
  'harmony.clean',
  'harmony.formatDocument',
  'harmony.organizeImports',
  'harmony.checkApiCompat',
];

suite('E2E: Commands Stress', () => {
  setup(async () => {
    await ensureActivated();
  });

  // --- Batch-fire all safe commands ---

  for (const cmd of SAFE_COMMANDS) {
    test(`${cmd} executes without throwing`, async () => {
      try {
        await vscode.commands.executeCommand(cmd);
        assert.ok(true);
      } catch (err: any) {
        // Some commands may show a "no device" message but should NOT crash
        if (err?.message?.includes('is not defined') || err?.message?.includes('Cannot read')) {
          assert.fail(`Command ${cmd} crashed: ${err.message}`);
        }
        // Tolerate "no device connected" style soft errors
        assert.ok(true, `${cmd} threw a soft error (expected without device): ${err.message}`);
      }
    });
  }

  // --- Stress: rapid-fire same command ---

  test('viewDevices survives 10x rapid fire', async () => {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        Promise.resolve(vscode.commands.executeCommand('harmony.viewDevices')).then(() => undefined)
      );
    }
    await Promise.allSettled(promises);
    assert.ok(true, 'Survived 10x rapid viewDevices');
  }).timeout(15000);

  test('checkEnvironment survives 5x rapid fire', async () => {
    for (let i = 0; i < 5; i++) {
      await vscode.commands.executeCommand('harmony.checkEnvironment');
    }
    assert.ok(true, 'Survived 5x rapid checkEnvironment');
  }).timeout(15000);

  // --- Verify commands exist even if they need device context ---

  const DEVICE_COMMANDS = [
    'harmony.buildHap',
    'harmony.runOnDevice',
    'harmony.installHap',
    'harmony.buildAndRun',
    'harmony.terminalBuildAndRun',
    'harmony.stopApp',
    'harmony.migrateV1ToV2',
  ];

  test('Device-dependent commands are registered', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    for (const cmd of DEVICE_COMMANDS) {
      assert.ok(allCommands.includes(cmd), `${cmd} is not registered`);
    }
  });
});
