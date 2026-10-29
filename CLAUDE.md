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
with `npx cap add android|ios`. Release APKs are built by
`.github/workflows/release.yml` on pushing a `vX.Y.Z` tag (`npm run release
[patch|minor|major|vX.Y.Z]` → `scripts/release.sh` picks the next tag and
pushes main + tag; the user runs it on the host): it runs
`npx cap add android` itself, copies the app icon from `resources/android/res/`
over it (`npm run cap:icons` does the same on the host), stamps versionCode/versionName into the
generated `build.gradle`, and signs with keystore secrets (see README). Capacitor commands and Docker are not available
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
  (`SCROLL_SPEED`, `*_SPEED`, `SPAWN_DELAY`, `MIN_SPAWN_GAP`, `FERRY_*`, `WIDE_*`, `OBJECT_SCALE`, `GRAVITY`, `THRUST`, `MAX_FALL`,
  `SPAWN_MIN_Y/MAX_Y`) rather than scattering magic numbers in the scene.
- `src/textures.ts` — **all artwork is generated procedurally at runtime**,
  via `make(...)` (Graphics shapes) or `makeCanvas(...)` (per-pixel, used for
  the tileable `sea` / `sea_sheen` and the `wave_N` froth patches). Keys: `wheel`, one
  per `ROCKS` entry (side-view granite skerries and spruce/pine islands of
  several sizes, weighted; `rockLayout` gives canvas size and waterline),
  `dash` (teak dashboard; instrument positions in `DASH_GAUGES`), `compass_card`, `compass_glass`, `rev_needle`, `droplet` (splash), `arrow_down`, `music_on`/`music_off`, `trophy`, `wave_0..N` (`FROTH_VARIANTS`),
  `sea`, `sea_sheen`,
  `foam_ring`. Add new art
  here, not as an image import. The one exception is the player boat,
  `inbox/falko-cut.png` (hand-cut at the waterline, mirrored with its name painted out into `public/falko_left.png`
  by `tools/art/mirror_falko.py`, loaded as the `falko` obstacle) and the ferry Utö,
  `public/ferry.png` (`ferry`; cleaned and downscaled from `inbox/uto2-left.png`
  with the mirrored lettering painted out), and `public/suomenlinna.png`
  (`suomenlinna`) and the player boats `public/vejde_right.png` (drawn tilted
  bow-up as if planing, with a captain) and `public/buster.png` (with a granny): flat schematics drawn with Pillow by the scripts in `tools/art/`
  from reference photos in `inbox/` (not committed). Re-render with those
  scripts rather than editing the PNGs; hitbox/stern offsets for each image
  are in `spawnObstacle`. The app icon (Android launcher mipmaps in
  `resources/android/res/`, favicon `public/icon.png`) is the Vejde on the
  game's sea, rendered by `tools/art/draw_icon.py`; re-run it after changing
  the Vejde or the default sea.
- **Sizes**: `OBJECT_SCALE` scales the player boat and every obstacle (art,
  hitbox, wake, splash), never the dashboard/wheel, which keep their size so
  the sea gets the space. Size-dependent offsets in the scene multiply by it,
  and spawn spacing in `config.ts` is scaled up alongside it.
- `src/sea.ts` — pure (Phaser-free) pixel generators for the sea tiles, in
  several styles (`SEA_STYLES`, default `DEFAULT_SEA` = `storybook_swell`: `baltic`, `calm`, `cartoon`, `toon`,
  `storybook` plus `storybook_day|swell|ink|sets|soft` variants from the
  parametric `brushPixels`; pick with `?sea=<key>`, previews in `inbox/sea-previews/`), built from seeded sums of sines with whole-number frequencies so
  they tile seamlessly. Being Phaser-free, they can be rendered to a PNG with
  `node --experimental-strip-types` to tune the look without a browser.
- `src/sfx.ts` — sound effects synthesised with WebAudio at play time
  (`playBloink` on scoring, `playSink` on crash, `playBoatHorn` toot on
  start and undock, `playShipHorn` when a big vessel appears, rate-limited); no audio files, same idea as
  the textures. Played via the scene's `audio()` helper, which respects mute.
- `src/music.ts` — background music: `public/music/song-N.mp3` played in
  order and looped via a plain `HTMLAudioElement` (streams; Phaser's WebAudio
  would decode whole songs into memory). Started from `press()` (needs a user
  gesture), module-level so it survives scene restarts, paused while the page
  is hidden. Idle states (ready/docked/over) call `musicIdle()`: after 30 s
  the music fades out and stops, and `musicActive()` (start/undock, or any
  press) restarts that song from the top. A top-right toggle (or M) mutes just the music; the choice is
  kept in localStorage. These MP3s are the other binary-asset exception besides
  the boat images.
- `src/scenes/GameScene.ts` — the whole game.

Append `?debug` to the URL (e.g. `http://localhost:5173/?debug`) to turn on
Arcade debug drawing of every hitbox.

**Hitbox gotcha:** Arcade `body.setSize`/`setOffset` take *source-frame* px and
scale them with the sprite. Scaled sprites (the boat, `setDisplaySize`) must
divide display-px values by `scaleX/scaleY`.

### GameScene model

- **State machine**: `"ready" | "playing" | "docked" | "over"`. `enterReady` /
  `startGame` / `dock` / `undock` / `endGame` transition it; `update()`
  branches on it.
- **Docking (pause)**: releasing the control while the boat rests on the
  bottom edge (`body.blocked.down`) docks it. `worldSpeed` (0..1) is tweened
  down/up on dock/undock and `applyWorldSpeed` drives everything from it each
  frame: sea drift, rock velocity, vessel velocity (own speed through the
  water + the water's drift, so they don't appear to speed up), the spawn
  timer's `timeScale`, and pushing the spawn plan back by the time lost.
  Vessels can't hit a docked boat and don't score. Any press undocks;
  obstacles still overlapping the boat are marked `ghost` so leaving the dock
  can't sink it.
- **One control**: the entire bottom deck is a single interactive zone (the
  steering wheel is just its art). Hold = thrust up, release = sink. Space/Enter
  mirror it for assistive switches. All input funnels through `press()`, which
  starts the game from `ready`, undocks from `docked` and restarts from `over` (gated by `canRestart`
  so a death-tap doesn't instantly restart).
- **High score**: one record per player boat (`bestFor(key)` / `saveBest`,
  localStorage `boatgame.bestByBoat` as JSON; the old single
  `boatgame.best` is migrated to the selected boat). Each picker card shows
  its boat's trophy + count; the top-left trophy pill shows the current
  boat's record on the game-over screen only. While playing, the live score
  turns gold once it passes the boat's record; `showMedal` saves a new
  record and shows a slowly turning golden starburst behind the medal.
- **Player boats**: `PLAYER_BOATS` lists the choosable boats
  (`vejde_right`, `buster`), each with its display width, hull hitbox and stern
  point in source-image px. `applyBoat` dresses the one sprite as the chosen
  boat (texture, scale, hitbox, world-bounds bottom from the art below the
  hitbox); `boatPoint` maps a source px point to world space (wake, splash,
  and the bow wave/spray drawn by `updateBowWave` from each boat's `bow`
  contact point). The Vejde's captain and the Buster's granny are part of
  their images (`tools/art`).
  The start ("ready") screen shows a card picker (tap or Left/Right); the
  choice is module-level plus localStorage, so it survives restarts — which
  return to the ready screen, so the picker also shows after sinking.
- **Boat physics**: gravity is enabled only while `playing`. `setAccelerationY`
  toggles between `-THRUST` (held) and `0`. `setMaxVelocity` clamps fall speed
  so motion stays readable; angle is derived from velocity for feedback.
- **Obstacles** are free-floating (passable above *or* below — not
  flappy-style edge-connected pipes). Rocks scroll left at `SCROLL_SPEED`,
  the same speed as the water, so they read as anchored; vessels are faster
  (`SPEEDS` per type). Because speeds differ, `scheduleSpawn` times each
  spawn by when it will *reach the boat* (`SPAWN_DELAY` apart, stretched by
  `WIDE_GAP` around obstacles wider than `WIDE_WIDTH`, and by `ROCK_GAP`
  between consecutive rocks/islands), with `MIN_SPAWN_GAP` so a fast
  vessel never overlaps a slow one at the edge. Random Y, immovable, no gravity. Each type
  (`rock`/`ferry`/`suomenlinna`/`falko`) sets a **hitbox smaller than its art** for
  forgiving collisions. Scoring/culling happens in `updateScoreAndCull`.
- **Draw order**: boats and obstacles are painter-sorted with
  `depthAt(hitbox centre y)` (between 1 and 2), so the player's boat passes
  *behind* an obstacle whose hitbox centre is lower on screen (e.g. behind
  island trees) and in front otherwise. Wakes sit at 0.5; splash/foam (6),
  deck (10+) and HUD (20+) stay on top.
- **Wakes**: obstacle vessels trail V-shaped "plotter" wakes from the stern
  plus one near-side leg from the bow (`addVesselWake` / `addVesselBowWave`).
  The player's boat has neither; its bow wave (`updateBowWave`) is spray
  only: many small round drops thrown up and back from the hull between its
  `bow` contact point and stern (up to its `chine` line), fading fast. The Vejde is a player boat only.
  `wakes` holds one `Wake` per vessel. Points
  are dropped at the stern every `WAKE_EMIT` ms, drift with the water, and two
  arms spread at `WAKE_ANGLE` × the boat's speed through the water, all drawn
  on one Graphics each frame. A vessel's wake lingers until faded after the
  vessel is destroyed.
- **Accessibility invariants to preserve**: single large fixed-position control;
  hold-to-rise (no timing precision); forgiving sub-art hitboxes; gentle speeds;
  no flashing; big high-contrast score/messages. The boat clamps to play-area
  edges (`setCollideWorldBounds`) — touching an edge never kills you; only an
  obstacle does (and only while `playing`). On death the boat's body is disabled and `sinkBoat` tweens it
  nose-down into foam at the crash point; the medal appears and restart
  unlocks only after it is gone.

### Restart gotcha

`scene.restart()` re-runs `create()` but **not** field initializers, so any
per-run state must be reset at the top of `create()` (currently `ripples`,
`wakes`, `worldSpeed`, `held`, `canRestart`, `score`). Add new mutable run-state to that reset block.
