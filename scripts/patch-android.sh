#!/usr/bin/env bash
# Customise the generated (gitignored) android/ project: the app icon from
# resources/android/res/ (tools/art/draw_icon.py) and a portrait-only
# MainActivity, so the game never rotates. Safe to run again.
# Used by the release workflow and `npm run cap:patch`.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
[ -d android ] || { echo "patch-android: no android/ yet; run npx cap add android" >&2; exit 1; }

cp -r resources/android/res/. android/app/src/main/res/

MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q 'android:screenOrientation' "$MANIFEST"; then
  sed -i 's#android:name=".MainActivity"#&\n            android:screenOrientation="portrait"#' "$MANIFEST"
fi
grep -q 'android:screenOrientation="portrait"' "$MANIFEST" || {
  echo "patch-android: could not lock $MANIFEST to portrait" >&2
  exit 1
}
