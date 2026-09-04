import { expect, test } from '@playwright/test'
import { createGrid, gotoFresh, openMenu } from './helpers'

test.beforeEach(async ({ page }) => {
  await gotoFresh(page)
})

test('opens the editor via the ?action=new PWA shortcut', async ({ page }) => {
  await page.goto('/?action=new')
  await expect(page.getByRole('heading', { name: 'Nouvelle grille' })).toBeVisible()
  expect(page.url()).not.toContain('action=')
})

test('opens the sync modal via the ?action=sync PWA shortcut', async ({ page }) => {
  await page.goto('/?action=sync')
  await expect(page.getByText('Synchroniser mes grilles', { exact: true })).toBeVisible()
  expect(page.url()).not.toContain('action=')
})

test('wins via "carton plein" only once every cell is marked', async ({ page }) => {
  await createGrid(page, {
    title: 'Carton plein',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    winRule: 'blackout',
  })

  const cells = page.locator('.cell')
  await cells.nth(0).click()
  await cells.nth(1).click()
  await cells.nth(2).click()
  await expect(page.getByText('BINGO !')).not.toBeVisible()

  for (let i = 3; i < 9; i++) {
    await cells.nth(i).click()
  }
  await expect(page.getByText('BINGO !')).toBeVisible()
})

test('wins via "quatre coins" once all four corners are marked', async ({ page }) => {
  await createGrid(page, {
    title: 'Quatre coins',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    winRule: 'corners',
  })

  const cells = page.locator('.cell')
  await cells.nth(0).click()
  await cells.nth(1).click()
  await cells.nth(2).click()
  await expect(page.getByText('BINGO !')).not.toBeVisible()

  await cells.nth(6).click()
  await cells.nth(8).click()
  await expect(page.getByText('BINGO !')).toBeVisible()
})

test('shows the win rule on the home card when it is not the default', async ({ page }) => {
  await createGrid(page, {
    title: 'Avec règle',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    winRule: 'blackout',
  })
  await page.goto('/')
  await expect(page.getByText(/carton plein/i)).toBeVisible()
})

test('enters and exits focus mode on the home screen, hiding the topbar', async ({ page }) => {
  await createGrid(page, {
    title: 'Plein écran accueil',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.goto('/')

  await openMenu(page)
  await page.getByRole('button', { name: 'Mode focus' }).click()
  await expect(page.getByRole('button', { name: '+ Nouvelle grille' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Quitter le mode focus' })).toBeVisible()
  await expect(page.getByText('Plein écran accueil')).toBeVisible()

  await page.getByRole('button', { name: 'Quitter le mode focus' }).click()
  await expect(page.getByRole('button', { name: '+ Nouvelle grille' })).toBeVisible()
})

test("le plein écran de l'appareil est indépendant du mode focus", async ({ page }) => {
  await createGrid(page, {
    title: 'Grille',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.goto('/')

  // Seul, il ne masque pas l'en-tête (contrairement au mode focus).
  await openMenu(page)
  await page.getByRole('button', { name: 'Plein écran' }).click()
  await expect(page.getByRole('button', { name: '+ Nouvelle grille' })).toBeVisible()

  // Combiné au mode focus, le bouton de sortie de celui-ci ramène aussi le
  // libellé "Plein écran" à son état initial (quitte les deux d'un coup).
  await openMenu(page)
  await page.getByRole('button', { name: 'Mode focus' }).click()
  await page.getByRole('button', { name: 'Quitter le mode focus' }).click()
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Plein écran' })).toBeVisible()
})

test('exports the current grid as an SVG image', async ({ page }) => {
  await createGrid(page, {
    title: 'À exporter',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })

  await page.getByRole('button', { name: 'Partager' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter en image' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.svg$/)
})

test('calls window.print when Imprimer is clicked', async ({ page }) => {
  await createGrid(page, {
    title: 'À imprimer',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })

  await page.evaluate(() => {
    ;(window as unknown as { __printed: boolean }).__printed = false
    window.print = () => {
      ;(window as unknown as { __printed: boolean }).__printed = true
    }
  })
  await page.getByRole('button', { name: 'Partager' }).click()
  await page.getByRole('button', { name: 'Imprimer' }).click()
  const printed = await page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)
  expect(printed).toBe(true)
})
