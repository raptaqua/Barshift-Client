<?php
// SQLite-varmuuskopio: tekee eheän kopion kannasta (VACUUM INTO), myös kun sovellus on käytössä.
//   php tools/sqlite_backup.php /polku/kopio.sqlite
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../lib/db.php';
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/../config.php');
if (bsDbDriver($cfg) !== 'sqlite') { fwrite(STDERR, "Asennus ei käytä SQLitea\n"); exit(1); }
$dest = $argv[1] ?? '';
if ($dest === '' || file_exists($dest)) { fwrite(STDERR, "Anna uusi kohdetiedosto (ei saa olla olemassa)\n"); exit(1); }
$conn = bsConnect($cfg);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }
try { $conn->pdo->exec('VACUUM INTO ' . $conn->pdo->quote($dest)); }
catch (PDOException $e) { fwrite(STDERR, 'Varmuuskopio epäonnistui: ' . $e->getMessage() . "\n"); exit(1); }
@chmod($dest, 0600);
echo "OK $dest\n";
