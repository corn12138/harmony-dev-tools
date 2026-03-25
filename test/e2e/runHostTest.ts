import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const testWorkspace = path.resolve(extensionDevelopmentPath, 'test/fixtures/demo-project');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        '--disable-extensions',
      ],
    });
  } catch (err) {
    console.error('Failed to run host E2E tests');
    console.error(err);
    process.exit(1);
  }
}

void main();
