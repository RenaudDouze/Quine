import { expect, test } from '@playwright/test'
import { gotoFresh, openMenu } from './helpers'

test.describe('Thème clair/sombre', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page)
  })

  test('démarre en mode automatique et permet de forcer clair puis sombre', async ({ page }) => {
    await openMenu(page)
    const toggle = page.getByRole('button', { name: 'Thème : Auto' })
    await expect(toggle).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')

    await toggle.click()
    await openMenu(page)
    await expect(page.getByRole('button', { name: 'Thème : Clair' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByRole('button', { name: 'Thème : Clair' }).click()
    await openMenu(page)
    await expect(page.getByRole('button', { name: 'Thème : Sombre' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: 'Thème : Sombre' }).click()
    await openMenu(page)
    await expect(page.getByRole('button', { name: 'Thème : Auto' })).toBeVisible()
  })

  test('retient le thème choisi après rechargement', async ({ page }) => {
    await openMenu(page)
    await page.getByRole('button', { name: 'Thème : Auto' }).click()
    await openMenu(page)
    await page.getByRole('button', { name: 'Thème : Clair' }).click()
    await openMenu(page)
    await expect(page.getByRole('button', { name: 'Thème : Sombre' })).toBeVisible()

    await page.reload()
    await openMenu(page)
    await expect(page.getByRole('button', { name: 'Thème : Sombre' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('respecte la préférence système en mode automatique', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    await openMenu(page)
    await expect(page.getByRole('button', { name: 'Thème : Auto' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})
