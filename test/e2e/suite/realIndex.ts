import * as path from 'path';
import Mocha from 'mocha';
import { globSync } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 300000,
  });

  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    try {
      const files = globSync('**/*.smoke.e2e.test.js', { cwd: testsRoot });
      files.forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} smoke tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
