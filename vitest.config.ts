import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: ['@react-native-async-storage/async-storage', '@react-navigation'],
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./__tests__/setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/*/index.ts',
        'node_modules/',
        '__tests__/',
      ],
      thresholds: {
        branches: 30,
        functions: 30,
        lines: 30,
        statements: 30,
      },
    },
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
});
