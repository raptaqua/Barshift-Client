<?php
// BarShift Pro: asennusohjelma.
//
// Tekee: vaatimustarkistuksen, tietokannan (schema.sql), config.php:n, VAPID-avaimet,
// viestien salausavaimen ja ylläpitäjän tunnuksen. Demodata on valinnainen.
//
// TURVALLISUUS
//  - Toimii vain kun config.php ja install.lock puuttuvat.
//  - Vaatii asennustunnisteen, joka luetaan palvelimen tiedostosta install_token.php
//    (vain tiedostojärjestelmään pääsevä näkee sen, selain ei).
//  - Lukitsee itsensä valmistuttuaan ja yrittää poistaa itsensä sekä tunnisteen.
//  - Salaisuuksia (tietokantasalasana, avaimet) ei koskaan näytetä selaimessa.
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');

$root       = __DIR__;
$configPath = $root . '/config.php';
$lockPath   = $root . '/install.lock';
$tokenPath  = $root . '/install_token.php';

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function page(string $title, string $body, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<meta name="robots" content="noindex,nofollow"><title>' . h($title) . '</title><style>'
       . ':root{--bg:#F4F7F9;--card:#fff;--text:#1a2733;--muted:#5b6b78;--line:#dbe3e9;--accent:#E14D2A;--ok:#0D9488;--bad:#c81e3a;--warn:#b45309}'
       . '@media(prefers-color-scheme:dark){:root{--bg:#121820;--card:#1b232d;--text:#e7edf2;--muted:#9fb0bd;--line:#2b3744}}'
       . '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px}'
       . '.wrap{max-width:640px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}h1 span{color:var(--accent)}'
       . 'h2{font-size:17px;margin:0 0 12px}.sub{color:var(--muted);margin:0 0 20px}'
       . '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}'
       . 'label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}small{color:var(--muted);display:block;margin-top:4px}'
       . 'input[type=text],input[type=password],input[type=email]{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--text);font:inherit}'
       . 'input:focus{outline:2px solid var(--accent);outline-offset:1px}'
       . '.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:520px){.row{grid-template-columns:1fr}}'
       . 'button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:12px 18px;cursor:pointer;background:var(--accent);color:#fff}'
       . 'button.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}'
       . '.req{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}.req:last-child{border:0}'
       . '.ok{color:var(--ok);font-weight:700}.bad{color:var(--bad);font-weight:700}.warn{color:var(--warn);font-weight:700}'
       . '.msg{padding:12px 14px;border-radius:10px;margin-bottom:14px;font-size:14px}.msg.err{background:rgba(200,30,58,.1);border:1px solid var(--bad)}'
       . '.msg.good{background:rgba(13,148,136,.1);border:1px solid var(--ok)}.msg.note{background:rgba(180,83,9,.1);border:1px solid var(--warn)}'
       . 'code{background:rgba(127,127,127,.15);padding:1px 6px;border-radius:5px;font-size:13px}.chk{display:flex;gap:10px;align-items:flex-start;margin-top:14px}.chk input{margin-top:5px}'
       . '</style></head><body><div class="wrap"><h1>Bar<span>Shift</span> Pro</h1><p class="sub">Asennusohjelma</p>' . $body . '</div></body></html>';
    exit;
}

// ---------- Onko jo asennettu? ----------
$envCfg = getenv('BARSHIFT_CONFIG');
if (file_exists($configPath) || file_exists($lockPath) || ($envCfg && is_readable($envCfg))) {
    page('Asennettu jo', '<div class="card"><div class="msg note"><b>BarShift on jo asennettu.</b><br>'
        . 'Poista <code>install.php</code> ja <code>install_token.php</code> palvelimelta, jos ne ovat vielä olemassa. '
        . 'Uudelleenasennus: poista <code>config.php</code> ja <code>install.lock</code> ensin.</div></div>', 403);
}

// ---------- Asennustunniste ----------
if (!is_file($tokenPath)) {
    $t = bin2hex(random_bytes(16));
    $ok = @file_put_contents($tokenPath, "<?php http_response_code(404); exit; // TOKEN: {$t}\n", LOCK_EX);
    if ($ok === false) {
        page('Kansio ei ole kirjoitettava', '<div class="card"><div class="msg err">Asennusohjelma ei voi kirjoittaa kansioon <code>'
            . h(basename($root)) . '</code>. Anna kansiolle kirjoitusoikeus (esim. 755, omistajana PHP-käyttäjä) ja lataa sivu uudelleen.</div></div>', 500);
    }
    @chmod($tokenPath, 0640);
}
$expectedToken = preg_match('/TOKEN: ([a-f0-9]{32})/', (string)@file_get_contents($tokenPath), $m) ? $m[1] : '';

session_name('BSINSTALL');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')]);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$_SESSION['tries'] = $_SESSION['tries'] ?? 0;

// ---------- Apufunktiot ----------
function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

/** Luo VAPID-avainpari (P-256) ilman ulkoisia kirjastoja. */
function makeVapidKeys(): ?array {
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$key) return null;
    $d = openssl_pkey_get_details($key);
    if (!isset($d['ec']['x'], $d['ec']['y'], $d['ec']['d'])) return null;
    $pad = fn(string $v) => str_pad($v, 32, "\0", STR_PAD_LEFT);
    return ['public' => b64url("\x04" . $pad($d['ec']['x']) . $pad($d['ec']['y'])), 'private' => b64url($pad($d['ec']['d']))];
}

function requirements(string $root, string $driver = 'sqlite'): array {
    $r = [];
    $r[] = ['PHP-versio 8.1 tai uudempi', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION, true];
    $r[] = $driver === 'sqlite'
        ? ['PHP-laajennus: pdo_sqlite (SQLite-tietokanta)', extension_loaded('pdo_sqlite'), extension_loaded('pdo_sqlite') ? 'ok' : 'puuttuu: valitse MariaDB/MySQL tai pyydä hostingilta', true]
        : ['PHP-laajennus: mysqli (MariaDB/MySQL)', extension_loaded('mysqli'), extension_loaded('mysqli') ? 'ok' : 'puuttuu', true];
    foreach (['openssl' => 'openssl', 'mbstring' => 'mbstring', 'json' => 'json', 'curl' => 'curl'] as $ext => $label) {
        $r[] = ["PHP-laajennus: $label", extension_loaded($ext), extension_loaded($ext) ? 'ok' : 'puuttuu', true];
    }
    $r[] = ['Riippuvuudet asennettu (vendor/)', is_file($root . '/vendor/autoload.php'),
            is_file($root . '/vendor/autoload.php') ? 'ok' : 'aja: composer install --no-dev', true];
    if ($driver === 'sqlite') {
        $d = $root . '/data';
        $okd = is_dir($d) ? is_writable($d) : is_writable($root);
        $r[] = ['Kansio data/ kirjoitettava (SQLite-tiedosto)', $okd, $okd ? (is_dir($d) ? 'ok' : 'luodaan') : 'ei kirjoitusoikeutta', true];
    }
    $r[] = ['Tietokantarakenne (db/schema.sql)', is_file($root . '/db/schema.sql'), is_file($root . '/db/schema.sql') ? 'ok' : 'puuttuu', true];
    $r[] = ['Kansio kirjoitettava (config.php)', is_writable($root), is_writable($root) ? 'ok' : 'ei kirjoitusoikeutta', true];
    $up = $root . '/uploads';
    $r[] = ['Kuvakansio uploads/ kirjoitettava', is_dir($up) ? is_writable($up) : is_writable($root), is_dir($up) ? (is_writable($up) ? 'ok' : 'ei kirjoitusoikeutta') : 'luodaan', false];
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $r[] = ['HTTPS käytössä', $https, $https ? 'ok' : 'suositus: ota SSL käyttöön ennen tuotantoa', false];
    return $r;
}

function bsTableExistsSafe($c, string $t): bool {
    require_once __DIR__ . '/db/migrate_lib.php';
    return bsTableExists($c, $t);
}

function runSql($c, string $sql): ?string {
    if (bsIsSqlite($c)) {
        foreach (bsSqlStatements($sql) as $stmt) {
            if (!$c->query($stmt)) return $c->error . ' (' . substr($stmt, 0, 60) . ')';
        }
        return null;
    }
    if (!$c->multi_query($sql)) return $c->error;
    do { if ($res = $c->store_result()) $res->free(); } while ($c->more_results() && $c->next_result());
    return $c->errno ? $c->error : null;
}

// Varmistaa, ettei data/-kansion tiedostoja voi ladata selaimella. true = suojattu, false = AVOIN, null = ei voitu tarkistaa.
function dataFolderProtected(string $root, string $file): ?bool {
    if (!function_exists('curl_init')) return null;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $base = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/\\');
    $url = ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $base . '/data/' . rawurlencode(basename($file));
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => false]);
    $ok = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($ok === false || $code === 0) return null;
    return $code !== 200;
}

// ---------- Lomakkeen tiedot ----------
$in = [
    'db_driver' => (($_POST['db_driver'] ?? '') === 'mysql' || (!isset($_POST['db_driver']) && !extension_loaded('pdo_sqlite') && extension_loaded('mysqli'))) ? 'mysql' : 'sqlite',
    'db_host' => trim((string)($_POST['db_host'] ?? 'localhost')),
    'db_name' => trim((string)($_POST['db_name'] ?? '')),
    'db_user' => trim((string)($_POST['db_user'] ?? '')),
    'db_pass' => (string)($_POST['db_pass'] ?? ''),
    'email'   => trim((string)($_POST['email'] ?? '')),
    'pub_name'=> trim((string)($_POST['pub_name'] ?? '')),
    'admin_name' => trim((string)($_POST['admin_name'] ?? '')),
    'su_user' => trim((string)($_POST['su_user'] ?? 'admin')),
    'su_pass' => (string)($_POST['su_pass'] ?? ''),
    'su_pass2'=> (string)($_POST['su_pass2'] ?? ''),
    'demo'    => !empty($_POST['demo']),
];
$saved = $_SESSION['db_saved'] ?? null;   // palvelimen istunnossa, ei koskaan selaimen HTML:ssä
$matchesSaved = function (array $i): bool { $sv = $_SESSION['db_saved'] ?? null; return is_array($sv) && $sv['host'] === $i['db_host'] && $sv['name'] === $i['db_name'] && $sv['user'] === $i['db_user']; };
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $in['db_pass'] === '' && $matchesSaved($in)) $in['db_pass'] = (string)$saved['pass'];
$errors = []; $notes = []; $done = null;
$reqs = requirements($root, $in['db_driver']);
$blocking = array_filter($reqs, fn($x) => $x[3] && !$x[1]);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = (string)($_POST['act'] ?? '');
    if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) {
        $errors[] = 'Istunto vanheni. Yritä uudelleen.';
    } elseif ($_SESSION['tries'] >= 10) {
        $errors[] = 'Liian monta väärää tunnistetta. Sulje selain ja aloita alusta.';
    } elseif (empty($_SESSION['token_ok']) && (!$expectedToken || !hash_equals($expectedToken, trim((string)($_POST['token'] ?? ''))))) {
        $_SESSION['tries']++; sleep(1);
        $errors[] = 'Asennustunniste on väärä. Avaa tiedosto <code>install_token.php</code> palvelimella (File Manager/FTP) ja kopioi sieltä <code>TOKEN:</code>-jälkeinen teksti.';
    } elseif (($_SESSION['token_ok'] = true) && $blocking) {
        $errors[] = 'Korjaa ensin vaatimukset, joissa on punainen merkintä.';
    } else {
        // Kenttien tarkistus
        $isSqlite = $in['db_driver'] === 'sqlite';
        if (!$isSqlite) {
            if (!preg_match('/^[A-Za-z0-9._:\-]{1,120}$/', $in['db_host'])) $errors[] = 'Tietokannan osoite on virheellinen.';
            if (!preg_match('/^[A-Za-z0-9_$\-]{1,64}$/', $in['db_name'])) $errors[] = 'Tietokannan nimi on virheellinen (sallitut: kirjaimet, numerot, _ $ -).';
            if ($in['db_user'] === '' || strlen($in['db_user']) > 80) $errors[] = 'Tietokantakäyttäjä puuttuu.';
        }

        $conn = null; $sqliteRel = null;
        require_once $root . '/lib/db.php';
        require_once $root . '/lib/sqlite_ddl.php';
        if (!$errors) {
            if ($isSqlite) {
                $sqliteRel = $_SESSION['sqlite_rel'] ?? ($_SESSION['sqlite_rel'] = 'data/barshift-' . bin2hex(random_bytes(8)) . '.sqlite');
                $dataDir = $root . '/data';
                if (!is_dir($dataDir) && !@mkdir($dataDir, 0750, true)) { $errors[] = 'Kansiota data/ ei voi luoda: anna asennuskansiolle kirjoitusoikeus.'; }
                else {
                    @file_put_contents($dataDir . '/.htaccess', "# Tietokanta ei saa olla ladattavissa selaimella\nRequire all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
                    @file_put_contents($dataDir . '/index.html', '');
                    @file_put_contents($dataDir . '/web.config', '<?xml version="1.0"?><configuration><system.webServer><security><requestFiltering><fileExtensions><add fileExtension=".sqlite" allowed="false" /></fileExtensions></requestFiltering></security></system.webServer></configuration>');
                    $conn = bsConnect(['db_driver' => 'sqlite', 'db_file' => $sqliteRel]);
                    if ($conn->connect_error) { $errors[] = 'SQLite-tietokannan avaus epäonnistui. Tarkista kansion data/ oikeudet.'; $conn = null; }
                }
            } else {
                $conn = bsConnect(['db_driver' => 'mysql', 'db_host' => $in['db_host'], 'db_user' => $in['db_user'], 'db_pass' => $in['db_pass'], 'db_name' => $in['db_name']]);
                if ($conn->connect_errno) {
                    $errors[] = 'Tietokantayhteys epäonnistui (virhe ' . (int)$conn->connect_errno . '). Tarkista osoite, nimi, käyttäjä ja salasana sekä että käyttäjällä on oikeus kantaan.';
                    $conn = null;
                } else {
                    $_SESSION['db_saved'] = ['host' => $in['db_host'], 'name' => $in['db_name'], 'user' => $in['db_user'], 'pass' => $in['db_pass']];
                    $saved = $_SESSION['db_saved'];
                }
            }
        }

        if ($act === 'test' && $conn) {
            $notes[] = $isSqlite ? 'SQLite-tietokanta voidaan luoda kansioon <code>data/</code>.' : 'Tietokantayhteys toimii.';
            if (bsTableExistsSafe($conn, 'users')) $notes[] = 'Kannassa on jo <code>users</code>-taulu: rakenne päivitetään turvallisesti, olemassa olevaa dataa ei poisteta.';
        }

        if ($act === 'install') {
            if (!filter_var($in['email'], FILTER_VALIDATE_EMAIL) || strlen($in['email']) > 120) $errors[] = 'Anna kelvollinen sähköpostiosoite (käytetään push-ilmoitusten lähettäjätietona).';
            if ($in['pub_name'] === '' || mb_strlen($in['pub_name']) > 100) $errors[] = 'Anna baarin nimi (enintään 100 merkkiä).';
            if ($in['admin_name'] === '' || mb_strlen($in['admin_name']) > 100) $errors[] = 'Anna ylläpitäjän nimi.';
            if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $in['su_user'])) $errors[] = 'Ylläpitäjän tunnus: 3–50 merkkiä (kirjaimet, numerot, . _ -).';
            if (strlen($in['su_pass']) < 12) $errors[] = 'Ylläpitäjän salasanan on oltava vähintään 12 merkkiä.';
            if ($in['su_pass'] !== $in['su_pass2']) $errors[] = 'Salasanat eivät täsmää.';

            if (!$errors && $conn) {
                // 1) Rakenne
                require_once $root . '/db/migrate_lib.php';
                $freshDb = !bsTableExists($conn, 'users');
                if ($e = bsApplySchema($conn, $root . '/db/schema.sql')) { $errors[] = 'Taulujen luonti epäonnistui: ' . h($e) . ' (tarvitseeko käyttäjä CREATE-oikeuden?)'; }
            }
            if (!$errors && $conn) {
                [, $migErr] = bsRunMigrations($conn, $root . '/db/migrations', $freshDb);
                if ($migErr) $errors[] = h($migErr);
                // 3) Baari ja sen ylläpitäjä
                $exist = $conn->query("SELECT id FROM pubs ORDER BY id LIMIT 1");
                if (!$exist || !$exist->fetch_assoc()) {
                    $ps = $conn->prepare("INSERT INTO pubs (name) VALUES (?)");
                    $ps->bind_param('s', $in['pub_name']);
                    if (!$ps->execute()) $errors[] = 'Baarin luonti epäonnistui.';
                }
                $hash = password_hash($in['su_pass'], PASSWORD_DEFAULT);
                $st = $conn->prepare("INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, 'admin')
                                      ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'admin'");
                if (!$st) { $errors[] = 'Ylläpitäjän luonti epäonnistui.'; }
                else {
                    $st->bind_param('sss', $in['admin_name'], $in['su_user'], $hash);
                    if (!$st->execute()) $errors[] = 'Ylläpitäjän luonti epäonnistui.';
                }
            }
            if (!$errors && $conn && $in['demo']) {
                $seed = $root . '/db/seed_demo.sql';
                if (!is_file($seed)) $errors[] = 'Demodatatiedostoa (db/seed_demo.sql) ei löydy.';
                elseif ($e = runSql($conn, (string)file_get_contents($seed))) $errors[] = 'Demodatan tuonti epäonnistui: ' . h($e);
            }
            if (!$errors) {
                // 4) Avaimet ja config
                $vapid = makeVapidKeys();
                if (!$vapid) { $errors[] = 'VAPID-avainten luonti epäonnistui (openssl ei tue P-256-käyrää).'; }
                else {
                    $cfg = ($isSqlite ? ['db_driver' => 'sqlite', 'db_file' => $sqliteRel]
                                      : ['db_driver' => 'mysql', 'db_host' => $in['db_host'], 'db_name' => $in['db_name'], 'db_user' => $in['db_user'], 'db_pass' => $in['db_pass']]) + [
                        'vapid_subject' => 'mailto:' . $in['email'], 'vapid_public_key' => $vapid['public'], 'vapid_private_key' => $vapid['private'],
                        'message_key' => base64_encode(random_bytes(32)),
                        'allowed_origins' => [],
                    ];
                    $php = "<?php\n// Luotu asennusohjelmalla " . date('c') . ". ÄLÄ COMMITOI TÄTÄ TIEDOSTOA.\nreturn " . var_export($cfg, true) . ";\n";
                    $fh = @fopen($configPath, 'x');   // 'x' = ei ylikirjoita olemassa olevaa
                    if (!$fh) { $errors[] = 'config.php:n kirjoitus epäonnistui (kansio ei kirjoitettava tai tiedosto on jo olemassa).'; }
                    else {
                        fwrite($fh, $php); fclose($fh); @chmod($configPath, 0640);
                        if (!is_dir($root . '/uploads')) @mkdir($root . '/uploads', 0755, true);
                        $protected = $isSqlite ? dataFolderProtected($root, $sqliteRel) : true;
                        @file_put_contents($lockPath, 'Asennettu ' . date('c') . "\n");
                        @unlink($tokenPath);
                        $selfDeleted = @unlink(__FILE__);
                        $done = ['user' => $in['su_user'], 'deleted' => $selfDeleted, 'demo' => $in['demo'], 'dataOpen' => $isSqlite && $protected === false];
                        $_SESSION = [];
                        session_destroy();
                    }
                }
            }
        }
    }
}

// ---------- Valmis ----------
if ($done) {
    $login = $done['user'];
    $body = '<div class="card"><div class="msg good"><b>Asennus valmis.</b></div>'
        . '<p>Kirjaudu sovellukseen tunnuksella <code>' . h($login) . '</code> ja valitsemallasi salasanalla.</p>'
        . (!empty($done['dataOpen']) ? '<div class="msg err"><b>Varoitus:</b> kansio <code>data/</code> näyttää olevan ladattavissa selaimella. Estä pääsy (Apache: <code>data/.htaccess</code> on luotu, mutta palvelin ei ehkä lue sitä; nginx: <code>location ^~ /data/ { deny all; }</code>) tai siirrä tietokanta www-juuren ulkopuolelle ja muuta config.php:n <code>db_file</code>.</div>' : '')
        . ($done['demo'] ? '<div class="msg note">Demodata on tuotu. Demobaarin käyttäjien salasana on julkinen (ks. README), joten <b>älä käytä demodataa tuotannossa</b>.</div>' : '')
        . ($done['deleted'] ? '<p class="ok">✓ install.php ja asennustunniste poistettiin palvelimelta.</p>'
                            : '<div class="msg err"><b>Poista nyt käsin</b> tiedostot <code>install.php</code> ja <code>install_token.php</code> palvelimelta. (Asennusohjelma on lukittu, mutta poisto on silti suositeltavaa.)</div>')
        . '<p>Seuraavat askeleet: tarkista Baarin asetukset ja lisää työntekijät.</p>'
        . '<div class="actions"><a href="index.php"><button type="button">Avaa BarShift</button></a></div></div>';
    page('Asennus valmis', $body);
}

// ---------- Lomake ----------
$body = '';
foreach ($errors as $e) $body .= '<div class="msg err">' . $e . '</div>';
foreach ($notes as $n) $body .= '<div class="msg good">' . $n . '</div>';

$body .= '<div class="card"><h2>1. Vaatimukset</h2>';
foreach ($reqs as [$label, $ok, $info, $must]) {
    $cls = $ok ? 'ok' : ($must ? 'bad' : 'warn');
    $body .= '<div class="req"><span>' . h($label) . '</span><span class="' . $cls . '">' . ($ok ? '✓ ' : ($must ? '✗ ' : '! ')) . h($info) . '</span></div>';
}
$body .= '</div>';

$body .= '<form method="post" autocomplete="off"><input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">';
$body .= '<div class="card"><h2>2. Asennustunniste</h2>';
if (!empty($_SESSION['token_ok'])) {
    $body .= '<p class="ok" style="margin:0">✓ Tunniste hyväksytty tälle istunnolle.</p></div>';
} else {
    $body .= '<p style="margin:0 0 8px;font-size:14px;color:var(--muted)">Varmistaa, että asennusta ajaa sivuston ylläpitäjä. Avaa palvelimella tiedosto <code>install_token.php</code> (File Manager / FTP) ja kopioi <code>TOKEN:</code>-sanan jälkeinen teksti tähän.</p>'
           . '<label for="token">Asennustunniste</label><input type="text" id="token" name="token" required autocomplete="off" spellcheck="false" maxlength="64"></div>';
}

$body .= '<div class="card"><h2>3. Tietokanta</h2>'
       . '<label class="chk" style="font-weight:400;margin-top:6px"><input type="radio" name="db_driver" value="sqlite"' . ($in['db_driver'] === 'sqlite' ? ' checked' : '') . '><span><b>SQLite (suositus)</b>: ei erillistä tietokantapalvelinta, ei tunnuksia. Tiedot tallennetaan yhteen tiedostoon kansiossa <code>data/</code>.</span></label>'
       . '<label class="chk" style="font-weight:400;margin-top:8px"><input type="radio" name="db_driver" value="mysql"' . ($in['db_driver'] === 'mysql' ? ' checked' : '') . '><span><b>MariaDB / MySQL</b>: isompiin asennuksiin tai jos tietokantapalvelin on jo olemassa. Luo tyhjä tietokanta ja käyttäjä esim. cPanelin MySQL Databases -työkalulla ja täytä tiedot alle.</span></label>'
       . '<div class="row"><div><label for="db_host">Osoite (vain MariaDB)</label><input type="text" id="db_host" name="db_host" value="' . h($in['db_host']) . '"></div>'
       . '<div><label for="db_name">Tietokannan nimi</label><input type="text" id="db_name" name="db_name" value="' . h($in['db_name']) . '"></div></div>'
       . '<div class="row"><div><label for="db_user">Käyttäjä</label><input type="text" id="db_user" name="db_user" value="' . h($in['db_user']) . '"></div>'
       . '<div><label for="db_pass">Salasana</label><input type="password" id="db_pass" name="db_pass" autocomplete="new-password"' . ($matchesSaved($in) ? ' placeholder="•••••••• (tallennettu, jätä tyhjäksi)"' : '') . '></div></div>'
       . '<div class="actions"><button type="submit" name="act" value="test" class="ghost" formnovalidate>Testaa tietokanta</button></div></div>';

$body .= '<div class="card"><h2>4. Baari ja ylläpitäjä</h2>'
       . '<label for="pub_name">Baarin nimi</label><input type="text" id="pub_name" name="pub_name" value="' . h($in['pub_name']) . '" required maxlength="100"><small>Tämä asennus palvelee vain tätä yhtä baaria.</small>'
       . '<label for="admin_name">Ylläpitäjän nimi</label><input type="text" id="admin_name" name="admin_name" value="' . h($in['admin_name']) . '" required maxlength="100">'
       . '<label for="su_user">Ylläpitäjän tunnus</label><input type="text" id="su_user" name="su_user" value="' . h($in['su_user']) . '" required>'
       . '<label for="email">Sähköposti</label><input type="email" id="email" name="email" value="' . h($in['email']) . '" required><small>Käytetään push-ilmoitusten lähettäjätietona. Ei lähetetä mihinkään muualle.</small>'
       . '<div class="row"><div><label for="su_pass">Salasana (väh. 12 merkkiä)</label><input type="password" id="su_pass" name="su_pass" minlength="12" autocomplete="new-password"></div>'
       . '<div><label for="su_pass2">Salasana uudelleen</label><input type="password" id="su_pass2" name="su_pass2" minlength="12" autocomplete="new-password"></div></div></div>';

$demoExists = is_file($root . '/db/seed_demo.sql');
$body .= '<div class="card"><h2>5. Valinnat</h2>'
       . ($demoExists ? '<label class="chk" style="font-weight:400"><input type="checkbox" name="demo" value="1"' . ($in['demo'] ? ' checked' : '') . '><span><b>Tuo demodata</b> (demobaari, 2 kk esimerkkidataa). Vain testi- ja esittelykäyttöön: demokäyttäjillä on julkinen salasana.</span></label>'
                      : '<p style="margin:0;color:var(--muted);font-size:14px">Demodatatiedostoa ei löytynyt, joten demodata ohitetaan.</p>')
       . '<p style="font-size:14px;color:var(--muted);margin:14px 0 0">Asennus luo automaattisesti: <code>config.php</code> (oikeudet 640), push-ilmoitusten VAPID-avaimet ja viestien salausavaimen. Avaimia ei näytetä ruudulla.</p>'
       . '<div class="actions"><button type="submit" name="act" value="install"' . ($blocking ? ' disabled' : '') . '>Asenna BarShift</button></div></div>';
$body .= '</form>';
page('BarShift: asennus', $body);
