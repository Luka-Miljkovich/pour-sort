# Pour — colour sort puzzle

An offline, installable pour-sort puzzle for iPhone. Vanilla TypeScript and Vite, no backend, and no runtime dependencies.

## Rules

- Each bottle holds 4 units.
- Tap a bottle to pick it up, then tap a target. Tap the same bottle again to put it down.
- You can pour only into an empty bottle, or onto the same top colour when there is space.
- All matching top units pour together, as many as fit.
- You win when every bottle is empty or full of a single colour.
- **Helpers:** 5 undos per level, restart, and one extra empty bottle per level. Restart refills the undos and gives the extra bottle back.
- When no useful pour is left, or the solver proves the position can't be solved any more, a sheet offers Undo / Extra bottle / Restart.

## Levels and difficulty

Every level comes from a seed derived from its number, so level *N* is always identical. Generation (`src/gen/generator.ts`):

1. Deal 10 random candidate boards for the level's colour count.
2. Keep only the ones the solver (weighted A*, `src/gen/solver.ts`) actually solves.
3. Score each one with **solution length + 30 × dead-end rate + 0.8 × branching**:
   - *Dead-end rate* is the share of alternative moves along the solution that lead to a position the solver can't finish.
   - *Branching* is the average number of useful moves available along the solution.
4. Pick the candidate at a target percentile. The percentile rises across each colour tier.

| Levels  | Colours |
|---------|---------|
| 1–15    | 7       |
| 16–35   | 8       |
| 36–60   | 9       |
| 61–90   | 10      |
| 91–125  | 11      |
| 126+    | 12      |

There are always 2 empty bottles to start. From level 40, every third level hides all but the top layer of each bottle. A hidden layer is revealed when it reaches the top.

Generation runs in a **Web Worker**, and the next level is generated while you play the current one.

## Saving

After every move the app writes to `localStorage` (`poursort.save`):

- the level
- the exact board, including hidden layers
- the undo history
- remaining undos and the extra bottle
- the move count, won state and settings

Reopening the app resumes exactly there.

The save format carries a version `v`. `src/save/save.ts` upgrades old saves step by step through `MIGRATIONS`. If a save can't be read, it is copied to a backup key rather than deleted.

Changing the generator only changes levels you haven't started yet. A level in progress keeps its own stored board.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173 (also on your LAN)
npm test               # rules, win detection, game actions, save/load, generator
npm run verify-levels  # levels 1–200: solvable, deterministic, difficulty rises (~80 s)
npm run build          # dist/ incl. generated service worker
npm run icons          # re-render icons (needs Playwright)
```

Pushing to `main` runs the tests and level verification, builds, and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Install on iPhone (Add to Home Screen)

1. Open the game's URL in **Safari**. Other browsers on iOS can't install web apps with offline support in the same way.
2. Tap the **Share** button: the square with an arrow pointing up. It's in the bottom toolbar, or behind the **⋯** menu on iOS 26.
3. Scroll down and tap **Add to Home Screen**.
4. Leave **Open as Web App** switched on if you see it, keep the name "Pour" (or rename it), and tap **Add**.
5. Launch **Pour** from your Home Screen. It opens full screen with no Safari bars.
6. Play one level while online. After that, every file is cached and the game works fully offline, including Airplane Mode.

Updates install in the background. A new version takes effect the next time you fully close the app (swipe it away) and reopen it. Your progress is kept.

## Project layout

```
src/core/     board rules, game actions, seeded RNG (pure, tested)
src/gen/      solver, generator, dead-end analysis, Web Worker + client
src/save/     versioned persistence + migrations
src/ui/       app controller, layout, palette/symbols, sound, icons
sw/           service worker template (precache list injected at build)
scripts/      verify-levels.ts, make-icons.mjs
tests/        vitest suites
```
