const fs = require('node:fs');
const path = require('node:path');

const bundlePath = path.join(__dirname, '..', 'dist', 'extension.js');
const limit = 512 * 1024;

try {
  const size = fs.statSync(bundlePath).size;
  if (size === 0 || size > limit) {
    throw new Error(`Production bundle is ${size} bytes; expected 1–${limit} bytes.`);
  }
  console.log(`Production bundle: ${size} / ${limit} bytes.`);
} catch (error) {
  console.error(`Bundle check failed: ${error.message}`);
  process.exitCode = 1;
}
