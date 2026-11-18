import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createGrid, gotoFresh, openMenu } from './helpers'

// A11Y-02 : chaque état qui change le DOM passe par axe-core, dans les deux
// thèmes (A11Y-05). Le thème suit `prefers-color-scheme` tant qu'aucun choix
// n'est enregistré.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return results.violations
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`thème ${scheme}`, () => {
    test.use({ colorScheme: scheme })

    test('axe : accueil vide', async ({ page }) => {
      await gotoFresh(page)
      await expect(page.getByRole('button', { name: '+ Nouvelle grille' }).first()).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('axe : avec une grille', async ({ page }) => {
      await gotoFresh(page)
      await createGrid(page, { title: 'Soirée', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })
      await expect(page.locator('.grid-item')).toHaveCount(1)
      expect(await violations(page)).toEqual([])
    })

    test('axe : menu ouvert', async ({ page }) => {
      await gotoFresh(page)
      await openMenu(page)
      expect(await violations(page)).toEqual([])
    })
  })
}
