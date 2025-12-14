import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30000, // 30s timeout for Firebase initialization
    hookTimeout: 30000,
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/test/performance/**',
      'test/perf/**',
      'tests/e2e/**', // Exclude Playwright E2E tests
      'functions/**',
      // Conditionally exclude AI service tests based on environment variable
      ...(process.env.SKIP_AI_TESTS === 'true' ? ['src/services/aiService*.test.ts'] : [])
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
