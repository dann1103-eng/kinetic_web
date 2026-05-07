import { test, expect } from '@playwright/test'

/**
 * Smoke test — verifica que el rebrand de Kinetic está aplicado en /login y
 * que las rutas críticas no devuelven 500.
 *
 * No requiere autenticación: las rutas protegidas redirigen a /login.
 */

test.describe('Kinetic — smoke (sin auth)', () => {
  test('login muestra branding Kinetic', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Kinetic/)
    await expect(page.getByRole('heading', { name: 'Kinetic', level: 1 })).toBeVisible()
    await expect(page.getByText('Centro de Estimulación y Desarrollo Intelectual')).toBeVisible()
    await expect(page.getByText('Accede con tu cuenta de Kinetic.')).toBeVisible()
  })

  test('botón Ingresar usa color primario azul Kinetic (#1FA4DA)', async ({ page }) => {
    await page.goto('/login')
    const submit = page.getByRole('button', { name: 'Ingresar' })
    await expect(submit).toBeVisible()
    const bg = await submit.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(bg).toContain('rgb(31, 164, 218)') // #1FA4DA
  })

  test('rutas protegidas redirigen a /login', async ({ page }) => {
    for (const path of ['/familias', '/dashboard', '/pipeline', '/calendario']) {
      const res = await page.goto(path)
      expect(res?.status()).toBeLessThan(500)
      // Redirige a /login (server redirect en route handler)
      expect(page.url()).toMatch(/\/login/)
    }
  })
})
