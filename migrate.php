<?php
// Ajetaan vain komentoriviltä:  php migrate.php
// Tuo db/schema.sql (idempotentti: CREATE TABLE IF NOT EXISTS) ja päivittää vanhat kannat.
// Aja ylläpitäjän tunnuksilla, sillä sovelluksen tavallinen DB-käyttäjä ei tarvitse CREATE/ALTER-oikeuksia.
// BARSHIFT_CONFIG voi osoittaa erilliseen configiin.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/config.php');
mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }
$conn->set_charset('utf8mb4');

require __DIR__ . '/db/migrate_lib.php';
$fresh = !bsTableExists($conn, 'users');   // tuore kanta: schema.sql sisältää jo kaikki migraatiot

$ok = $conn->multi_query(file_get_contents(__DIR__ . '/db/schema.sql'));
while ($ok && $conn->more_results() && $conn->next_result()) { if ($r = $conn->store_result()) $r->free(); }
echo ($conn->errno ? "VIRHE schema.sql: " . $conn->error : "OK    db/schema.sql") . "\n";

[$n, $err] = bsRunMigrations($conn, __DIR__ . '/db/migrations', $fresh, function ($m) { echo $m . "\n"; });
if ($err) { fwrite(STDERR, "VIRHE $err\n"); exit(1); }
echo $n ? "Migraatioita käsitelty: $n\n" : "Ei uusia migraatioita\n";
