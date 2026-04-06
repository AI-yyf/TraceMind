import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from '@playwright/test'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(frontendDir, '..')
const backendDir = path.resolve(repoRoot, 'skills-backend')

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  workers: 1,
  fullyParallel: false,
  outputDir: path.resolve(repoRoot, 'output/playwright/results'),
  use: {
    baseURL: 'http://127.0.0.1:4274',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'powershell -NoProfile -Command "$env:PORT=\'3303\'; npm run dev"',
      cwd: backendDir,
      url: 'http://127.0.0.1:3303/health',
      timeout: 120_000,
      reuseExistingServer: true,
    },
    {
      command: 'powershell -NoProfile -Command "npm run dev -- --host 127.0.0.1 --port 4274 --mode playwright"',
      cwd: frontendDir,
      url: 'http://127.0.0.1:4274',
      timeout: 120_000,
      reuseExistingServer: true,
    },
  ],
})
