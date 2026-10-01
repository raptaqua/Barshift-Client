#!/usr/bin/env bash
# Rakentaa asennusvalmiin zip-paketin, jossa vendor/ on mukana: palvelimella ei tarvita SSH:ta eikä composeria.
#   tools/build_release.sh [tulostiedosto.zip]
# Vaatii: composer, zip. Paketti sisältää vain ajoon tarvittavat tiedostot (ei testejä, ei CI-tiedostoja).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(realpath -m "${1:-dist/barshift-client.zip}")"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/barshift"; mkdir -p "$APP"

git ls-files -z | grep -zvE '^(tests/|\.github/|tools/(screenshots|build_release)|\.gitignore$|composer\.lock$)' | xargs -0 -I{} cp --parents {} "$APP"/
mkdir -p "$APP/uploads" "$APP/data"
[ -f uploads/.htaccess ] && cp uploads/.htaccess "$APP/uploads/"
cp data/.htaccess data/index.html "$APP/data/"

( cd "$APP" && cp "$OLDPWD/composer.lock" . && composer install --no-dev --no-progress --prefer-dist --optimize-autoloader --classmap-authoritative -q && rm composer.lock )
# Ajon kannalta turhat tiedostot pois (testit, dokumentaatio, esimerkit)
find "$APP/vendor" -type d -name .git -prune -exec rm -rf {} +
find "$APP/vendor" -type d \( -iname tests -o -iname test -o -iname docs -o -iname doc -o -iname examples -o -iname .github \) -prune -exec rm -rf {} +
find "$APP/vendor" -type f \( -iname '*.md' -o -iname 'phpunit*' -o -iname '.git*' -o -iname 'CHANGELOG*' -o -iname '*.dist' \) -delete

mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
( cd "$STAGE" && zip -qr "$OUT" barshift )
# Varmistus: paketin autoloader toimii ja tarvittavat luokat löytyvät
php -r 'require $argv[1] . "/vendor/autoload.php"; foreach (["Minishlink\\WebPush\\WebPush"] as $c) if (!class_exists($c)) { fwrite(STDERR, "Luokka puuttuu: $c\n"); exit(1); }' "$APP"
echo "Valmis: $OUT ($(du -h "$OUT" | cut -f1))"
