// Pose le thème avant le premier rendu, pour éviter un flash du thème
// clair par défaut le temps que React s'hydrate. Miroir de la logique
// de src/App.tsx (clé de stockage et repli sur la préférence système).
// Fichier externe (plutôt qu'un <script> inline dans index.html) pour que
// la CSP de la page puisse garder script-src 'self' sans 'unsafe-inline'.
;(function () {
  try {
    var stored = localStorage.getItem('bingo.theme.v1')
    var pref = stored ? JSON.parse(stored) : 'system'
    var theme =
      pref === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : pref
    document.documentElement.dataset.theme = theme
  } catch {
    // stockage indisponible : reste sur le thème clair par défaut.
  }
})()
