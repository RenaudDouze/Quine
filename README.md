# Bingo

PWA de bingo à grilles personnalisées : créez une grille (3×3, 4×4 ou 5×5) à
partir de vos propres phrases ou mots, jouez en cochant les cases, et
détectez automatiquement le bingo (ligne, colonne ou diagonale). Les grilles
sont sauvegardées localement (`localStorage`) et l'application est
installable et utilisable hors ligne.

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
npm run test:mutation # mutation testing (Stryker) sur la logique pure (src/lib/bingo.ts)
```

## CI

`.github/workflows/ci.yml` exécute lint, typecheck, tests unitaires
(couverture), tests e2e, mutation testing et build sur chaque PR et push sur
`main`. `.github/workflows/deploy.yml` déploie le build sur GitHub Pages à
chaque push sur `main`.
