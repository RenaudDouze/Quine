import { expect, test } from '@playwright/test'
import { createGrid, gotoFresh } from './helpers'

test.beforeEach(async ({ page }) => {
  await gotoFresh(page)
})

test('shows the empty state on first visit', async ({ page }) => {
  await expect(page.getByText(/aucune grille pour le moment/i)).toBeVisible()
})

test('creates a grid and lands on the play screen', async ({ page }) => {
  await createGrid(page, {
    title: 'Bingo réunion',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })

  await expect(page.getByRole('heading', { name: 'Bingo réunion' })).toBeVisible()
  await expect(page.locator('.cell')).toHaveCount(9)
})

test('completing a row triggers a bingo', async ({ page }) => {
  await createGrid(page, {
    title: 'Bingo complet',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })

  // Indices 0, 1, 2 always form the top row regardless of the shuffled labels.
  await page.locator('.cell').nth(0).click()
  await page.locator('.cell').nth(1).click()
  await page.locator('.cell').nth(2).click()

  await expect(page.getByText('BINGO !')).toBeVisible()
  await expect(page.locator('.bingo-celebration')).toBeVisible()
})

test('dismissing the bingo banner keeps it hidden when toggling an unrelated cell', async ({ page }) => {
  await createGrid(page, {
    title: 'Bingo complet',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })

  await page.locator('.cell').nth(0).click()
  await page.locator('.cell').nth(1).click()
  await page.locator('.cell').nth(2).click()
  await expect(page.getByText('BINGO !')).toBeVisible()

  await page.getByText('BINGO !').click() // dismiss
  await page.locator('.cell').nth(3).click() // toggle a cell outside the winning row
  await expect(page.getByText('BINGO !')).not.toBeVisible()
  await page.locator('.cell').nth(3).click()
  await expect(page.getByText('BINGO !')).not.toBeVisible()
})

test('reset clears marks without touching a free center cell', async ({ page }) => {
  await createGrid(page, {
    title: 'Bingo libre',
    size: 5,
    freeCenter: true,
    items: Array.from({ length: 24 }, (_, i) => `Item ${i + 1}`),
  })

  await expect(page.getByText('GRATUIT')).toBeVisible()

  const firstCell = page.locator('.cell:not(.free)').first()
  await firstCell.click()
  await expect(firstCell).toHaveClass(/marked/)

  await page.getByRole('button', { name: /réinitialiser les coches/i }).click()

  await expect(firstCell).not.toHaveClass(/marked/)
  await expect(page.locator('.cell.free')).toHaveClass(/marked/)
})

test('persists grids in localStorage across reloads', async ({ page }) => {
  await createGrid(page, {
    title: 'Grille persistante',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Grille persistante' })).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Grille persistante')).toBeVisible()
})

test('can edit, duplicate and delete a saved grid from the home screen', async ({ page }) => {
  await createGrid(page, {
    title: 'À dupliquer',
    size: 3,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  })
  await page.goto('/')

  const card = page.locator('.grid-item').filter({ has: page.getByText('À dupliquer', { exact: true }) })
  await card.getByRole('button', { name: 'Personnaliser', exact: true }).click()
  await page.getByRole('button', { name: /Dupliquer cette grille/ }).click()
  await expect(page.getByText('À dupliquer (copie)', { exact: true })).toBeVisible()

  const copyCard = page
    .locator('.grid-item')
    .filter({ has: page.getByText('À dupliquer (copie)', { exact: true }) })
  await copyCard.getByRole('button', { name: 'Personnaliser', exact: true }).click()
  await page.getByRole('button', { name: /Supprimer cette grille/ }).click()
  await expect(page.getByText('À dupliquer (copie)', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/supprimée/)).toBeVisible()
})
