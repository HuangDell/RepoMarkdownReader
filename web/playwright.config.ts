import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.READER_TEST_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), 'reader-explorer-test-'));

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3197', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3197',
    url: 'http://127.0.0.1:3197/api/repos',
    reuseExistingServer: false,
    env: {
      READER_DATA_DIR: process.env.READER_TEST_DATA_DIR,
      READER_GITHUB_TOKEN: 'local-test-only',
      READER_PULL_INTERVAL_MINUTES: '1440',
    },
  },
});
