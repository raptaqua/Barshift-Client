#!/usr/bin/env bash
# Rakentaa zip-paketin versionhallinnan tiedostoista (vendor/ on repossa, joten paketti on asennusvalmis).
#   tools/build_release.sh [tulostiedosto.zip]
# Paketista jätetään pois testit ja CI-tiedostot.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(realpath -m "${1:-dist/barshift-client.zip}")"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/barshift"; mkdir -p "$APP"
git ls-files -z | grep -zvE '^(tests/|\.github/|tools/(screenshots|build_release)|\.gitignore$)' | xargs -0 -I{} cp --parents {} "$APP"/
mkdir -p "$APP/uploads" "$APP/data"
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
( cd "$STAGE" && zip -qr "$OUT" barshift )
echo "Valmis: $OUT ($(du -h "$OUT" | cut -f1))"
