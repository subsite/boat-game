#!/usr/bin/env bash
# Publish a release: push main, then a vX.Y.Z tag, which makes
# .github/workflows/release.yml build, sign and publish the APK.
#
#   scripts/release.sh            # next patch: v0.3.1 -> v0.3.2
#   scripts/release.sh minor      # v0.3.1 -> v0.4.0
#   scripts/release.sh major      # v0.3.1 -> v1.0.0
#   scripts/release.sh v1.2.3     # exactly this version
#
# Run it on the host (it pushes). It tags the current commit; uncommitted
# changes are not part of the release.
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)"

[ "$(git branch --show-current)" = main ] || die "not on main"

git fetch --quiet --tags origin
[ -z "$(git rev-list HEAD..origin/main)" ] || die "main is behind origin/main; pull first"

LATEST=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)
LATEST=${LATEST:-v0.0.0}
[[ "$LATEST" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || die "can't parse latest tag $LATEST"
MAJOR=${BASH_REMATCH[1]} MINOR=${BASH_REMATCH[2]} PATCH=${BASH_REMATCH[3]}

case "${1:-patch}" in
  patch) TAG="v$MAJOR.$MINOR.$((PATCH + 1))" ;;
  minor) TAG="v$MAJOR.$((MINOR + 1)).0" ;;
  major) TAG="v$((MAJOR + 1)).0.0" ;;
  v*) TAG=$1 ;;
  *) die "usage: $0 [patch|minor|major|vX.Y.Z]" ;;
esac

# Same rules as the workflow: versionCode = MAJOR*10000 + MINOR*100 + PATCH.
[[ "$TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || die "tag must be vMAJOR.MINOR.PATCH, got $TAG"
(( BASH_REMATCH[2] < 100 && BASH_REMATCH[3] < 100 )) || die "MINOR and PATCH must be below 100"
code() { [[ "$1" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; echo $(( BASH_REMATCH[1] * 10000 + BASH_REMATCH[2] * 100 + BASH_REMATCH[3] )); }
(( $(code "$TAG") > $(code "$LATEST") )) || die "$TAG is not newer than $LATEST"
git rev-parse -q --verify "refs/tags/$TAG" > /dev/null && die "$TAG already exists"

git diff --quiet HEAD || echo "note: uncommitted changes are not included in the release"

echo "Latest release: $LATEST"
echo "New release:    $TAG at $(git log -1 --format='%h %s')"
UNPUSHED=$(git rev-list --count origin/main..HEAD)
(( UNPUSHED == 0 )) || echo "Will also push $UNPUSHED commit(s) to origin/main"
read -r -p "Release $TAG? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || die "cancelled"

git push origin main
git tag "$TAG"
git push origin "$TAG"

URL=$(git remote get-url origin | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##')
echo "Pushed $TAG. The build runs at $URL/actions; the APK appears at $URL/releases/tag/$TAG"
