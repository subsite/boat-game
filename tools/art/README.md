# Boat artwork scripts

Flat schematic boat images in `public/` are drawn with Pillow from reference
photos (kept out of git in `inbox/`). To change one, edit its script and
re-render into `public/` (the second argument is a 2x preview on a dark
background):

```bash
cd tools/art
python3 draw_suomenlinna.py ../../public/suomenlinna.png /tmp/suomenlinna_preview.png
python3 draw_vejde.py ../../public/vejde_right.png /tmp/vejde_preview.png
python3 mirror_falko.py ../../public/falko.png ../../public/falko_left.png
python3 draw_buster.py ../../inbox/buster-xl.png ../../public/buster.png /tmp/buster_preview.png
```

- `draw_vejde.py` draws the Vejde bow-left (like the photo, preview too),
  cuts the hull at a level waterline just below the swim platform, and saves
  it mirrored, right-facing, as the player boat `vejde_right.png`.
- `draw_buster.py` starts from the Buster XL render (`inbox/buster-xl.png`),
  draws a happy granny at the helm *under* it (the windscreen is
  semi-transparent) and tilts it bow-up. It stays right-facing, for the
  player.

If an image's size or layout changes, update its hitbox and stern (wake)
offsets in `spawnObstacle` in `src/scenes/GameScene.ts`; `draw_vejde.py`
prints the key hull points in output pixels for that.
