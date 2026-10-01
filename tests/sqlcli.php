<?php
// Testiapuri: ajaa SQL-lauseet config.php:n osoittamaan kantaan (SQLite tai MariaDB), tulostus kuten `mysql -N` / `mysql`.
// Käyttö: php tests/sqlcli.php "SQL" [-N]
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/sqlite_ddl.php';
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/../config.php');
$conn = bsConnect($cfg);
if ($conn->connect_error) { fwrite(STDERR, "yhteys epäonnistui\n"); exit(1); }
$noHeader = in_array('-N', $argv, true);
foreach (bsSqlStatements($argv[1] ?? '') as $sql) {
    $r = $conn->query($sql);
    if ($r === false) { fwrite(STDERR, "ERROR {$conn->errno}: {$conn->error}\n"); exit(1); }
    if ($r === true) continue;
    $first = true;
    foreach ($r as $row) {
        if ($first && !$noHeader) echo implode("\t", array_keys($row)), "\n";
        $first = false;
        echo implode("\t", array_map(fn($v) => $v === null ? 'NULL' : (string)$v, $row)), "\n";
    }
}
