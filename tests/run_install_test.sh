#!/usr/bin/env bash
# Asennusohjelman testi (APP_SRC=kansio testaa valmiin julkaisupaketin) SQLite-kantaan: kopioi sovelluksen väliaikaiseen kansioon, ajaa install.php:n curlilla,
# kirjautuu uudella ylläpitäjällä ja tarkistaa, ettei data/-kansion tiedosto lataudu selaimella.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"; PORT="${TEST_PORT:-8497}"
trap '[ -n "${PHP_PID:-}" ] && kill $PHP_PID 2>/dev/null; rm -rf "$TMP"' EXIT
APP="$TMP/app"; mkdir -p "$APP"
if [ -n "${APP_SRC:-}" ]; then   # valmis julkaisupaketti (tools/build_release.sh) puretussa kansiossa
  cp -r "$APP_SRC"/. "$APP"/
else
  cp -r api.php index.php install.php migrate.php lib db vendor assets "$APP"/ 2>/dev/null
  cp *.html *.json *.js "$APP"/ 2>/dev/null || true
fi
mkdir -p "$APP/uploads"
# Palvelimeksi PHP:n sisäänrakennettu palvelin; se ei lue .htaccess-tiedostoja, joten data/-suojaus testataan reitittimellä
cat > "$TMP/router.php" <<'PHP'
<?php
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/data/#', $p)) { http_response_code(403); exit; }
return false;
PHP
(cd "$APP" && exec php -S "127.0.0.1:$PORT" "$TMP/router.php" > "$TMP/server.log" 2>&1) & PHP_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/install.php" && break; sleep 0.2; done
J="$TMP/jar"; B="http://127.0.0.1:$PORT"
page="$(curl -s -c "$J" -b "$J" "$B/install.php")"
csrf="$(echo "$page" | grep -o 'name="csrf" value="[a-f0-9]*"' | head -1 | sed 's/.*value="//;s/"//')"
token="$(grep -o 'TOKEN: [a-f0-9]*' "$APP/install_token.php" | sed 's/TOKEN: //')"
[ -n "$csrf" ] && [ -n "$token" ] || { echo "csrf/token puuttuu"; exit 1; }
out="$(curl -s -c "$J" -b "$J" "$B/install.php" \
  --data-urlencode "csrf=$csrf" --data-urlencode "token=$token" --data-urlencode "act=install" --data-urlencode "db_driver=sqlite" \
  --data-urlencode "email=a@example.test" --data-urlencode "pub_name=Testibaari" --data-urlencode "admin_name=Testi Admin" \
  --data-urlencode "su_user=admin" --data-urlencode "su_pass=pitkasalasana123" --data-urlencode "su_pass2=pitkasalasana123")"
echo "$out" | grep -q "Asennus valmis" || { echo "$out" | sed 's/<[^>]*>/ /g' | grep -i "virhe\|epäonn\|varoitus" | head; echo "asennus epäonnistui"; exit 1; }
echo "$out" | grep -q "ladattavissa selaimella" && { echo "data/ ilmoitettiin avoimeksi vaikka reititin estää"; exit 1; }
grep -q "'db_driver' => 'sqlite'" "$APP/config.php" || { echo "config.php ei sisällä sqlite-ajuria"; exit 1; }
ls "$APP"/data/barshift-*.sqlite > /dev/null
code="$(curl -s -o /dev/null -w '%{http_code}' "$B/data/$(basename "$APP"/data/barshift-*.sqlite)")"
[ "$code" = 403 ] || { echo "tietokantatiedosto latautuu selaimella ($code)"; exit 1; }
login="$(curl -s -c "$J" -b "$J" -H 'Content-Type: application/json' -d '{"username":"admin","password":"pitkasalasana123"}' "$B/api.php?action=login")"
echo "$login" | grep -q '"success":true' || { echo "kirjautuminen epäonnistui: $login"; exit 1; }
echo "ok: SQLite-asennus, kirjautuminen ja data/-suojaus"
