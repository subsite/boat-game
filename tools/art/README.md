# Boat artwork scripts

Flat schematic boat images in `public/` are drawn with Pillow from reference
photos (kept out of git in `inbox/`). To change one, edit its script and
re-render into `public/` (the second argument is a 2x preview on a dark
background):

```bash
cd tools/art
python3 draw_suomenlinna.py ../../public/suomenlinna.png /tmp/suomenlinna_preview.png
python3 draw_vejde.py ../../public/vejde_right.png /tmp/vejde_preview.png
python3 mirror_falko.py ../../inbox/falko-cut.png ../../public/falko_left.png
python3 draw_buster.py ../../inbox/buster-xl.png ../../public/buster.png /tmp/buster_preview.png
python3 draw_icon.py ../.. /tmp/icon_preview.png
python3 draw_splash.py ../.. /tmp/splash_preview.png
```

- `draw_vejde.py` draws the Vejde bow-left (like the photo, preview too),
  cuts the hull at a level waterline just below the swim platform, and saves
  it mirrored, right-facing, as the player boat `vejde_right.png`.
- `draw_buster.py` starts from the Buster XL render (`inbox/buster-xl.png`),
  draws a happy granny at the helm *under* it (the windscreen is
  semi-transparent) and tilts it bow-up. It stays right-facing, for the
  player.

- `draw_icon.py` puts `vejde_right.png` on the game's default sea (rendered
  from `src/sea.ts` by `sea_tile.ts`, so it needs node) and writes the
  Android launcher icons (adaptive layers plus legacy square/round) to
  `resources/android/res/` and the favicon `public/icon.png`.

- `draw_splash.py` makes the loading screen: every boat image (from
  `public/`, so re-run it after changing one) on the game's sea with the
  title. It writes the Android launch screen to `resources/android/res/`
  and `public/splash.png` + `public/splash-sea.png` for `index.html`.

If an image's size or layout changes, update its hitbox and stern (wake)
offsets in `spawnObstacle` in `src/scenes/GameScene.ts`; `draw_vejde.py`
prints the key hull points in output pixels for that.
