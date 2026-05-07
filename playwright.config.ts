import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config para Kinetic CRM.
 *
 * Tests viven en `tests/e2e/`. Asume que el dev server corre en localhost:3000
 * (no auto-arranca server porque preferimos usar el dev server con HMR ya
 * corriendo via preview tools de Claude Code).
 *
 * Uso:
 *   npx playwright test                    — todos los tests
 *   npx playwright test --ui               — modo interactivo
 *   npx playwright test --headed           — ver browser
 *   npx playwright test smoke              — solo el smoke
 *   npx playwright show-report             — ver report HTML
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Turbopack dev compile puede tardar 10-15s la primera vez por ruta nueva.
  // En CI con build prod (next start) bajar a 30s.
  timeout: process.env.CI ? 30_000 : 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-SV',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['iPhone 14 Pro'],
      },
    },
  ],
})
