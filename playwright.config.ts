import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4319)
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * Cloud sessions ship a Chromium under PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers)
 * whose revision may not match this @playwright/test version. Use the bundled
 * browser when it is installed; otherwise fall back to any chromium found there.
 * `PW_CHROMIUM_PATH` overrides both.
 */
function chromiumExecutable(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(dir)) return undefined
  const revisions = readdirSync(dir)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const rev of revisions) {
    const bin = join(dir, rev, 'chrome-linux', 'chrome')
    if (existsSync(bin)) return bin
  }
  return undefined
}

function bundledChromiumInstalled(): boolean {
  try {
    // Points at a missing file (or throws) when the expected revision is absent.
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

const executablePath = bundledChromiumInstalled() ? undefined : chromiumExecutable()

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, launchOptions: { executablePath } },
    },
  ],
  webServer: {
    // Static export: build, then serve `out/` (next start is unavailable with output: 'export').
    command: process.env.E2E_SKIP_BUILD ? 'node e2e/static-server.mjs' : 'pnpm build && node e2e/static-server.mjs',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { E2E_PORT: String(PORT) },
  },
})
