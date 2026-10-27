# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server (open the printed localhost URL)
npm run build        # tsc (typecheck, strict) + vite build → dist/
npm run preview      # serve the production build
npm run cap:sync     # build web bundle + copy into native projects
npm run cap:android  # build + sync + open Android Studio
npm run cap:ios      # build + sync + open Xcode
```

There is no test runner or linter configured. `npm run build` is the only
verification gate — it runs `tsc` in strict mode, so a clean build means the
types and bundle are good. There is no browser in the container, so changes
cannot be live click-tested here; rely on the build and on the user running
`npm run dev` on the host.

Native projects (`android/`, `ios/`) are gitignored and generated on the host
with `npx cap add android|ios`. Capacitor commands and Docker are not available
in the container (see global instructions) — the user runs those.

## Architecture

A single-screen Phaser 3 game wrapped by Vite/TypeScript and Capacitor. App id
`fi.subsite.boatgame`. The audience is **kids with disabilities**, so every
design choice favors accessibility and clarity over richness — keep that lens
when changing anything.

- `src/main.ts` — Phaser.Game bootstrap. Fixed logical resolution
  `GAME_WIDTH × GAME_HEIGHT` with `Scale.FIT` + `CENTER_BOTH`. World gravity is
  zero; the boat manages its own gravity. One scene: `GameScene`.
- `src/config.ts` — all layout and gameplay tuning constants. The play area is
  `PLAY_HEIGHT` (everything above the bottom `PANEL_HEIGHT` deck). Tune feel here
  (`SCROLL_SPEED`, `SPAWN_DELAY`, `GRAVITY`, `THRUST`, `MAX_FALL`,
  `SPAWN_MIN_Y/MAX_Y`) rather than scattering magic numbers in the scene.
- `src/textures.ts` — **all artwork is generated procedurally at runtime** via
  `Graphics.generateTexture` (keys: `boat`, `wheel`, `rock_island`,
  `lighthouse`, `rowboat`, `wave`). There are no binary asset files by design —
  add new art as a `make(...)` block here, not as an image import.
- `src/scenes/GameScene.ts` — the whole game.

### GameScene model

- **State machine**: `"ready" | "playing" | "over"`. `enterReady` /
  `startGame` / `endGame` transition it; `update()` branches on it.
- **One control**: the entire bottom deck is a single interactive zone (the
  steering wheel is just its art). Hold = thrust up, release = sink. Space/Enter
  mirror it for assistive switches. All input funnels through `press()`, which
  starts the game from `ready` and restarts from `over` (gated by `canRestart`
  so a death-tap doesn't instantly restart).
- **Boat physics**: gravity is enabled only while `playing`. `setAccelerationY`
  toggles between `-THRUST` (held) and `0`. `setMaxVelocity` clamps fall speed
  so motion stays readable; angle is derived from velocity for feedback.
- **Obstacles** are free-floating (passable above *or* below — not
  flappy-style edge-connected pipes). Spawned by a looping timer at a random Y,
  scrolling left at `SCROLL_SPEED`, immovable, no gravity. Each type
  (`rock`/`lighthouse`/`rowboat`) sets a **hitbox smaller than its art** for
  forgiving collisions. Scoring/culling happens in `updateScoreAndCull`.
- **Accessibility invariants to preserve**: single large fixed-position control;
  hold-to-rise (no timing precision); forgiving sub-art hitboxes; gentle speeds;
  no flashing; big high-contrast score/messages. The boat clamps to play-area
  edges (`setCollideWorldBounds`) — touching an edge never kills you; only an
  obstacle does. On death the bounds expand to the full screen so the boat
  sinks behind the deck.

### Restart gotcha

`scene.restart()` re-runs `create()` but **not** field initializers, so any
per-run state must be reset at the top of `create()` (currently `ripples`,
`held`, `canRestart`, `score`). Add new mutable run-state to that reset block.
