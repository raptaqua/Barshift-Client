#!/usr/bin/env bash
# Päivittää versionhallinnassa olevan vendor/-kansion composer.lockin mukaiseksi ja siivoaa siitä ajossa turhat tiedostot.
# Aja kun composer.json/composer.lock muuttuu:  tools/update_vendor.sh   ja committaa vendor/.
# (vendor/ on repossa, jotta palvelimelle riittää pelkkä tiedostojen lataus: ei SSH:ta eikä composeria.)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf vendor
composer install --no-dev --no-progress --prefer-dist --optimize-autoloader -q
find vendor -type d -name .git -prune -exec rm -rf {} +
find vendor -type d \( -iname tests -o -iname test -o -iname docs -o -iname doc -o -iname examples -o -iname .github -o -iname vendor-bin \) -prune -exec rm -rf {} +
find vendor -type f \( -iname '*.md' -o -iname 'phpunit*' -o -iname '.git*' -o -iname 'CHANGELOG*' -o -iname '*.dist' -o -iname '*.neon' -o -iname 'Makefile' -o -iname 'Dockerfile' -o -iname '.editorconfig' \) -delete
printf '# Kirjastot eivät ole selaimella ladattavia\nRequire all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n' > vendor/.htaccess
php -r 'require "vendor/autoload.php"; foreach (["Minishlink\\WebPush\\WebPush"] as $c) if (!class_exists($c)) { fwrite(STDERR, "Luokka puuttuu: $c\n"); exit(1); }'
echo "vendor/ valmis ($(du -sh vendor | cut -f1))"
