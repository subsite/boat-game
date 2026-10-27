# boat-game

A simple, accessibility-minded mobile game: steer a boat to weave around
archipelago obstacles (granite skerries, wooded islands, daycruisers and
freighters), passing each one above or below. Built with **Phaser 3** (game) + **Vite/TypeScript** (web) +
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

## Releases

Pushing a version tag builds a signed APK in GitHub Actions and publishes it as
a GitHub Release (`.github/workflows/release.yml`):

```bash
git tag v1.0.0
git push origin v1.0.0
```

- Tags must be `vMAJOR.MINOR.PATCH`, with MINOR and PATCH below 100. The
  Android versionCode is `MAJOR*10000 + MINOR*100 + PATCH`, so every release
  needs a higher version than the last.
- The workflow generates `android/` fresh (it is gitignored), stamps the
  version into it, builds, then signs with the release key.

### Signing (one-time setup)

Create a release keystore and **back it up with its passwords** — without it,
later releases can't update installed copies:

```bash
keytool -genkeypair -v -keystore boatgame-release.jks -alias boatgame \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 boatgame-release.jks   # value for SIGNING_KEYSTORE_BASE64
```

Add these repository secrets under Settings → Secrets and variables → Actions:
`SIGNING_KEYSTORE_BASE64`, `SIGNING_KEYSTORE_PASSWORD`, `SIGNING_KEY_ALIAS`
(`boatgame` above) and `SIGNING_KEY_PASSWORD`. The workflow refuses to publish
without the keystore.

APKs from Android Studio are debug-signed, so uninstall one before installing
the other.

## Project layout

```
src/
  main.ts            Phaser game bootstrap
  config.ts          Gameplay/layout tuning constants
  textures.ts        Artwork, generated procedurally (except the player boat)
  sea.ts             Pixel generators for the tileable sea
  sfx.ts             Synthesised WebAudio sound effects
  scenes/
    GameScene.ts     Boat, obstacles, control, scoring, ready/over flow
```

All art is drawn at runtime, so the prototype runs with no binary assets. Tuning
values (speed, gravity, thrust, spawn rate, obstacle height range) live in
`src/config.ts`.
