// test/e2e/suite/index.ts
import * as path from 'path';
import Mocha from 'mocha';
import { globSync } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 30000 // UI tests can be slow
  });

  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((c, e) => {
    try {
      const files = globSync('**/*.e2e.test.js', { cwd: testsRoot });

      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        mocha.run(failures => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        e(err);
      }
    } catch (err) {
      e(err);
    }
  });
}
