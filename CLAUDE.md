# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Quine (GitHub repo: `RenaudDouze/Quine`) is a PWA for playing bingo with custom
grids: a user types their own list of phrases/words, generates a 3×3, 4×4 or
5×5 grid from them, and plays by clicking cells to mark them — a win (line,
blackout, or corners, configurable) is detected automatically. Grids persist
in `localStorage` and the app works fully offline; the only feature that
talks to the network is optional cross-device sync via a small companion
Cloudflare Worker (`worker/`), which stays completely inert until
`VITE_SYNC_WORKER_URL` is set at build time.

UI copy, code comments, and commit messages in this repo are in French.

## Commands

```bash
npm run dev            # dev server
npm run build           # tsc -b && vite build (production build to dist/)
npm run preview         # serve the production build locally

npm run lint            # oxlint --deny-warnings
npm run typecheck       # tsc -b

npm test                # vitest run
npm run test:watch      # vitest, watch mode
npm run test:coverage   # vitest run --coverage (100% thresholds enforced, see below)
npm run test:e2e        # playwright test (chromium + mobile-chrome projects)
npm run test:mutation   # stryker run (mutation testing, src/lib/*.ts only, see below)
```

Run a single unit test file: `npx vitest run src/lib/bingo.test.ts`. Run a
single Playwright spec: `npx playwright test e2e/organize.spec.ts`.

The `worker/` directory is a **separate npm project** (its own
`package.json`/`package-lock.json`/`tsconfig.json`, deliberately not sharing
code with the app — see the comment at the top of `src/lib/remoteSync.ts`).
Its commands run from inside `worker/`: `npm test`, `npm run typecheck`,
`npm run dev` (wrangler dev), `npm run deploy` (wrangler deploy).

## Non-negotiable quality bars

- **100% code coverage** (statements/branches/functions/lines) is enforced by
  `vitest.config.ts` on all of `src/**/*.{ts,tsx}` (excluding `main.tsx`,
  `vite-env.d.ts`, `src/test/**`). `npm run test:coverage` fails the build
  otherwise. This is also the "Tests unitaires + couverture" CI job.
- **100% mutation score** is enforced by `stryker.config.json`, but only for
  the pure-logic files listed under `mutate` (currently `src/lib/bingo.ts`,
  `share.ts`, `colors.ts`, `url.ts`, `download.ts`, `gridImage.ts`,
  `print.ts`, `remoteSync.ts`, `pdfExport.ts`). Component/CSS-only changes
  don't affect this score; a new pure-logic file should be added to that
  list. Where a mutant is truly behaviorally equivalent, it's suppressed
  inline with a `// Stryker disable next-line <MutatorName>: <reasoning>`
  comment rather than a weaker test — see existing examples in
  `src/lib/bingo.ts` and `gridImage.ts` for the expected style.
- `oxlint --deny-warnings` and `tsc -b` must both be clean.
- All six CI jobs (lint, typecheck, unit tests + coverage, Playwright e2e,
  mutation testing, dependency audit) plus a separate `worker/` job
  (typecheck + tests + its own `npm audit`) run on every PR and push to
  `main`, defined in `.github/workflows/ci.yml`.
- **`typescript` is pinned to `~6.0.2` and `vitest`/`@vitest/coverage-v8` are
  pinned to `^4.1.11`, deliberately behind their latest majors** — both were
  tried and reverted because they break the Stryker mutation-testing
  pipeline: TypeScript 7 removes the compiler API
  (`ts.parseConfigFileTextToJson`) that `@stryker-mutator/core`'s
  `ts-config-preprocessor` depends on, crashing `stryker run` outright;
  Vitest 5 passes every other check (lint, typecheck, tests, e2e, build)
  but silently collapses the mutation score from 100% to ~3% —
  `@stryker-mutator/vitest-runner`'s test-attribution logic doesn't work
  correctly under Vitest 5, despite its permissive `vitest: >=2.0.0` peer
  dependency. Don't bump either without re-verifying `npm run test:mutation`
  stays at 100%, not just that the other checks pass. Also: a bare `npm
  update`/`npm install` can crash with a known npm 10.9.7 Arborist resolver
  bug on this peer-dependency shape (`Cannot read properties of null
  (reading 'edgesOut')`); update dependencies via targeted
  `npm install <pkg>@<version>` calls instead, and never commit a lockfile
  produced with `--legacy-peer-deps` (it's incompatible with `npm ci`).

## Architecture

### Routing

There's no router library. `useHashRoute` (`src/hooks/useHashRoute.ts`) reads
`window.location.hash`; `App.tsx` renders `EditorView` when the hash is
`#editor`, otherwise `HomeView`. `navigate(name)` sets the hash to switch
views.

### Data model and persistence

Everything revolves around the `Grid` type in `src/lib/bingo.ts` (id, title,
size, freeCenter, items, cells, timestamps, plus optional `color`,
`backgroundImageUrl`, `pinned`, `archived`, `winRule`). Grids are stored as a
single JSON array in `localStorage` under the key `bingo.grids.v1` via
`src/lib/storage.ts` (`loadGrids`/`saveGrids`). `HomeView` loads them once at
mount into React state and is the single source of truth for all mutations;
every mutation flows through its `persist(next: Grid[])`, which writes to
storage and updates state together. Grid-scoped operations funnel through
`updateGridById`/`patchGrid` helpers in `HomeView.tsx` rather than repeating
the `grids.map(...)` pattern.

Grid win logic (`checkWin`, `buildCells`, `shuffle`, `neededCount`,
`sortByPinned`, `matchesSearch`) lives in `src/lib/bingo.ts` as pure,
side-effect-free functions — this is why it's a Stryker mutation target.
`buildCells` shuffles the *entire* items array before slicing the amount
needed, so a grid with more items than cells draws a genuinely random subset
each time (not just the first N).

### Untrusted data enters through three surfaces, not one

A `Grid`'s `color` and `backgroundImageUrl` are only guaranteed well-formed
(6-digit hex / http(s) URL) when set through `CustomizeModal`'s own inputs.
Grids can also arrive via JSON backup import, a share link/QR code, or remote
sync — none of which are validated at the point of storage. Consequently
`isValidHexColor` (`colors.ts`) and `isValidImageUrl` (`url.ts`) are each
re-checked independently at **every point of use**: `GridCard.tsx` (before
using as inline CSS/background-image), `gridImage.ts` (before interpolating
into a raw SVG attribute — this is what prevents SVG injection), and
`share.ts`'s `normalizeGrid` (defense in depth on import). When adding a new
field that gets rendered from untrusted grid data, follow this same
validate-at-each-use-site pattern rather than trusting a single import-time
check.

### Sharing, backup, and remote sync (`src/lib/share.ts`, `remoteSync.ts`, `hooks/useRemoteSync.ts`)

Three distinct mechanisms, don't conflate them:

- **JSON backup** (`downloadBackup`/`parseBackupJson`): full fidelity,
  includes checked/unchecked state, all grids, no size limit — for restoring
  everything on a new device.
- **Share link/QR** (`encodeGridsToParam`/`decodeGridsFromParam`,
  `buildShareUrl`): a compact `CompactGrid` shape base64url-encoded into a
  URL's `?import=` param. Deliberately excludes checked state (recipient gets
  a fresh, reshuffled grid) and excludes `pinned`/`archived` (sender-only
  list organization, meaningless to a recipient). `App.tsx` auto-imports on
  load if `?import=` is present.
- **Cross-device sync** (`useRemoteSync` + the Cloudflare Worker in
  `worker/`): opt-in via an 8-character code, polls every 20s
  (`POLL_INTERVAL_MS`), pushes local changes debounced 5s
  (`PUSH_DEBOUNCE_MS`) to stay well under Cloudflare KV's free-tier
  1000-writes/day cap. Conflict resolution is optimistic concurrency by
  integer `version` (never a timestamp — client clocks aren't trusted to be
  synchronized; see the extensive comments in `remoteSync.ts` and
  `worker/src/index.ts`), not last-write-wins by wall-clock time. A losing
  push (`409`) adopts the server's version rather than retrying blindly.
  There's intentionally no rate-limiting in the worker (tried and reverted —
  see `worker/README.md` and the comment above `MAX_BODY_BYTES` in
  `worker/src/index.ts`); don't reintroduce IP-based limiting without
  re-reading why it was removed.

### Batch card generation and PDF export (`generateCardVariants` in `bingo.ts`, `src/lib/pdfExport.ts`)

For a group playing from the same grid, each player needs a distinct shuffle
of the same word pool rather than one shared card. `generateCardVariants(grid,
count)` produces `count` independent `Grid`s by re-running `buildCells` on the
same `items`/`size`/`freeCenter` — each call reshuffles from scratch, so
variants are genuinely distinct draws, not just relabeled copies.
`pdfExport.ts` renders those variants into a single multi-page A4 PDF (one
card per page) via `jsPDF`, loaded with a dynamic `import("jspdf")` so its
~130KB stays in its own chunk and never touches the main bundle. Deliberately
*not* built by rasterizing `buildGridSvg`'s output: that SVG uses
`<foreignObject>` for text layout, which doesn't render reliably once loaded
into a `<canvas>` for rasterization. Instead `pdfExport.ts` draws with jsPDF's
native vector primitives, and — matching the pattern used everywhere else in
this codebase for mutation-testability — separates pure geometry/color
computation (`computeBoardLayout`, `computeCellLayout`,
`computeLineYPositions`, exhaustively unit-tested with exact-value
assertions) from the thin, mostly-untestable-by-mutation jsPDF orchestration
in `drawGridPage`/`exportGridsAsPdf`. Reuses `DEFAULT_ACCENT`,
`FREE_CELL_TINT_RATIO`, and the `hexToRgb`/`tintWithWhite` color helpers
exported from `colors.ts`/`gridImage.ts` so the PDF and SVG exports render
grids identically. Wired into `ShareModal.tsx`'s single-grid share section
("Plusieurs cartes (PDF)"), 2–100 cards.

### Components vs. views

`GridForm` (`src/components/GridForm.tsx`) is the shared create/edit form
used by both `EditorView` (creation, wraps in a page) and `EditModal`
(editing, wraps in a modal) — it does not include the title field (that's
`CustomizeModal`'s job, matching the sibling `+1` project's convention
referenced throughout the comments). A change to shared create/edit behavior
almost always belongs in `GridForm.tsx`, not duplicated in both callers.

`GridCard.tsx` renders one grid's board, win banner, and confetti
celebration; it distinguishes "banner became visible" (celebrate once) from
"banner is visible" (state on remount) via a ref tracking the previous value
— replicate that pattern rather than deriving celebration from render state
directly if you touch this logic, since React 19/StrictMode can commit
renders that were started then abandoned.

`ShareModal` is lazy-loaded (`lazy(() => import(...))`) because it pulls in
the `qrcode` dependency and is reused for both "share one grid" and
"synchronize all my grids" (the `remoteSync` prop is only passed for the
latter). Every lazy-loaded or otherwise crash-prone modal in `HomeView.tsx`
is wrapped in `ErrorBoundary` with a `modalCrashFallback(...)` — distinguish
a chunk-load failure (stale deploy, `CHUNK_LOAD_FAILED_MESSAGE`) from a
generic render crash (`MODAL_CRASH_MESSAGE`) when adding a new one.

### Destructive-action UX pattern

Deleting a grid uses "click-to-arm" confirmation (first click arms the
button and swaps its label/icon for ~2.5s, second click within that window
confirms) rather than `window.confirm()` — see `CustomizeModal.tsx`'s
`handleDeleteClick`. Less severe actions (reshuffle, reset checks) still use
a blocking `window.confirm()`. Follow whichever pattern matches the severity
of a new destructive action, matching the sibling `+1` project's convention.

### Accessibility

`useFocusTrap` (`src/hooks/useFocusTrap.ts`) is applied to every modal panel
(`role="dialog"`, focus trapped and restored on close). Grid cells use
`aria-pressed` for marked state and are `disabled` (not just visually inert)
when free/locked. The win banner is `role="status"`. Keep this in mind when
adding new modals or interactive controls.

### Test conventions

- Unit/component tests are colocated as `*.test.ts(x)` next to their source
  file, using Vitest + `@testing-library/react`.
- `e2e/` holds Playwright specs; `e2e/helpers.ts` has shared setup. Tests run
  against `chromium` and `mobile-chrome` (Pixel 7) projects, built with a
  fake `VITE_SYNC_WORKER_URL=http://sync.invalid` so the sync UI is present
  and network calls are intercepted via `page.route` rather than hitting a
  real worker.
- When changing anything under `src/lib/*.ts` that's in Stryker's `mutate`
  list, expect to need both a coverage-satisfying test *and* a
  mutation-killing one — they're not always the same test.
