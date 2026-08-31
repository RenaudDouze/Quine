import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { createGrid, gotoFresh, openMenu } from './helpers'

const WORKER_URL = 'http://sync.invalid'
const CODE = 'ABCDEFGH'

function mockGrid(id: string, title: string) {
  return {
    id,
    title,
    size: 3,
    freeCenter: false,
    items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    cells: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((label) => ({
      label,
      free: false,
      marked: false,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/** Simule le worker de synchro en mémoire pour la durée d'un test : suit un
 * unique code, avec la même écriture optimiste par numéro de version que le
 * vrai service (voir worker/src/index.ts). */
async function mockWorker(page: Page, initial: { version: number; grids: unknown[] } | null = null) {
  let stored = initial
  // `context.setOffline` ne coupe pas les requêtes déjà interceptées par
  // `page.route` (elles sont servies localement, jamais envoyées sur le
  // réseau) : simuler une coupure du worker passe donc par ce drapeau,
  // vérifié explicitement dans les deux handlers ci-dessous plutôt que par
  // le mode hors-ligne du navigateur.
  let offline = false

  await page.route(`${WORKER_URL}/api/sync`, async (route: Route) => {
    if (offline) return route.abort('internetdisconnected')
    if (route.request().method() !== 'POST') return route.continue()
    stored = { version: 0, grids: [] }
    await route.fulfill({ status: 201, json: { code: CODE } })
  })

  await page.route(`${WORKER_URL}/api/sync/${CODE}`, async (route: Route) => {
    if (offline) return route.abort('internetdisconnected')
    const method = route.request().method()
    if (method === 'GET') {
      if (stored === null) return route.fulfill({ status: 404, json: { error: 'Code inconnu.' } })
      return route.fulfill({ status: 200, json: stored })
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as { baseVersion: number; grids: unknown[] }
      const currentVersion = stored?.version ?? 0
      if (body.baseVersion !== currentVersion) {
        return route.fulfill({ status: 409, json: stored ?? { version: 0, grids: [] } })
      }
      stored = { version: currentVersion + 1, grids: body.grids }
      return route.fulfill({ status: 200, json: stored })
    }
    return route.continue()
  })

  return {
    get current() {
      return stored
    },
    setOffline(value: boolean) {
      offline = value
    },
    /** Simule une écriture faite par un autre appareil, en dehors de toute
     * requête de la page testée (contourne le routage `page.route`). */
    setStored(value: { version: number; grids: unknown[] } | null) {
      stored = value
    },
  }
}

test.describe('Synchronisation via code (worker)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page)
  })

  test('crée un code, l’affiche formaté et pousse les grilles actuelles', async ({ page }) => {
    const worker = await mockWorker(page)
    await createGrid(page, { title: 'À synchroniser', items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })

    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Nouveau code' }).click()

    await expect(page.getByText('ABCD EFGH')).toBeVisible()
    await expect(page.getByText('Synchronisé ✓')).toBeVisible()
    expect(worker.current?.grids).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'À synchroniser' })])
    )
  })

  test('rejoint un code existant sans grille locale (sans confirmation) et affiche les grilles distantes', async ({
    page,
  }) => {
    await mockWorker(page, { version: 1, grids: [mockGrid('x', 'Depuis un autre appareil')] })

    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Saisir un code' }).click()
    await page.getByPlaceholder('XXXX XXXX').fill(CODE)
    await page.getByRole('button', { name: 'Rejoindre' }).click()

    await expect(page.getByText('ABCD EFGH')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByText('Depuis un autre appareil', { exact: true })).toBeVisible()
  })

  test('signale un code introuvable', async ({ page }) => {
    await mockWorker(page, null)
    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Saisir un code' }).click()
    await page.getByPlaceholder('XXXX XXXX').fill(CODE)
    await page.getByRole('button', { name: 'Rejoindre' }).click()

    await expect(page.getByText('Ce code de synchronisation est introuvable.')).toBeVisible()
  })

  test('se déconnecte et retrouve les boutons de création/adhésion', async ({ page }) => {
    await mockWorker(page)
    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Nouveau code' }).click()
    await expect(page.getByText('ABCD EFGH')).toBeVisible()

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page.getByText('ABCD EFGH')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Nouveau code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Saisir un code' })).toBeVisible()
  })

  test('signale une erreur sans planter quand le worker devient injoignable, puis reprend au retour', async ({
    page,
  }) => {
    const worker = await mockWorker(page)
    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Nouveau code' }).click()
    await expect(page.getByText('Synchronisé ✓')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()

    worker.setOffline(true)
    // Modifie une grille pendant la coupure : la poussée différée doit
    // échouer proprement (statut d'erreur) plutôt que de planter l'app.
    await createGrid(page, { title: 'Hors ligne', items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })

    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await expect(page.getByText('Erreur de synchronisation')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()

    worker.setOffline(false)
    // Un nouveau changement local relance une poussée sans attendre le
    // prochain sondage périodique (jusqu'à 20 s) : reprise plus rapide et
    // plus déterministe pour le test.
    await page.locator('.grid-item').first().locator('.cell').first().click()

    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await expect(page.getByText('Synchronisé ✓')).toBeVisible({ timeout: 10_000 })
  })

  test('affiche une notification quand des grilles arrivent d’un autre appareil', async ({ page }) => {
    const worker = await mockWorker(page, { version: 1, grids: [mockGrid('a', 'Grille 1')] })
    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Saisir un code' }).click()
    await page.getByPlaceholder('XXXX XXXX').fill(CODE)
    await page.getByRole('button', { name: 'Rejoindre' }).click()
    await expect(page.getByText('ABCD EFGH')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()

    // Simule un autre appareil qui pousse une modification pendant que cette
    // page est déjà synchronisée : la prochaine modification locale se fera
    // rejeter (baseVersion périmé) et adoptera cette version-ci.
    worker.setStored({ version: 2, grids: [mockGrid('a', 'Depuis un autre appareil')] })
    await page.locator('.grid-item').first().locator('.cell').first().click()

    await expect(page.getByText('Grilles mises à jour depuis un autre appareil')).toBeVisible()
    await expect(page.getByText('Depuis un autre appareil', { exact: true })).toBeVisible()
    expect(worker.current?.version).toBe(2)
  })

  test('affiche aussi la notification dès l’ouverture, sur un appareil déjà relié à un code', async ({ page }) => {
    const worker = await mockWorker(page, { version: 3, grids: [mockGrid('a', 'Depuis le cloud')] })
    // Simule un appareil déjà configuré (code enregistré depuis une session
    // précédente), rouvert : le tout premier sondage au montage doit lui
    // aussi être signalé, pas seulement les sondages suivants — sinon
    // rouvrir l'app ne confirme jamais que la récupération a bien eu lieu.
    await page.evaluate((code) => window.localStorage.setItem('bingo.sync.code.v1', JSON.stringify(code)), CODE)
    await page.reload()

    await expect(page.getByText('Grilles mises à jour depuis un autre appareil')).toBeVisible()
    await expect(page.getByText('Depuis le cloud', { exact: true })).toBeVisible()
    expect(worker.current?.version).toBe(3)
  })

  test("ne réaffiche pas la notification en rechargeant la page sur l'appareil qui vient lui-même de pousser en dernier", async ({
    page,
  }) => {
    await mockWorker(page)
    await createGrid(page, { title: 'Ma grille', items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })
    await openMenu(page)
    await page.getByRole('button', { name: 'Synchroniser mes grilles' }).click()
    await page.getByRole('button', { name: 'Nouveau code' }).click()
    await expect(page.getByText('Synchronisé ✓')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()

    // Recharge sans qu'aucun autre appareil n'ait rien poussé entre-temps :
    // la version distante au premier sondage après rechargement est
    // exactement celle que cet appareil a lui-même écrite en dernier.
    await page.reload()
    // Laisse le temps au premier sondage après rechargement de se terminer
    // (réponse quasi instantanée, simulée) avant de vérifier l'absence de
    // notification.
    await page.waitForTimeout(500)
    await expect(page.getByText('Grilles mises à jour depuis un autre appareil')).not.toBeVisible()
  })
})
