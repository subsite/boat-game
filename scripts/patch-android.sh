#!/usr/bin/env bash
# Customise the generated (gitignored) android/ project: the app icon and
# launch screen from resources/android/res/ (tools/art/draw_icon.py,
# draw_splash.py) and a portrait-only MainActivity, so the game never
# rotates. Safe to run again.
# Used by the release workflow and `npm run cap:patch`.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
[ -d android ] || { echo "patch-android: no android/ yet; run npx cap add android" >&2; exit 1; }

RES=android/app/src/main/res
# Capacitor's own splash images would shadow our drawable/splash.xml.
rm -f "$RES"/drawable*/splash.png
cp -r resources/android/res/. "$RES/"

# Android 12+ shows the icon on this colour (the sea) before the launch screen.
STYLES=$RES/values/styles.xml
if ! grep -q windowSplashScreenBackground "$STYLES"; then
  sed -i 's#<item name="android:background">@drawable/splash</item>#&\n        <item name="windowSplashScreenBackground">@color/splash_background</item>#' "$STYLES"
fi
grep -q windowSplashScreenBackground "$STYLES" || {
  echo "patch-android: could not set the splash colour in $STYLES" >&2
  exit 1
}

MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q 'android:screenOrientation' "$MANIFEST"; then
  sed -i 's#android:name=".MainActivity"#&\n            android:screenOrientation="portrait"#' "$MANIFEST"
fi
grep -q 'android:screenOrientation="portrait"' "$MANIFEST" || {
  echo "patch-android: could not lock $MANIFEST to portrait" >&2
  exit 1
}
