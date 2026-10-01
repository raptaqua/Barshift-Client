#!/usr/bin/env bash
# Varmuuskopio: tietokanta (SQLite: eheä kopio, MariaDB: mysqldump; pakattu) + ladatut kuvat (uploads/). Poistaa yli KEEP_DAYS päivää vanhat kopiot.
# Käyttö (cron, esim. joka yö):  17 2 * * *  /polku/barshift/tools/backup.sh /polku/varmuuskopiot
# Lukee tietokantatiedot config.php:stä (BARSHIFT_CONFIG voi osoittaa muualle). Kopiot sisältävät henkilötietoja:
# säilytä palvelimen ulkopuolella salattuna (esim. rclone/rsync + salaus) ja rajaa oikeudet (umask 077).
set -euo pipefail
umask 077
DEST="${1:?Anna kohdehakemisto: backup.sh /polku/varmuuskopiot}"
KEEP_DAYS="${KEEP_DAYS:-30}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${BARSHIFT_CONFIG:-$ROOT/config.php}"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"

DRIVER="$(php -r '$c = require $argv[1]; echo $c["db_driver"] ?? (isset($c["db_host"]) ? "mysql" : "sqlite");' "$CONFIG")"
if [ "$DRIVER" = sqlite ]; then
  BARSHIFT_CONFIG="$CONFIG" php "$ROOT/tools/sqlite_backup.php" "$DEST/barshift-db-$STAMP.sqlite" >/dev/null
  gzip -9 "$DEST/barshift-db-$STAMP.sqlite"
  DBFILE="$DEST/barshift-db-$STAMP.sqlite.gz"
else
# Salasana viedään ympäristön kautta (ei komentoriville, jossa muut käyttäjät voisivat nähdä sen)
eval "$(php -r '$c = require $argv[1]; foreach (["host"=>"db_host","name"=>"db_name","user"=>"db_user","pass"=>"db_pass"] as $k=>$v) echo "DB_".strtoupper($k)."=".escapeshellarg($c[$v])."\n";' "$CONFIG")"
export MYSQL_PWD="$DB_PASS"
mysqldump -h "$DB_HOST" -u "$DB_USER" --single-transaction --routines --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$DEST/barshift-db-$STAMP.sql.gz"
DBFILE="$DEST/barshift-db-$STAMP.sql.gz"
fi
if [ -d "$ROOT/uploads" ]; then tar -czf "$DEST/barshift-uploads-$STAMP.tar.gz" --exclude=uploads/.htaccess -C "$ROOT" uploads; fi
find "$DEST" -maxdepth 1 -name 'barshift-*' -mtime +"$KEEP_DAYS" -delete
# Kirjataan onnistunut ajo tilaseurantaan (ei kaada varmuuskopiota, jos kirjaus epäonnistuu)
MARK=("$DBFILE"); [ -f "$DEST/barshift-uploads-$STAMP.tar.gz" ] && MARK+=("$DEST/barshift-uploads-$STAMP.tar.gz")
BARSHIFT_CONFIG="$CONFIG" php "$ROOT/tools/mark_backup.php" "${MARK[@]}" >/dev/null 2>&1 || true
echo "Varmuuskopio valmis: $DEST (*-$STAMP)"
