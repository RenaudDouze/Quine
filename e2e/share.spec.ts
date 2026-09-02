import { expect, test } from '@playwright/test'
import { createGrid, gotoFresh, openMenu } from './helpers'

test.beforeEach(async ({ page }) => {
  await gotoFresh(page)
})

test('shares a single grid via a link that a fresh session can import', async ({ page, context }) => {
  await createGrid(page, {
    title: 'Grille à transmettre',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Partager' }).click()
  await expect(page.locator('.sync-qr')).toBeVisible()

  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByText('Copier le lien').click()
  await expect(page.getByText('Lien copié')).toBeVisible()
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(shareUrl).toContain('?import=')

  // A fresh browsing context stands in for a different device/browser.
  const otherContext = await context.browser()!.newContext()
  const otherPage = await otherContext.newPage()
  await otherPage.goto(shareUrl)

  await expect(otherPage.getByText('Grille à transmettre')).toBeVisible()
  expect(otherPage.url()).not.toContain('import=')

  await otherPage.getByText('Grille à transmettre').click()
  await expect(otherPage.locator('.cell')).toHaveCount(9)
  await expect(otherPage.locator('.cell.marked')).toHaveCount(0)

  await otherContext.close()
})

test('does not offer JSON export/import when sharing a single grid', async ({ page }) => {
  await createGrid(page, {
    title: 'Solo',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Partager' }).click()
  await expect(page.getByText('Fichier de sauvegarde')).toHaveCount(0)
})

test('backs up all grids via the sync modal and a fresh session can import them', async ({
  page,
  context,
}) => {
  await createGrid(page, {
    title: 'Première grille',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.goto('/')
  await createGrid(page, {
    title: 'Deuxième grille',
    size: 3,
    items: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
  })
  await page.goto('/')

  await openMenu(page)
  await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByText('Copier le lien').click()
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText())

  const otherContext = await context.browser()!.newContext()
  const otherPage = await otherContext.newPage()
  await otherPage.goto(shareUrl)

  await expect(otherPage.getByText('Première grille')).toBeVisible()
  await expect(otherPage.getByText('Deuxième grille')).toBeVisible()

  await otherContext.close()
})

test('exports and re-imports a JSON backup, preserving marked cells', async ({ page }) => {
  await createGrid(page, {
    title: 'À sauvegarder',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.locator('.cell').first().click()
  await page.goto('/')

  await openMenu(page)
  await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  // Clear everything, then re-import the file we just exported.
  await page.keyboard.press('Escape')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByText(/aucune grille pour le moment/i)).toBeVisible()

  await openMenu(page)
  await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Importer' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(path!)

  await expect(page.getByText('À sauvegarder')).toBeVisible()

  await page.getByText('À sauvegarder').click()
  await expect(page.locator('.cell.marked')).toHaveCount(1)
})
