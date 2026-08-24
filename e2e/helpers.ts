import type { Page } from '@playwright/test'

/** Charge l'appli avec un localStorage vierge (grilles et préférence de thème). */
export async function gotoFresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
}

export async function createGrid(
  page: Page,
  options: { title: string; size?: 3 | 4 | 5; items: string[]; freeCenter?: boolean }
) {
  const { title, size = 3, items, freeCenter = false } = options

  await page.getByRole('button', { name: '+ Nouvelle grille' }).click()
  await page.getByPlaceholder(/bingo réunion/i).fill(title)
  await page.getByRole('combobox').selectOption(String(size))
  if (freeCenter) {
    await page.getByLabel(/case centrale libre/i).check()
  }
  await page.getByPlaceholder(/écrivez chaque phrase/i).fill(items.join('\n'))
  await page.getByRole('button', { name: /générer la grille/i }).click()
  await page.waitForURL(/#play\//)
}
