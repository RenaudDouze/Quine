import { expect, test } from '@playwright/test'
import { gotoFresh } from './helpers'

// Playwright sert le build de production (playwright.config.ts) : le service
// worker n'existe pas sous `vite dev`.
test.describe('PWA et fonctionnement hors ligne', () => {
  test('enregistre un service worker', async ({ page }) => {
    await gotoFresh(page)
    const hasServiceWorker = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return !!reg.active
    })
    expect(hasServiceWorker).toBe(true)
  })

  test("l'accueil se recharge hors ligne et annonce l'absence de réseau", async ({ page, context }) => {
    await gotoFresh(page)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    // Avec registerType « prompt », le service worker ne prend le contrôle de
    // la page qu'au chargement suivant.
    await page.reload()
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await expect(page.locator('#offline-banner')).toHaveCount(0)

    await context.setOffline(true)
    await page.reload()

    await expect(page.locator('#root')).not.toBeEmpty()
    await expect(page.locator('#offline-banner')).toContainText('Hors ligne')

    await context.setOffline(false)
    await expect(page.locator('#offline-banner')).toHaveCount(0)
  })
})
