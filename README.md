# Bingo

PWA de bingo à grilles personnalisées : créez une grille (3×3, 4×4 ou 5×5) à
partir de vos propres phrases ou mots, jouez en cochant les cases, et
détectez automatiquement le bingo (ligne, colonne ou diagonale). Les grilles
sont sauvegardées localement (`localStorage`) et l'application est
installable et utilisable hors ligne — la synchronisation entre appareils
(optionnelle) est le seul point qui parle au réseau.

## Synchronisation entre appareils

Code de synchronisation à 8 caractères (optionnel, nécessite un petit worker
Cloudflare — voir `worker/README.md`) : synchronise automatiquement les
grilles entre plusieurs appareils en tâche de fond, avec notification quand
des changements arrivent d'un autre appareil. Générable depuis la modale
« Synchroniser mes grilles » (menu ⋯ de l'accueil). Absent tant que
`VITE_SYNC_WORKER_URL` n'est pas défini au build : la section reste masquée
et l'app n'effectue aucun appel réseau.

## Stack

React + TypeScript + Vite, PWA via [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/).

## Scripts

```bash
npm install       # installe les dépendances
npm run dev       # serveur de développement
npm run build     # build de production (dist/)
npm run preview   # sert le build de production localement

npm run lint       # oxlint
npm run typecheck  # tsc -b

npm test              # tests unitaires (Vitest)
npm run test:watch    # idem, en mode watch
npm run test:coverage # tests unitaires + rapport de couverture
npm run test:e2e      # tests fonctionnels (Playwright)
npm run test:mutation # mutation testing (Stryker) sur la logique pure (src/lib/*.ts)
```

## CI

`.github/workflows/ci.yml` exécute lint, typecheck, tests unitaires
(couverture), tests e2e, mutation testing, tests du worker de synchro et
build sur chaque PR et push sur `main`. `.github/workflows/deploy.yml`
déploie le build sur GitHub Pages à chaque push sur `main` (variable
d'environnement `VITE_SYNC_WORKER_URL`, non secrète, à régler dans Settings
→ Secrets and variables → Actions → Variables une fois le worker déployé).
`.github/workflows/worker-deploy.yml` déploie le worker de synchro
Cloudflare à chaque changement sous `worker/` poussé sur `main` (voir
`worker/README.md` pour la configuration initiale et les secrets requis).
