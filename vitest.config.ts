import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      vscode: '/test/__mocks__/vscode.ts',
    },
  },
});
