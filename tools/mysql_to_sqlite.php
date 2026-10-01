<?php
// Siirtää olemassa olevan MariaDB/MySQL-asennuksen tiedot SQLite-kantaan.
//   php tools/mysql_to_sqlite.php [--file=data/barshift.sqlite]
// Lukee nykyisen config.php:n (db_host ym.), luo SQLite-kannan ja kopioi kaikki taulut. Alkuperäistä kantaa ei muuteta.
// Kun siirto on tehty ja tarkistettu, vaihda config.php:ssä 'db_driver' => 'sqlite' ja 'db_file' => '<tiedosto>'.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../db/migrate_lib.php';
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/../config.php');
if (bsDbDriver($cfg) !== 'mysql') { fwrite(STDERR, "config.php ei käytä MariaDB:tä\n"); exit(1); }
$file = 'data/barshift.sqlite';
foreach (array_slice($argv, 1) as $a) if (str_starts_with($a, '--file=')) $file = substr($a, 7);

$src = bsConnect($cfg);
if ($src->connect_error) { fwrite(STDERR, "MariaDB-yhteys epäonnistui\n"); exit(1); }
$dstCfg = ['db_driver' => 'sqlite', 'db_file' => $file];
$path = bsDbFile($dstCfg);
if (file_exists($path)) { fwrite(STDERR, "Kohdetiedosto on jo olemassa: $path (poista tai valitse toinen --file)\n"); exit(1); }
$dst = bsConnect($dstCfg);
if ($dst->connect_error) { fwrite(STDERR, "SQLite-tiedoston luonti epäonnistui: $path\n"); exit(1); }

// Rakenne: nykyinen schema.sql + sama migraatiotila kuin lähteessä
if ($e = bsApplySchema($dst, __DIR__ . '/../db/schema.sql')) { fwrite(STDERR, "Skeema epäonnistui: $e\n"); exit(1); }
$pending = (int)($src->query("SELECT COUNT(*) c FROM schema_migrations")->fetch_assoc()['c'] ?? 0);
if ($pending < count(bsMigrationFiles(__DIR__ . '/../db/migrations'))) { fwrite(STDERR, "Päivitä MariaDB-kanta ensin: php migrate.php\n"); exit(1); }

bsEnsureMigrationTable($dst);
$tables = [];
foreach ($src->query("SHOW TABLES") as $r) $tables[] = array_values($r)[0];
$dst->query('SET FOREIGN_KEY_CHECKS = 0');
$dst->begin_transaction();
$total = 0;
foreach ($tables as $t) {
    $res = $src->query("SELECT * FROM `$t`");
    if (!$res) { fwrite(STDERR, "Luku epäonnistui: $t\n"); exit(1); }
    $rows = $res->fetch_all(MYSQLI_ASSOC);
    $dst->query("DELETE FROM `$t`");
    $n = 0;
    foreach ($rows as $row) {
        $cols = array_keys($row);
        $st = $dst->prepare("INSERT INTO `$t` (" . implode(',', array_map(fn($c) => "`$c`", $cols)) . ") VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")");
        if (!$st || !$st->execute(array_values($row))) { fwrite(STDERR, "Tauluun $t kirjoitus epäonnistui: " . ($st ? $st->error : $dst->error) . "\n"); $dst->rollback(); exit(1); }
        $n++;
    }
    $total += $n;
    echo sprintf("%-28s %d riviä\n", $t, $n);
}
$dst->commit();
$dst->query('SET FOREIGN_KEY_CHECKS = 1');
echo "Valmis: $total riviä -> $path\n";
echo "Seuraavaksi: config.php:hen 'db_driver' => 'sqlite', 'db_file' => '$file' (ja poista db_host/db_name/db_user/db_pass). Ota vanha kanta talteen.\n";
