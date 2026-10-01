<?php
// Poistaa demodatan (baari 'demobaari' ja kaikki sen data) kannasta. Vain komentoriviltä:  php bin/clear_demo.php [--yes]
// Muiden baarien dataan ei kosketa. Jos kannassa on demobaarin lisäksi oma baarisi, sen tiedot säilyvät.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/../config.php');
mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }
$conn->set_charset('utf8mb4');
const DEMO = 'demobaari';
$n = (int)$conn->query("SELECT COUNT(*) c FROM users WHERE pub_name = '" . DEMO . "'")->fetch_assoc()['c'];
if ($n === 0 && !$conn->query("SELECT 1 FROM pubs WHERE slug = '" . DEMO . "'")->num_rows) { echo "Demodataa ei löytynyt.\n"; exit(0); }
if (!in_array('--yes', $argv, true)) {
    echo "Poistetaan baari '" . DEMO . "' ($n käyttäjää) ja kaikki sen data. Jatka kirjoittamalla KYLLA: ";
    if (trim((string)fgets(STDIN)) !== 'KYLLA') { echo "Peruttu.\n"; exit(1); }
}
$demoUsers = array_column($conn->query("SELECT id FROM users WHERE pub_name = '" . DEMO . "'")->fetch_all(MYSQLI_ASSOC), 'id');
$conn->query("SET FOREIGN_KEY_CHECKS = 0");
$total = 0;
$res = $conn->query("SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name IN ('pub_name', 'from_pub', 'slug') AND table_name NOT IN ('users')");
foreach ($res->fetch_all(MYSQLI_ASSOC) as $r) {
    $conn->query("DELETE FROM `{$r['t']}` WHERE `{$r['c']}` = '" . DEMO . "'"); $total += max(0, $conn->affected_rows);
}
if ($demoUsers) {   // käyttäjäsidonnaiset rivit, joissa ei ole baarisaraketta
    $ids = implode(',', array_map('intval', $demoUsers));
    $cols = $conn->query("SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name IN ('user_id', 'userId', 'sender_id', 'receiver_id', 'from_user', 'to_user', 'created_by') AND table_name NOT IN ('users')");
    foreach ($cols->fetch_all(MYSQLI_ASSOC) as $r) { $conn->query("DELETE FROM `{$r['t']}` WHERE `{$r['c']}` IN ($ids)"); $total += max(0, $conn->affected_rows); }
}
$conn->query("DELETE FROM users WHERE pub_name = '" . DEMO . "'"); $total += max(0, $conn->affected_rows);
$conn->query("SET FOREIGN_KEY_CHECKS = 1");
echo "Valmis: demobaari poistettu ($total riviä).\n";
