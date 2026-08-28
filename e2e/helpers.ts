import type { Page } from '@playwright/test'

/** Charge l'appli avec un localStorage vierge (grilles et préférence de thème). */
export async function gotoFresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
}

export async function createGrid(
  page: Page,
  options: {
    title: string
    size?: 3 | 4 | 5
    items: string[]
    freeCenter?: boolean
    winRule?: 'line' | 'blackout' | 'corners'
  }
) {
  const { title, size = 3, items, freeCenter = false, winRule } = options

  await page.getByRole('button', { name: '+ Nouvelle grille' }).click()
  await page.getByRole('combobox', { name: /taille de la grille/i }).selectOption(String(size))
  if (freeCenter) {
    await page.getByLabel(/case centrale libre/i).check()
  }
  if (winRule) {
    await page.getByRole('combobox', { name: /condition de victoire/i }).selectOption(winRule)
  }
  await page.getByPlaceholder(/écrivez chaque phrase/i).fill(items.join('\n'))
  await page.getByRole('button', { name: /générer la grille/i }).click()
  // Comme +1, il n'y a plus d'écran dédié à une grille précise : la créer
  // ramène à l'accueil, où son plateau s'affiche déjà en entier.
  await page.waitForURL(/#home/)

  // Comme +1, une grille naît avec un nom par défaut ; on la renomme ici
  // via la modale Personnaliser pour que les tests puissent la cibler par
  // titre ensuite.
  const card = page.locator('.grid-item').last()
  await card.getByRole('button', { name: 'Personnaliser', exact: true }).click()
  const nameInput = page.getByRole('textbox', { name: 'Nom de la grille' })
  await nameInput.fill(title)
  await nameInput.blur()
  await page.getByRole('button', { name: 'Fermer' }).click()
}
