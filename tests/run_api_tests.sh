#!/usr/bin/env bash
# API-integraatiotestit: luo väliaikaisen configin, ajaa migraatiot + demodatan tyhjään testikantaan,
# käynnistää PHP:n sisäänrakennetun palvelimen ja ajaa tests/api.test.js.
#
# Vaatii: php (mysqli), mysql-asiakas, MariaDB/MySQL-palvelin, node 18+, `composer install` tehtynä (vendor/).
# Ympäristömuuttujat (oletukset): TEST_DB_HOST=127.0.0.1 TEST_DB_NAME=barshift_test TEST_DB_USER=root TEST_DB_PASS=
# HUOM: TEST_DB_NAME-kanta TYHJENNETÄÄN. Älä osoita tuotantokantaan.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_HOST="${TEST_DB_HOST:-127.0.0.1}"; DB_NAME="${TEST_DB_NAME:-barshift_test}"
DB_USER="${TEST_DB_USER:-root}"; DB_PASS="${TEST_DB_PASS:-}"
PORT="${TEST_PORT:-8399}"; SMTP_PORT="${TEST_SMTP_PORT:-2599}"; SMS_PORT="${TEST_SMS_PORT:-2699}"
TMP="$(mktemp -d)"; trap 'kill ${PHP_PID:-0} 2>/dev/null || true; rm -rf "$TMP"' EXIT

MYSQL=(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASS:+-p"$DB_PASS"} --default-character-set=utf8mb4)
"${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4;"

cat > "$TMP/config.php" <<PHP
<?php return [
  'db_host' => '$DB_HOST', 'db_name' => '$DB_NAME', 'db_user' => '$DB_USER', 'db_pass' => '$DB_PASS',
  'vapid_subject' => 'mailto:test@example.com', 'vapid_public_key' => 'test', 'vapid_private_key' => 'test',
  'message_key' => '$(head -c 32 /dev/urandom | base64)', 'allowed_origins' => [],
  'mail_from' => 'BarShift <noreply@example.test>', 'smtp' => ['host' => '127.0.0.1', 'port' => $SMTP_PORT, 'secure' => ''],
  'base_url' => 'http://127.0.0.1:$PORT', 'health_key' => 'testhealthkey', 'geocoder_url' => 'http://127.0.0.1:$SMS_PORT/search',
  'sms' => ['account_sid' => 'ACtest', 'auth_token' => 'tokentest', 'from' => '+358400000000', 'monthly_cap' => 3, 'api_base' => 'http://127.0.0.1:$SMS_PORT'],
  'stripe' => ['secret_key' => 'sk_test_x', 'webhook_secret' => 'whsec_test', 'api_base' => 'http://127.0.0.1:$SMS_PORT'],
];
PHP
export BARSHIFT_CONFIG="$TMP/config.php"

php migrate.php > "$TMP/migrate.log" || { cat "$TMP/migrate.log"; exit 1; }
"${MYSQL[@]}" "$DB_NAME" < db/seed_demo.sql
# Toinen baari baarieristyksen testaamiseen (salasana sama kuin demobaarin)
"${MYSQL[@]}" "$DB_NAME" -e "
INSERT INTO users (name, username, password, role, pub_name) SELECT 'Muu Admin', 'muuadmin', password, 'admin', 'toinenbaari' FROM users WHERE username='admin' AND pub_name='demobaari';
INSERT INTO users (name, username, password, role, pub_name) SELECT 'Muu Työntekijä', 'muutyontekija', password, 'employee', 'toinenbaari' FROM users WHERE username='admin' AND pub_name='demobaari';
INSERT INTO shifts (userId, date, start, end, role, pub_name) SELECT id, CURDATE(), '10:00', '16:00', 'Ovi', 'toinenbaari' FROM users WHERE username='muutyontekija';"

php -S "127.0.0.1:$PORT" > "$TMP/server.log" 2>&1 &
PHP_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api.php" && break; sleep 0.2; done

BASE="http://127.0.0.1:$PORT" SMTP_PORT="$SMTP_PORT" SMS_PORT="$SMS_PORT" DB_HOST="$DB_HOST" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASS="$DB_PASS" node tests/api.test.js || { echo "--- palvelinloki ---"; tail -20 "$TMP/server.log"; exit 1; }
