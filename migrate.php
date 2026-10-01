<?php
// Ajetaan vain komentoriviltä:  php migrate.php
// Tuo db/schema.sql (idempotentti: CREATE TABLE IF NOT EXISTS) ja päivittää vanhat kannat.
// Aja ylläpitäjän tunnuksilla, sillä sovelluksen tavallinen DB-käyttäjä ei tarvitse CREATE/ALTER-oikeuksia.
// BARSHIFT_CONFIG voi osoittaa erilliseen configiin.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/config.php');
require_once __DIR__ . '/lib/db.php';
$conn = bsConnect($cfg);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }

require __DIR__ . '/db/migrate_lib.php';   // lataa myös lib/db.php ja lib/sqlite_ddl.php
$fresh = !bsTableExists($conn, 'users');   // tuore kanta: schema.sql sisältää jo kaikki migraatiot

$schemaErr = bsApplySchema($conn, __DIR__ . '/db/schema.sql');
echo ($schemaErr ? "VIRHE schema.sql: " . $schemaErr : "OK    db/schema.sql") . "\n";

[$n, $err] = bsRunMigrations($conn, __DIR__ . '/db/migrations', $fresh, function ($m) { echo $m . "\n"; });
if ($err) { fwrite(STDERR, "VIRHE $err\n"); exit(1); }
echo $n ? "Migraatioita käsitelty: $n\n" : "Ei uusia migraatioita\n";
