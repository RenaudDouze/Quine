// Chaque module est associé aux seuls fichiers de test capables de tuer ses
// mutants : la CI lance un job par module (variable MUTATE, voir
// .github/scripts/mutation-matrix.mjs) et le runner « command » ne relance que
// ces tests-là pour chaque mutant. Relancer les 10 fichiers de test pour
// chaque mutant coûtait ~30 min ; un seul fichier par mutant, réparti sur
// des jobs parallèles, en coûte ~3.
//
// Tout `src/` est muté, sauf deux exclusions assumées : `main.tsx` (simple
// point d'entrée, exclu aussi de la couverture) et `components/icons.tsx`
// (pictogrammes SVG statiques, sans logique à tuer).
export const targets = {
  'src/lib/bingo.ts': ['src/lib/bingo.test.ts'],
  'src/lib/share.ts': ['src/lib/share.test.ts'],
  'src/lib/colors.ts': ['src/lib/colors.test.ts'],
  'src/lib/url.ts': ['src/lib/url.test.ts'],
  'src/lib/download.ts': ['src/lib/download.test.ts'],
  'src/lib/gridImage.ts': ['src/lib/gridImage.test.ts'],
  'src/lib/print.ts': ['src/lib/print.test.ts'],
  'src/lib/remoteSync.ts': ['src/lib/remoteSync.test.ts'],
  'src/lib/pdfExport.ts': ['src/lib/pdfExport.test.ts'],
  'src/lib/reorder.ts': ['src/lib/reorder.test.ts'],
  'src/lib/storage.ts': ['src/lib/storage.test.ts'],
  'src/hooks/useFocusTrap.ts': ['src/hooks/useFocusTrap.test.tsx'],
  'src/hooks/useHashRoute.ts': ['src/hooks/useHashRoute.test.tsx'],
  'src/hooks/useLocalStorage.ts': ['src/hooks/useLocalStorage.test.ts'],
  'src/hooks/useRemoteSync.ts': ['src/hooks/useRemoteSync.test.ts'],
  'src/hooks/useSystemDarkMode.ts': ['src/hooks/useSystemDarkMode.test.ts'],
  'src/components/ErrorBoundary.tsx': ['src/components/ErrorBoundary.test.tsx'],
  'src/components/EditModal.tsx': ['src/components/EditModal.test.tsx'],
  'src/components/GridForm.tsx': ['src/components/GridForm.test.tsx'],
  'src/components/GridCard.tsx': ['src/components/GridCard.test.tsx'],
  'src/components/CustomizeModal.tsx': ['src/components/CustomizeModal.test.tsx'],
  'src/components/ShareModal.tsx': ['src/components/ShareModal.test.tsx'],
  'src/views/EditorView.tsx': ['src/views/EditorView.test.tsx'],
  // HomeView.tsx est découpé en plages de lignes : un job CI par plage.
  'src/views/HomeView.tsx:1-220': ['src/views/HomeView.test.tsx'],
  'src/views/HomeView.tsx:221-420': ['src/views/HomeView.test.tsx'],
  'src/views/HomeView.tsx:421-700': ['src/views/HomeView.test.tsx'],
  'src/App.tsx': ['src/App.test.tsx'],
};

const selected = process.env.MUTATE ? process.env.MUTATE.split(',') : Object.keys(targets);
for (const file of selected) {
  if (!targets[file]) throw new Error(`MUTATE : module inconnu ${file}`);
}
const tests = [...new Set(selected.flatMap((file) => targets[file]))];

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  // Le testRunner "vitest" officiel (@stryker-mutator/vitest-runner) ne
  // rattache plus correctement les tests exécutés à chaque mutant sous
  // Vitest 5 (testsCompleted: 0 dans son propre rapport JSON pour tout
  // mutant non "statique") : chaque mutant survit par défaut, faute de test
  // réellement exécuté contre lui — un score qui s'effondre de 100% à ~3%
  // sans qu'aucune autre vérification (lint/typecheck/tests/e2e/build) ne le
  // signale. Le testRunner "command" (relance `vitest run` en sous-processus
  // par mutant, sans passer par l'API interne de Vitest) contourne entièrement
  // cette intégration cassée. Voir CLAUDE.md.
  testRunner: "command",
  commandRunner: { command: `npx vitest run ${tests.join(' ')}` },
  // Le testRunner "command" ne peut pas faire d'analyse de couverture fine
  // (il ne fait que lancer une commande et lire son code de sortie) : chaque
  // mutant relance donc toute la liste de commandRunner.command ci-dessus.
  coverageAnalysis: "off",
  // Les tests de ce projet tournent sous jsdom (app React), contrairement
  // aux projets voisins vanilla-TS (environment "node", bien plus léger) qui
  // ont inspiré ce même testRunner "command" : le délai calculé par défaut à
  // partir du dry run (basé sur une seule exécution, sans contention) sous-
  // estime largement le temps réel une fois plusieurs mutants testés en
  // parallèle (plusieurs instances jsdom se créent concurremment, voir
  // l'avertissement de performance affiché par `npm run test:coverage`) —
  // sans ce délai explicite généreux, la plupart des mutants finissent
  // "timed out" plutôt que tués, faussant complètement le score. `concurrency`
  // abaissé pour la même raison : moins de contention CPU entre les
  // instances jsdom simultanées, au prix d'un temps total plus long.
  timeoutMS: 60_000,
  concurrency: 4,
  // Stryker réécrit par défaut tsconfig.json (extends/references) pour son
  // bac à sable, via `ts.parseConfigFileTextToJson` — une fonction retirée
  // dans TypeScript 7, ce qui fait planter Stryker avant même de lancer un
  // test. Le testRunner "command" ne dépend d'aucune vérification de type
  // par Stryker (juste vitest), donc aucun tsconfig n'est réellement
  // nécessaire ici : pointer vers un fichier volontairement inexistant fait
  // sauter cette réécriture (Stryker l'ignore silencieusement quand le
  // fichier ne fait pas partie du projet).
  tsconfigFile: "tsconfig.stryker-unused.json",
  reporters: ["html", "clear-text", "progress"],
  mutate: selected,
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
};
