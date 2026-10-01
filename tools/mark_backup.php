<?php
// Kirjaa onnistuneen varmuuskopion tilaan (Hallinta → Järjestelmä ja health-päätepiste). Kutsutaan backup.sh:n lopussa:
//   php tools/mark_backup.php tiedosto1 [tiedosto2 ...]
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/../config.php');
mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }
$parts = []; foreach (array_slice($argv, 1) as $f) if (is_file($f)) $parts[] = basename($f) . ' (' . round(filesize($f) / 1048576, 1) . ' MB)';
if (!$parts) { fwrite(STDERR, "Ei tiedostoja\n"); exit(1); }
$info = mb_substr(implode(', ', $parts), 0, 250); $now = date('c');
foreach (['backup_last_ok' => $now, 'backup_info' => $info] as $k => $v) {
    $st = $conn->prepare("INSERT INTO system_status (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)");
    $st->bind_param("ss", $k, $v); $st->execute();
}
echo "Varmuuskopio kirjattu tilaan\n";
