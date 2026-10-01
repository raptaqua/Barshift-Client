<?php
// Palvelimen ylläpitotyökalu (vain komentorivi):
//   php bin/admin.php reset-password <tunnus>     – asettaa uuden salasanan (kysytään interaktiivisesti)
//   php bin/admin.php reset-2fa <tunnus>          – poistaa kaksivaiheisen tunnistautumisen käytöstä
//   php bin/admin.php create-admin <tunnus> "<nimi>"
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/../config.php');
mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }
$conn->set_charset('utf8mb4');
[$cmd, $user] = [$argv[1] ?? '', $argv[2] ?? ''];
$pubRow = $conn->query("SELECT slug FROM pubs ORDER BY id LIMIT 1")->fetch_assoc();
if (!$pubRow) { fwrite(STDERR, "Baaria ei ole luotu (aja install.php)\n"); exit(1); }
$pub = $pubRow['slug'];
function askPassword(): string {
    echo "Uusi salasana (väh. 12 merkkiä): ";
    system('stty -echo 2>/dev/null'); $pw = rtrim((string)fgets(STDIN), "\r\n"); system('stty echo 2>/dev/null'); echo "\n";
    if (strlen($pw) < 12) { fwrite(STDERR, "Salasana on liian lyhyt\n"); exit(1); }
    return password_hash($pw, PASSWORD_DEFAULT);
}
if ($user === '') { fwrite(STDERR, "Käyttö: php bin/admin.php reset-password|reset-2fa|create-admin <tunnus> [nimi]\n"); exit(1); }
if ($cmd === 'reset-password') {
    $h = askPassword();
    $st = $conn->prepare("UPDATE users SET password = ? WHERE username = ? AND pub_name = ?"); $st->bind_param('sss', $h, $user, $pub); $st->execute();
    echo $st->affected_rows ? "Salasana vaihdettu\n" : "Tunnusta ei löytynyt\n";
    $conn->query("UPDATE user_sessions s JOIN users u ON u.id = s.user_id SET s.revoked_at = NOW() WHERE u.username = '" . $conn->real_escape_string($user) . "' AND s.revoked_at IS NULL");
} elseif ($cmd === 'reset-2fa') {
    $st = $conn->prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL, totp_last_step = 0 WHERE username = ? AND pub_name = ?"); $st->bind_param('ss', $user, $pub); $st->execute();
    echo $st->affected_rows ? "2FA nollattu\n" : "Tunnusta ei löytynyt tai 2FA ei ollut käytössä\n";
} elseif ($cmd === 'create-admin') {
    $name = $argv[3] ?? $user; $h = askPassword();
    $st = $conn->prepare("INSERT INTO users (name, username, password, role, pub_name) VALUES (?, ?, ?, 'admin', ?) ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'admin'");
    $st->bind_param('ssss', $name, $user, $h, $pub);
    echo $st->execute() ? "Ylläpitäjä valmis\n" : "Virhe: " . $st->error . "\n";
} else { fwrite(STDERR, "Tuntematon komento\n"); exit(1); }
