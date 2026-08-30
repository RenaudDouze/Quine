import { expect, test } from '@playwright/test'
import { createGrid, gotoFresh, openMenu } from './helpers'

test.beforeEach(async ({ page }) => {
  await gotoFresh(page)
})

async function customize(page: import('@playwright/test').Page, title: string) {
  const card = page.locator('.grid-item').filter({ has: page.getByText(title, { exact: true }) })
  await card.getByRole('button', { name: 'Personnaliser', exact: true }).click()
}

test('searches grids by title', async ({ page }) => {
  await createGrid(page, { title: 'Bingo réunion', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')
  await createGrid(page, { title: 'Bingo vacances', size: 3, items: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] })
  await page.goto('/')

  await openMenu(page)
  await page.getByRole('button', { name: 'Rechercher' }).click()
  await page.getByPlaceholder(/rechercher une grille/i).fill('vacances')

  await expect(page.getByText('Bingo vacances', { exact: true })).toBeVisible()
  await expect(page.getByText('Bingo réunion', { exact: true })).not.toBeVisible()
})

test('pins a grid to the top of the list', async ({ page }) => {
  await createGrid(page, { title: 'Alpha', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')
  await createGrid(page, { title: 'Bravo', size: 3, items: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] })
  await page.goto('/')

  await customize(page, 'Bravo')
  await page.getByRole('button', { name: /Épingler en haut/ }).click()

  const titles = await page.locator('.card-title').allTextContents()
  expect(titles[0]).toContain('Bravo')
})

test('archives a grid, moving it to the archived view, and can unarchive it', async ({ page }) => {
  await createGrid(page, { title: 'À archiver', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')

  await customize(page, 'À archiver')
  await page.getByRole('button', { name: /Archiver cette grille/ }).click()

  await expect(page.getByText('À archiver', { exact: true })).not.toBeVisible()
  await openMenu(page)
  await page.getByRole('button', { name: /Vue :/ }).click()
  await expect(page.getByText('À archiver', { exact: true })).toBeVisible()

  await customize(page, 'À archiver')
  await page.getByRole('button', { name: /Désarchiver cette grille/ }).click()
  await expect(page.getByText('À archiver', { exact: true })).not.toBeVisible()
  await openMenu(page)
  await page.getByRole('button', { name: /Vue :/ }).click()
  await expect(page.getByText('À archiver', { exact: true })).toBeVisible()
})

test('deletes a grid instantly and restores it via the undo toast', async ({ page }) => {
  await createGrid(page, { title: 'À restaurer', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')

  await customize(page, 'À restaurer')
  await page.getByRole('button', { name: /Supprimer cette grille/ }).click()
  await expect(page.getByText('À restaurer', { exact: true })).not.toBeVisible()

  await expect(page.getByText(/supprimée/)).toBeVisible()
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByText('À restaurer', { exact: true })).toBeVisible()
})

test('sets a custom color and background image on a grid card', async ({ page }) => {
  await createGrid(page, { title: 'Personnalisée', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')

  await customize(page, 'Personnalisée')
  await page.getByRole('button', { name: 'Choisir la couleur #db2777' }).click()
  const bgInput = page.getByPlaceholder(/exemple.com/i)
  await bgInput.fill('https://example.com/bg.jpg')
  await bgInput.blur()
  await page.keyboard.press('Escape')

  const card = page.locator('.grid-item').filter({ has: page.getByText('Personnalisée', { exact: true }) })
  const stripeColor = await card.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  expect(stripeColor).toBe('rgb(219, 39, 119)')
  await expect(card.locator('.grid-item-bg')).toHaveCount(1)
})

test('carries the custom color over to marked cells and the win banner during play', async ({ page }) => {
  await createGrid(page, { title: 'Rose', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')

  await customize(page, 'Rose')
  await page.getByRole('button', { name: 'Choisir la couleur #db2777' }).click()
  await page.keyboard.press('Escape')

  await page.getByText('Rose', { exact: true }).click()
  await page.waitForSelector('.cell')
  const firstCell = page.locator('.cell').first()
  await firstCell.click()
  await expect(firstCell).toHaveCSS('background-color', 'rgb(219, 39, 119)')

  await page.locator('.cell').nth(1).click()
  await page.locator('.cell').nth(2).click()
  await expect(page.locator('.bingo-banner-inner')).toHaveCSS(
    'background-image',
    /rgb\(219, 39, 119\)/
  )
})

test('drag handles are hidden once a grid is archived, and reappear once no grid is archived', async ({ page }) => {
  await createGrid(page, { title: 'Alpha', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')
  await createGrid(page, { title: 'Bravo', size: 3, items: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] })
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Réordonner' })).toHaveCount(2)

  await customize(page, 'Bravo')
  await page.getByRole('button', { name: /Archiver cette grille/ }).click()
  await expect(page.getByRole('button', { name: 'Réordonner' })).toHaveCount(0)

  await openMenu(page)
  await page.getByRole('button', { name: /Vue :/ }).click()
  await customize(page, 'Bravo')
  await page.getByRole('button', { name: /Désarchiver cette grille/ }).click()
  await openMenu(page)
  await page.getByRole('button', { name: /Vue :/ }).click()
  await expect(page.getByRole('button', { name: 'Réordonner' })).toHaveCount(2)
})

test('reorders grids by dragging a card by its handle', async ({ page }) => {
  await createGrid(page, { title: 'Alpha', size: 3, items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
  await page.goto('/')
  await createGrid(page, { title: 'Bravo', size: 3, items: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] })
  await page.goto('/')
  await createGrid(page, { title: 'Charlie', size: 3, items: ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA'] })
  await page.goto('/')

  await expect(page.locator('.card-title')).toHaveCount(3)
  const titlesBefore = await page.locator('.card-title').allTextContents()
  expect(titlesBefore).toEqual(['Alpha', 'Bravo', 'Charlie'])

  const handles = page.getByRole('button', { name: 'Réordonner' })
  const firstHandle = handles.nth(0)
  const thirdItem = page.locator('.grid-item').nth(2)

  const start = (await firstHandle.boundingBox())!
  const end = (await thirdItem.boundingBox())!

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height - 5, { steps: 10 })
  await page.mouse.move(end.x + end.width / 2, end.y + end.height - 5, { steps: 1 })
  await page.mouse.up()

  const titlesAfter = await page.locator('.card-title').allTextContents()
  expect(titlesAfter[0]).not.toBe('Alpha')
  expect(titlesAfter).toContain('Alpha')
  expect(titlesAfter).toContain('Bravo')
  expect(titlesAfter).toContain('Charlie')

  // The new order survives a reload (persisted to localStorage).
  await page.reload()
  const titlesAfterReload = await page.locator('.card-title').allTextContents()
  expect(titlesAfterReload).toEqual(titlesAfter)
})
