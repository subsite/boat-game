# boat-game

A simple, accessibility-minded mobile game: steer a boat to weave around
free-floating water obstacles (cliffs, lighthouses, row boats), passing each one
above or below. Built with **Phaser 3** (game) + **Vite/TypeScript** (web) +
**Capacitor** (native mobile).

Designed for kids with disabilities:
- **One large control** — the whole bottom "deck" is the button (a steering wheel).
- **Hold to steer up, release to sail down** — no precise tap timing needed.
- **Switch/keyboard support** — Space or Enter also work (common for assistive switches).
- **Gentle, forgiving play** — slow pace, room to pass either side, smaller-than-art hitbox.
- **Calm, high-contrast visuals** — no flashing, clear big score, simple ready/over screens.

## Run in the browser (development)

```bash
npm install
npm run dev      # open the printed localhost URL
```

## Build the web bundle

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build
```

## Mobile (Capacitor)

App id: `fi.subsite.boatgame`. Run these on the host machine (not in the container):

```bash
npx cap add android     # generates android/ (gitignored)
npx cap add ios         # generates ios/ (gitignored)
npm run cap:android     # build + sync + open Android Studio
npm run cap:ios         # build + sync + open Xcode
```

`npm run cap:sync` rebuilds the web bundle and copies it into the native projects.

## Project layout

```
src/
  main.ts            Phaser game bootstrap
  config.ts          Gameplay/layout tuning constants
  textures.ts        All artwork, generated procedurally (no asset files)
  scenes/
    GameScene.ts     Boat, obstacles, control, scoring, ready/over flow
```

All art is drawn at runtime, so the prototype runs with no binary assets. Tuning
values (speed, gravity, thrust, spawn rate, obstacle height range) live in
`src/config.ts`.
