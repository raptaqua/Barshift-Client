<?php
// Luo (tai päivittää) superadmin-tunnuksen. Vain komentoriviltä:  php create_superadmin.php
// Salasanaa kysytään interaktiivisesti, eikä sitä tallenneta mihinkään selkotekstinä.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/config.php');
mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }
$conn->set_charset('utf8mb4');

echo "Superadmin-tunnus [superadmin]: ";
$user = trim(fgets(STDIN)) ?: 'superadmin';
echo "Salasana (väh. 12 merkkiä): ";
system('stty -echo 2>/dev/null'); $pw = rtrim(fgets(STDIN), "\r\n"); system('stty echo 2>/dev/null'); echo "\n";
if (strlen($pw) < 12) { fwrite(STDERR, "Salasana on liian lyhyt\n"); exit(1); }
$hash = password_hash($pw, PASSWORD_DEFAULT);

$stmt = $conn->prepare("INSERT INTO users (name, username, password, role, pub_name) VALUES (?, ?, ?, 'superadmin', 'SYSTEM')
                        ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'superadmin'");
$stmt->bind_param("sss", $user, $user, $hash);
if (!$stmt->execute()) { fwrite(STDERR, "Virhe: " . $stmt->error . "\n"); exit(1); }
echo "Valmis. Kirjautuminen: {$user} (baari-kenttään: SYSTEM tai tunnus@SYSTEM)\n";
