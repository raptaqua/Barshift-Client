<?php
error_reporting(0);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Odottamaton PHP-virhe (poikkeus tai kuolettava virhe) palautetaan aina JSON-muodossa; yksityiskohdat vain kirjautuneelle ylläpitäjälle ja lokiin
function bsFatalJson(string $msg, string $where): void {
    error_log("BarShift fatal: $msg @ $where");
    if (headers_sent()) return;
    while (ob_get_level() > 0) @ob_end_clean();
    http_response_code(500); header('Content-Type: application/json; charset=utf-8');
    $admin = isset($GLOBALS['me']) && is_array($GLOBALS['me']) && in_array($GLOBALS['me']['role'] ?? '', ['admin'], true);
    echo json_encode(['error' => 'Palvelinvirhe' . ($admin ? ': ' . $msg . ' (' . $where . ')' : '. Yritä hetken päästä uudelleen.')], JSON_UNESCAPED_UNICODE);
}
set_exception_handler(function (\Throwable $e) { bsFatalJson($e->getMessage(), basename($e->getFile()) . ':' . $e->getLine()); });
register_shutdown_function(function () { $e = error_get_last(); if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_RECOVERABLE_ERROR], true)) bsFatalJson($e['message'], basename($e['file']) . ':' . $e['line']); });

// Selkeä virhe (ilman polkuja) jos asennus on kesken
$cfgPath = getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/config.php';
function setupError(string $msg) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!is_readable($cfgPath)) { error_log("BarShift: config puuttuu: $cfgPath"); setupError('Asennus kesken: avaa install.php selaimessa (tai kopioi config.example.php -> config.php)'); }
if (!is_readable(__DIR__ . '/vendor/autoload.php')) { error_log('BarShift: vendor/ puuttuu'); setupError('Asennus kesken: aja "composer install --no-dev"'); }
require_once __DIR__ . '/lib/db.php';
$cfg = require $cfgPath;
if (($missingExt = bsDbMissingExtension($cfg)) !== null) { error_log("BarShift: $missingExt"); setupError("Asennus kesken: $missingExt"); }
foreach (array_merge(bsDbDriver($cfg) === 'mysql' ? ['db_host', 'db_name', 'db_user', 'db_pass'] : [], ['vapid_subject', 'vapid_public_key', 'vapid_private_key']) as $k) {
    if (!isset($cfg[$k])) { error_log("BarShift: config-avain puuttuu: $k"); setupError("Asennus kesken: config.php:stä puuttuu '$k'"); }
}

// ===================== PERUSTURVA =====================
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// CORS: sallitaan vain erikseen määritellyt originit (ei "*")
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $cfg['allowed_origins'] ?? [], true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

function jsonResponse($data, int $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    echo $json === false ? '{"error":"Virhe vastauksen muodostamisessa"}' : $json;
    exit;
}
function fail(string $msg, int $status = 400) { jsonResponse(['error' => $msg], $status); }
function dbError($conn_or_stmt) {
    error_log('BarShift DB error: ' . $conn_or_stmt->errno . ' ' . $conn_or_stmt->error);
    // 1054 = tuntematon sarake, 1146 = taulua ei ole: ohjelmisto on päivitetty mutta tietokanta ei
    if (in_array((int)$conn_or_stmt->errno, [1054, 1146], true)) {
        fail('Tietokanta on päivittämättä. Aja komento "php migrate.php".', 500);
    }
    $isAdmin = isset($GLOBALS['me']) && is_array($GLOBALS['me']) && ($GLOBALS['me']['role'] ?? '') === 'admin';
    fail('Tietokantavirhe' . ($isAdmin ? ' (' . substr((string)$conn_or_stmt->error, 0, 200) . ')' : ''), 500);   // ylläpitäjälle tarkempi syy
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(204); exit; }

// CSRF: muutospyynnön Origin/Referer-isännän on vastattava palvelinta
if ($method !== 'GET') {
    $src = $origin !== '' ? $origin : ($_SERVER['HTTP_REFERER'] ?? '');
    if ($src !== '') {
        $srcHost = parse_url($src, PHP_URL_HOST);
        $srcPort = parse_url($src, PHP_URL_PORT);
        $srcAuth = $srcHost . ($srcPort ? ":$srcPort" : '');
        $ok = hash_equals(strtolower($_SERVER['HTTP_HOST'] ?? ''), strtolower($srcAuth))
              || in_array($origin, $cfg['allowed_origins'] ?? [], true);
        if (!$ok) fail('Kielletty', 403);
    }
}

// (Istunto käynnistetään vasta julkisten reittien jälkeen, ks. session_start alempana.)
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/lib/notify.php';   // push + sähköposti (jono)
require __DIR__ . '/lib/stripe.php';   // verkkomaksu (valinnainen)
require __DIR__ . '/lib/geocode.php';  // osoitehaku (sijainti kartalle)
require __DIR__ . '/lib/pdf.php';      // palkkaerittelyn PDF
require __DIR__ . '/lib/waitlist.php'; // tapahtumien odotuslista
require __DIR__ . '/lib/hub.php';      // keskuspalvelin (julkiset tapahtumat, keikkatyö)

$vapid_auth = ['VAPID' => [
    'subject'    => $cfg['vapid_subject'],
    'publicKey'  => $cfg['vapid_public_key'],
    'privateKey' => $cfg['vapid_private_key'],
]];

$conn = bsConnect($cfg);
if ($conn->connect_error) { error_log('BarShift DB connect: ' . $conn->connect_error); fail('Palvelinvirhe', 500); }
hubLoadConfig($conn, $cfg);   // keskusyhteys hallintapaneelista (tai config.php)

function prepareQuery($conn, $sql) {
    $stmt = $conn->prepare($sql);
    if (!$stmt) dbError($conn);
    return $stmt;
}
function run($stmt) { if (!$stmt->execute()) dbError($stmt); return $stmt; }
function fetchAllRows($stmt) { run($stmt); return $stmt->get_result()->fetch_all(MYSQLI_ASSOC); }
function fetchOne($stmt) { run($stmt); return $stmt->get_result()->fetch_assoc() ?: null; }

// ===================== TUNNISTAUTUMINEN & OIKEUDET =====================
function currentUser($conn) {
    if (empty($_SESSION['uid'])) return null;
    $stmt = prepareQuery($conn, "SELECT id, name, username, role, status, anonymized_at, access_role FROM users WHERE id = ?");
    $stmt->bind_param("i", $_SESSION['uid']);
    $u = fetchOne($stmt);
    if (!$u || ($u['status'] ?? '') === 'frozen' || !empty($u['anonymized_at'])) { $_SESSION = []; return null; }
    $u['perms'] = userPerms($conn, $u);
    return $u;
}
function requireLogin($conn) {
    $u = currentUser($conn);
    if (!$u) fail('Kirjautuminen vaaditaan', 401);
    return $u;
}
function isAdmin($u) { return $u['role'] === 'admin'; }
function requireAdmin($u) { if (!isAdmin($u)) fail('Ei oikeuksia', 403); }

// ===================== KÄYTTÖOIKEUSROOLIT =====================
// Ylläpitäjä saa aina kaiken. Työntekijän oikeudet määräytyvät hänen käyttöoikeusroolistaan (baarin asetus pubs.access_roles).
// "Lisäoikeudet" delegoivat ylläpitäjän toimintoja, "perusoikeudet" ovat oletuksena päällä ja ne voi poistaa roolilta.
const PERM_CATALOG = [
    'shifts.manage'    => ['Vuorojen suunnittelu', 'Luoda, muokata, poistaa ja julkaista vuoroja, käyttää pohjia ja miehityssääntöjä, korjata leimauksia', 'extra'],
    'absences.approve' => ['Poissaolojen käsittely', 'Hyväksyä ja hylätä poissaolot ja lomat, nähdä poissaolojen syyt, merkitä poissaoloja muille', 'extra'],
    'events.manage'    => ['Tapahtumat ja varaukset', 'Hallita tapahtumia, ilmoittautumisia ja pöytävarauksia', 'extra'],
    'content.manage'   => ['Sisällöt', 'Hallita ilmoitustaulua, rutiineja, dokumentteja, perehdytystä ja kyselyjä', 'extra'],
    'sales.view'       => ['Myynti ja kassa', 'Nähdä myyntitilastot, kassatilitykset ja kuvat, korjata ja poistaa tilityksiä', 'extra'],
    'payroll.view'     => ['Palkat ja raportit', 'Nähdä palkka-ajo, raportit, työaikapankki ja analytiikka (sisältää kaikkien palkat)', 'extra'],
    'cash.submit'      => ['Kassatilityksen kirjaus', 'Kirjata oman vuoron kassatilitys (viimeiset 3 päivää)', 'base'],
    'trades.use'       => ['Vuoronvaihdot', 'Tarjota ja pyytää vuoronvaihtoja', 'base'],
    'absences.request' => ['Poissaolohakemukset', 'Hakea poissaoloa ja lomaa', 'base'],
];
const EMPLOYEE_BASE_PERMS = ['cash.submit', 'trades.use', 'absences.request'];
// Palauttaa baarin roolit: [{id, name, perms[]}]; työntekijä-rooli on aina mukana
function accessRolesOf($raw): array {
    $list = json_decode((string)$raw, true); $out = []; $hasEmp = false;
    foreach (is_array($list) ? $list : [] as $r) {
        if (!is_array($r) || !preg_match('/^[a-z0-9_]{1,40}$/', (string)($r['id'] ?? ''))) continue;
        $perms = array_values(array_intersect(array_map('strval', (array)($r['perms'] ?? [])), array_keys(PERM_CATALOG)));
        if ($r['id'] === 'employee') $hasEmp = true;
        $out[] = ['id' => $r['id'], 'name' => mb_substr((string)($r['name'] ?? $r['id']), 0, 40), 'perms' => $perms];
    }
    if (!$hasEmp) array_unshift($out, ['id' => 'employee', 'name' => 'Työntekijä', 'perms' => EMPLOYEE_BASE_PERMS]);
    return $out;
}
function userPerms($conn, array $u): array {
    if (($u['role'] ?? '') === 'admin') return array_keys(PERM_CATALOG);
    if (($u['role'] ?? '') !== 'employee') return [];
    $row = fetchOne(prepareQuery($conn, "SELECT access_roles FROM pubs ORDER BY id LIMIT 1"));
    $want = $u['access_role'] ?? null ?: 'employee';
    foreach (accessRolesOf($row['access_roles'] ?? null) as $r) if ($r['id'] === $want) return $r['perms'];
    foreach (accessRolesOf($row['access_roles'] ?? null) as $r) if ($r['id'] === 'employee') return $r['perms'];
    return EMPLOYEE_BASE_PERMS;
}
function can(array $u, string $perm): bool { return ($u['role'] ?? '') === 'admin' || in_array($perm, $u['perms'] ?? [], true); }
function requirePerm(array $u, string $perm) { if (!can($u, $perm)) fail('Ei oikeuksia', 403); }

// Onko rivi olemassa (sallitut taulut ennalta määritelty; kind -> taulu)
function rowExists($conn, string $kind, $id): bool {
    $table = [
        'shifts' => 'shifts', 'users' => 'users', 'events' => 'events', 'trades' => 'shift_trades', 'absences' => 'absences', 'notices' => 'notices', 'tasks' => 'tasks',
        'cash_reports' => 'cash_reports', 'skills' => 'skills', 'guests' => 'guests', 'bookings' => 'bookings', 'event_guests' => 'event_guests', 'shopping' => 'shopping_list',
        'time_entries' => 'time_entries', 'shift_logs' => 'shift_logs', 'shift_templates' => 'shift_templates', 'week_templates' => 'week_templates', 'staffing_rules' => 'staffing_rules',
        'checklists' => 'checklists', 'documents' => 'documents', 'kudos' => 'kudos', 'surveys' => 'surveys', 'availability_rules' => 'availability_rules',
    ][$kind] ?? null;
    if (!$table) return false;
    $id = (int)$id;
    $stmt = prepareQuery($conn, "SELECT 1 FROM `$table` WHERE id = ?");
    $stmt->bind_param("i", $id);
    return fetchOne($stmt) !== null;
}
function requireRow($conn, string $kind, $id) {
    if (!rowExists($conn, $kind, $id)) fail('Ei löydy', 404);
}

function limitStr($v, int $max, string $field) {
    $v = trim((string)($v ?? ''));
    if (mb_strlen($v) > $max) fail("Kenttä liian pitkä: $field");
    return $v;
}
function validDate($v, string $field) {
    if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !strtotime($v)) fail("Virheellinen päivämäärä: $field");
    return $v;
}
function validTime($v, string $field, bool $nullable = false) {
    if ($nullable && ($v === null || $v === '')) return null;
    if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $v)) fail("Virheellinen aika: $field");
    return $v;
}
// Hylkää yleisimmät salasanat, toistomerkit ja pelkät numerosarjat (ei korvaa hyvää salasanaa, mutta estää ilmeisimmät)
function passwordIsWeak(string $p): bool {
    static $common = ['password', 'salasana', 'qwertyui', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1', 'letmein1', 'welcome1', 'admin123', 'admin1234', 'iloveyou', 'monkey123', 'dragon123',
        'football', 'baseball', 'abc12345', 'abcd1234', 'passw0rd', 'p@ssw0rd', 'salasana1', 'salasana123', 'salasana2020', 'salasana2024', 'salasana2025', 'salasana2026', 'kissa123', 'koira123', 'suomi123',
        'suomi2024', 'suomi2025', 'suomi2026', 'baari123', 'barshift', 'barshift1', 'barshift123', 'demobaari', 'testitesti', 'testi1234', 'changeme', 'trustno1', 'sunshine', 'princess', 'master123'];
    $l = mb_strtolower($p);
    if (in_array($l, $common, true)) return true;
    if (preg_match('/^(.)\1+$/u', $l)) return true;                     // aaaaaaaa
    if (preg_match('/^\d+$/', $l) && strlen($l) < 12) return true;      // pelkkiä numeroita
    $seqs = ['0123456789', '1234567890', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm', 'äöåqwertyuiop'];
    foreach ($seqs as $q) { if (strlen($l) >= 8 && (strpos($q, $l) !== false || strpos(strrev($q), $l) !== false)) return true; }
    return false;
}
function validPassword($p) {
    if (!is_string($p) || strlen($p) < 8) fail('Salasanan on oltava vähintään 8 merkkiä');
    if (strlen($p) > 200) fail('Salasana on liian pitkä');
    if (passwordIsWeak($p)) fail('Salasana on liian helppo arvata. Käytä pidempää salasanaa tai lausetta, jota ei löydy yleisistä salasanalistoista.');
    return $p;
}
function nullableUserId($v) {
    return ($v === null || $v === '' || $v === 0 || $v === '0') ? null : (int)$v;
}

// Viestit salataan tallennuksessa (AES-256-GCM). Avain: config['message_key'] (base64, 32 tavua).
function messageKey($cfg) {
    $k = base64_decode($cfg['message_key'] ?? '', true);
    if ($k === false || strlen($k) !== 32) { error_log('BarShift: message_key puuttuu tai on virheellinen'); fail('Viestitoiminto ei ole käytössä', 500); }
    return $k;
}
function encryptMessage($cfg, string $plain): string {
    $iv = random_bytes(12);
    $ct = openssl_encrypt($plain, 'aes-256-gcm', messageKey($cfg), OPENSSL_RAW_DATA, $iv, $tag);
    if ($ct === false) fail('Salaus epäonnistui', 500);
    return 'v1:' . base64_encode($iv . $tag . $ct);
}
function decryptMessage($cfg, string $stored): string {
    if (strncmp($stored, 'v1:', 3) !== 0) return '🔒 (vanha viesti, ei luettavissa)';
    $raw = base64_decode(substr($stored, 3), true);
    if ($raw === false || strlen($raw) < 29) return '🔒 (viesti ei luettavissa)';
    $pt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', messageKey($cfg), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $pt === false ? '🔒 (viesti ei luettavissa)' : $pt;
}



// ===================== BAARI (pubs) =====================
const DEFAULT_ROLES = ['Baarimestari', 'Järjestyksenvalvoja', 'Tarjoilija', 'Vuoropäällikkö'];
// Palauttaa baarin rivin (luo puuttuvan oletusarvoilla). $adminView lisää laskutustiedot.
function getPub($conn, bool $adminView = false): array {
    $q = prepareQuery($conn, "SELECT * FROM pubs ORDER BY id LIMIT 1");
    $p = fetchOne($q);
    if (!$p) { run(prepareQuery($conn, "INSERT INTO pubs (name) VALUES ('Baari')")); $p = fetchOne(prepareQuery($conn, "SELECT * FROM pubs ORDER BY id LIMIT 1")); }
    $roles = json_decode((string)($p['roles'] ?? ''), true);
    $out = [
        'id' => (int)$p['id'], 'name' => $p['name'], 'timezone' => $p['timezone'],
        'roles' => (is_array($roles) && $roles) ? array_values($roles) : DEFAULT_ROLES,
        'min_rest_hours' => (float)$p['min_rest_hours'],
        'max_week_hours' => $p['max_week_hours'] === null ? null : (float)$p['max_week_hours'],
        'evening_start' => (int)$p['evening_start'], 'night_end' => (int)$p['night_end'], 'retention_months' => (int)$p['retention_months'], 'side_cost_pct' => (float)$p['side_cost_pct'], 'overtime_week_hours' => (float)$p['overtime_week_hours'], 'weekly_budget' => $p['weekly_budget'] === null ? null : (float)$p['weekly_budget'], 'reminder_hours' => (int)$p['reminder_hours'], 'clock_alert_minutes' => (int)$p['clock_alert_minutes'],
        'bonuses' => ['evening' => (float)$p['bonus_evening'], 'night' => (float)$p['bonus_night'], 'sat' => (float)$p['bonus_sat'], 'sun' => (float)$p['bonus_sun']],
    ];
    $out['features'] = ['tickets' => (bool)$p['feature_tickets'], 'bookings' => (bool)$p['feature_bookings'], 'bidding' => (bool)$p['feature_bidding'], 'autoschedule' => (bool)$p['feature_autoschedule'], 'reminders' => (bool)$p['feature_reminders'],
        'payments' => (bool)$p['feature_payments'], 'guests' => (bool)$p['feature_guests'],
        'hub_events' => (bool)$p['feature_hub_events'], 'hub_gigs' => (bool)$p['feature_hub_gigs'], 'hub_feed' => (bool)$p['feature_hub_feed']];
    $hc = $GLOBALS['cfg']['hub'] ?? null; $out['hub_connected'] = hubConfigured($GLOBALS['cfg'] ?? []);
    $out['hub_info'] = $out['hub_connected'] ? ['url' => $hc['url'], 'slug' => $hc['pub_slug'], 'source' => $hc['source'] ?? 'config'] : null;
    $hs = []; foreach (($GLOBALS['conn']->query("SELECT k, v FROM system_status WHERE k IN ('hub_last_sync', 'hub_last_error')") ?: []) as $r) $hs[$r['k']] = $r['v'];
    $out['hub_status'] = ['last_sync' => $hs['hub_last_sync'] ?? null, 'last_error' => $hs['hub_last_error'] ?? null];
    $out['guest_reminder_hours'] = (int)$p['guest_reminder_hours']; $out['reminder_sms'] = (bool)$p['reminder_sms'];
    $bh = json_decode((string)($p['booking_hours'] ?? ''), true);
    $out['booking'] = ['capacity' => (int)$p['booking_capacity'], 'max_party' => (int)$p['booking_max_party'], 'slot_minutes' => (int)$p['booking_slot_minutes'], 'duration_minutes' => (int)$p['booking_duration_minutes'],
        'lead_hours' => (int)$p['booking_lead_hours'], 'days_ahead' => (int)$p['booking_days_ahead'], 'auto_confirm' => (bool)$p['booking_auto_confirm'], 'hours' => is_array($bh) ? $bh : []];
    $out['pay_codes'] = ['base' => $p['pay_code_base'], 'evening' => $p['pay_code_evening'], 'night' => $p['pay_code_night'], 'sat' => $p['pay_code_sat'], 'sun' => $p['pay_code_sun']];
    if ($adminView) { $out['sales_target_week'] = $p['sales_target_week'] === null ? null : (float)$p['sales_target_week']; $out['sales_target_month'] = $p['sales_target_month'] === null ? null : (float)$p['sales_target_month']; $out['vat_rate'] = (float)$p['vat_rate']; }
    if ($adminView) foreach (['billing_name', 'billing_email', 'billing_vat', 'billing_address'] as $k) $out[$k] = $p[$k];
    return $out;
}

// Palkkalaskenta: jakaa ajanjakson tunteihin (15 min tarkkuus), baarin ilta-/yörajojen mukaan.
function wageParts(DateTime $from, DateTime $to, int $eveningStart, int $nightEnd): array {
    $r = ['n' => 0.0, 'e' => 0.0, 'ni' => 0.0, 'sa' => 0.0, 'su' => 0.0];
    $cur = clone $from;
    while ($cur < $to) {
        $next = (clone $cur)->modify('+15 minutes');
        if ($next > $to) $next = clone $to;
        $h = ($next->getTimestamp() - $cur->getTimestamp()) / 3600;
        $hour = (int)$cur->format('G'); $dow = (int)$cur->format('w');
        if ($hour >= $eveningStart && $hour < 24) $r['e'] += $h;
        if ($hour < $nightEnd) $r['ni'] += $h;
        if ($dow === 6) $r['sa'] += $h;
        if ($dow === 0) $r['su'] += $h;
        $r['n'] += $h;
        $cur = $next;
    }
    return $r;
}
function wageTotal(array $p, float $hourly, array $b): float {
    return $p['n'] * $hourly + $p['e'] * $b['evening'] + $p['ni'] * $b['night'] + $p['sa'] * $b['sat'] + $p['su'] * $hourly * ($b['sun'] - 1);
}
// CSV-solu: estää taulukkolaskennan kaavainjektion ja lainaa erikoismerkit
// Kassatilityksen laskennalliset kentät: odotettu käteinen = kassapohja + myynti − korttimaksut − kassasta maksetut + käteistipit; ero = lasketut käteiset − odotettu
function cashView(array $r): array {
    $r['has_photo'] = !empty($r['photo_path']); unset($r['photo_path']);
    $r['sales_total'] = (float)$r['sales_total'];
    foreach (['card_total', 'counted_cash', 'float_amount', 'expenses', 'tips'] as $k) $r[$k] = ($r[$k] ?? null) === null ? null : (float)$r[$k];
    $r['expected_cash'] = round(($r['float_amount'] ?? 0) + $r['sales_total'] - ($r['card_total'] ?? 0) - ($r['expenses'] ?? 0) + ($r['tips'] ?? 0), 2);
    $r['difference'] = $r['counted_cash'] === null ? null : round($r['counted_cash'] - $r['expected_cash'], 2);
    return $r;
}
function cashMoney($v, string $label, bool $required = false): ?float {
    if ($v === null || $v === '') { if ($required) fail("Anna $label"); return null; }
    if (is_string($v)) $v = str_replace(',', '.', $v);
    if (!is_numeric($v) || $v < 0 || $v > 10000000) fail("Virheellinen $label");
    return round((float)$v, 2);
}

// Järjestelmän tila: cronin ja varmuuskopion tuoreus, postijono. Käytössä Hallinta → Järjestelmä, etusivun hälytys ja health-päätepiste.
function systemStatus($conn, array $cfg): array {
    $map = []; if (($r = $conn->query("SELECT k, v FROM system_status")) ) foreach ($r->fetch_all(MYSQLI_ASSOC) as $x) $map[$x['k']] = $x['v'];
    $age = fn($iso) => $iso ? max(0, (int)round((time() - strtotime($iso)) / 60)) : null;
    $cronAge = $age($map['cron_last_run'] ?? null); $bkAge = $age($map['backup_last_ok'] ?? null);
    $expectBackup = !empty($cfg['backup_expected']) || $bkAge !== null;
    $cronMax = (int)($cfg['cron_max_minutes'] ?? 60); $bkMax = (int)($cfg['backup_max_hours'] ?? 48) * 60;
    $q = ['pending' => 0, 'failed' => 0];
    if ($r = $conn->query("SELECT SUM(sent_at IS NULL AND attempts < 5) p, SUM(sent_at IS NULL AND attempts >= 5) f FROM mail_queue")) { $row = $r->fetch_assoc(); $q = ['pending' => (int)$row['p'], 'failed' => (int)$row['f']]; }
    $mig = 0; if ($r = $conn->query("SELECT COUNT(*) c FROM schema_migrations")) $mig = (int)$r->fetch_assoc()['c'];
    $files = count(glob(__DIR__ . '/db/migrations/*.sql') ?: []);
    $free = @disk_free_space(__DIR__); $total = @disk_total_space(__DIR__);
    $alerts = [];
    if ($cronAge === null) $alerts[] = ['level' => 'warn', 'text' => 'Ajastettua ajoa (cron.php) ei ole ajettu kertaakaan. Muistutukset ja sähköpostijono eivät toimi ilman sitä.'];
    elseif ($cronAge > $cronMax) $alerts[] = ['level' => 'error', 'text' => "Ajastettu ajo (cron.php) ei ole pyörinyt $cronAge minuuttiin. Muistutukset ja sähköpostit eivät lähde."];
    if ($expectBackup && ($bkAge === null || $bkAge > $bkMax)) $alerts[] = ['level' => 'error', 'text' => $bkAge === null ? 'Varmuuskopiota ei ole tehty.' : 'Viimeisin onnistunut varmuuskopio on ' . round($bkAge / 60) . ' tuntia vanha.'];
    if ($q['failed'] > 0) $alerts[] = ['level' => 'warn', 'text' => $q['failed'] . ' sähköpostia ei ole onnistuttu lähettämään (tarkista SMTP-asetukset).'];
    if ($free !== false && $total && $free / $total < 0.05) $alerts[] = ['level' => 'error', 'text' => 'Levytila on lopussa (alle 5 % vapaana).'];
    if ($mig < $files) $alerts[] = ['level' => 'warn', 'text' => 'Kantamigraatioita ajamatta (' . ($files - $mig) . '). Aja php migrate.php.'];
    return ['cron' => ['last_run' => $map['cron_last_run'] ?? null, 'age_minutes' => $cronAge, 'max_minutes' => $cronMax],
        'backup' => ['expected' => $expectBackup, 'last_ok' => $map['backup_last_ok'] ?? null, 'age_hours' => $bkAge === null ? null : round($bkAge / 60, 1), 'info' => $map['backup_info'] ?? null, 'max_hours' => $bkMax / 60],
        'mail' => $q, 'migrations' => ['applied' => $mig, 'available' => $files], 'php' => PHP_VERSION,
        'disk' => $free === false ? null : ['free_gb' => round($free / 1073741824, 1), 'free_pct' => $total ? round($free / $total * 100) : null],
        'alerts' => $alerts, 'ok' => !array_filter($alerts, fn($a) => $a['level'] === 'error')];
}

// Vieraskortisto: vieras tunnistetaan sähköpostista (pieniksi kirjaimiksi) tai puhelinnumerosta (vain numerot)
function guestKeyEmail($e): ?string { $e = strtolower(trim((string)$e)); return $e === '' ? null : $e; }
function guestKeyPhone($p): ?string { $d = preg_replace('/\D+/', '', (string)$p); return strlen($d) >= 6 ? substr($d, -9) : null; }
function requireGuestsFeature($conn): void { if (!getPub($conn)['features']['guests']) fail('Vieraskortisto ei ole käytössä', 409); }

function csvCell($v): string {
    $s = (string)$v;
    if ($s !== '' && strpbrk($s[0], "=+-@\t\r") !== false && !is_numeric($s)) $s = "'" . $s;
    return (strpbrk($s, ";\"\n\r") !== false) ? '"' . str_replace('"', '""', $s) . '"' : $s;
}


// Palkka-/kustannuslaskenta kuukaudelta: rivi per työntekijä (leimaukset, muuten toteutuneet vuorot)
function computePayroll($conn, array $pub, string $month): array {
    $tz = new DateTimeZone($pub['timezone']);
    $from = $month . '-01 00:00:00';
    $to = date('Y-m-d H:i:s', strtotime($from . ' +1 month'));
    $today = (new DateTime('now', $tz))->format('Y-m-d');
    $us = prepareQuery($conn, "SELECT id, name, hourly_wage, employment_type FROM users ORDER BY name");
 $users = fetchAllRows($us);
    $te = prepareQuery($conn, "SELECT user_id, clock_in, clock_out FROM time_entries WHERE clock_out IS NOT NULL AND clock_in >= ? AND clock_in < ?");
    $te->bind_param("ss", $from, $to); $entries = fetchAllRows($te);
    $sh = prepareQuery($conn, "SELECT userId, date, start, end FROM shifts WHERE status = 'published' AND userId IS NOT NULL AND date >= ? AND date < ? AND date < ?");
    $fromD = $month . '-01'; $toD = substr($to, 0, 10);
    $sh->bind_param("sss", $fromD, $toD, $today); $shifts = fetchAllRows($sh);
    $rows = [];
    foreach ($users as $u) {
        $act = ['n' => 0, 'e' => 0, 'ni' => 0, 'sa' => 0, 'su' => 0]; $plan = $act;
        foreach ($entries as $t) if ((int)$t['user_id'] === (int)$u['id']) {
            $p = wageParts(new DateTime($t['clock_in']), new DateTime($t['clock_out']), $pub['evening_start'], $pub['night_end']);
            foreach ($p as $k => $v) $act[$k] += $v;
        }
        foreach ($shifts as $sft) if ((int)$sft['userId'] === (int)$u['id']) {
            $d1 = new DateTime($sft['date'] . ' ' . $sft['start']); $d2 = new DateTime($sft['date'] . ' ' . $sft['end']);
            if ($d2 <= $d1) $d2->modify('+1 day');
            $p = wageParts($d1, $d2, $pub['evening_start'], $pub['night_end']);
            foreach ($p as $k => $v) $plan[$k] += $v;
        }
        $useAct = $act['n'] > 0;           // leimaukset ensisijaisia, muuten toteutuneet suunnitellut vuorot
        $p = $useAct ? $act : $plan;
        if ($p['n'] <= 0) continue;
        $w = (float)$u['hourly_wage'];
        $rows[] = ['id' => (int)$u['id'], 'name' => $u['name'], 'employment_type' => $u['employment_type'], 'source' => $useAct ? 'leimaukset' : 'vuorot',
                   'hourly_wage' => $w, 'hours' => round($p['n'], 2), 'evening' => round($p['e'], 2), 'night' => round($p['ni'], 2),
                   'saturday' => round($p['sa'], 2), 'sunday' => round($p['su'], 2),
                   'base_pay' => round($p['n'] * $w, 2), 'total_pay' => round(wageTotal($p, $w, $pub['bonuses']), 2)];
    }
    return $rows;
}


// ===================== MIEHITYS, KATTAVUUS JA VUOROEHDOTUKSET =====================
// Pienin yhtäaikaisten tekijöiden määrä ikkunassa [ws, we) (15 min askel) ja ensimmäinen hetki, jolloin määrä on alle rajan
function minCountInWindow(array $iv, int $ws, int $we, ?string $role, int $need): array {
    $min = PHP_INT_MAX; $at = null;
    for ($t = $ws; $t < $we; $t += 900) {
        $c = 0;
        foreach ($iv as $x) if ($x[0] <= $t && $x[1] > $t && ($role === null || $role === '' || $x[2] === $role)) $c++;
        if ($c < $min) $min = $c;
        if ($at === null && $c < $need) $at = $t;
    }
    return [$min === PHP_INT_MAX ? 0 : $min, $at];
}
function coverageIntervals($conn, string $from, string $to): array {
    $st = prepareQuery($conn, "SELECT s.userId, s.date, s.start, s.end, s.role, s.status FROM shifts s WHERE s.userId IS NOT NULL AND s.date BETWEEN ? AND ?");
    $f = date('Y-m-d', strtotime("$from -1 day")); $t = date('Y-m-d', strtotime("$to +1 day"));
    $st->bind_param("ss", $f, $t);
    $abs = prepareQuery($conn, "SELECT a.user_id, a.start_date, a.end_date FROM absences a JOIN users u ON u.id = a.user_id WHERE a.status = 'approved' AND a.end_date >= ? AND a.start_date <= ?");
    $abs->bind_param("ss", $f, $t);
    $absences = fetchAllRows($abs); $iv = [];
    foreach (fetchAllRows($st) as $r) {
        foreach ($absences as $a) if ((int)$a['user_id'] === (int)$r['userId'] && $r['date'] >= $a['start_date'] && $r['date'] <= $a['end_date']) continue 2;   // poissaolevan vuoroa ei lasketa
        $s1 = strtotime($r['date'] . ' ' . $r['start']); $s2 = strtotime($r['date'] . ' ' . $r['end']); if ($s2 <= $s1) $s2 += 86400;
        $iv[] = [$s1, $s2, (string)$r['role'], (int)$r['userId'], $r['status']];
    }
    return $iv;
}
function staffingRuleWindows($rules, string $from, string $to): array {   // [{date, rule, ws, we}]
    $out = [];
    for ($d = strtotime($from); $d <= strtotime($to); $d += 86400) {
        $date = date('Y-m-d', $d); $dow = (int)date('N', $d) - 1;
        foreach ($rules as $r) {
            if ($r['dow'] !== null && (int)$r['dow'] !== $dow) continue;
            $ws = strtotime($date . ' ' . $r['start']); $we = strtotime($date . ' ' . $r['end']); if ($we <= $ws) $we += 86400;
            $out[] = ['date' => $date, 'rule' => $r, 'ws' => $ws, 'we' => $we];
        }
    }
    return $out;
}
function computeCoverage($conn, string $from, string $to): array {
    $rules = fetchAllRows(prepareQuery($conn, "SELECT id, dow, start, end, role, min_staff FROM staffing_rules ORDER BY start"));
    if (!$rules) return [];
    $iv = coverageIntervals($conn, $from, $to); $out = [];
    foreach (staffingRuleWindows($rules, $from, $to) as $w) {
        $need = (int)$w['rule']['min_staff'];
        [$min, $at] = minCountInWindow($iv, $w['ws'], $w['we'], $w['rule']['role'], $need);
        $drafts = 0; foreach ($iv as $x) if ($x[4] === 'draft' && $x[0] < $w['we'] && $x[1] > $w['ws']) $drafts++;
        $out[] = ['date' => $w['date'], 'rule_id' => (int)$w['rule']['id'], 'start' => substr($w['rule']['start'], 0, 5), 'end' => substr($w['rule']['end'], 0, 5), 'role' => $w['rule']['role'],
                  'need' => $need, 'min' => $min, 'shortage' => max(0, $need - $min), 'first_short' => $at === null ? null : date('H:i', $at), 'drafts' => $drafts];
    }
    return $out;
}
// Ehdotus vuoroiksi puutteisiin (ei tallenna): ahne valinta, joka kunnioittaa lepoaikaa, päällekkäisyyksiä, poissaoloja, saatavuutta ja viikkotuntirajaa
function suggestSchedule($conn, array $pub, string $from, string $to, bool $advanced = false): array {
    $rules = fetchAllRows(prepareQuery($conn, "SELECT id, dow, start, end, role, min_staff FROM staffing_rules ORDER BY start"));
    $users = fetchAllRows(prepareQuery($conn, "SELECT id, name, target_hours FROM users WHERE role = 'employee' AND anonymized_at IS NULL"));
    $iv = coverageIntervals($conn, $from, $to);
    $f = date('Y-m-d', strtotime("$from -8 days")); $t = date('Y-m-d', strtotime("$to +8 days"));
    $all = prepareQuery($conn, "SELECT userId, date, start, end FROM shifts WHERE userId IS NOT NULL AND date BETWEEN ? AND ?");
    $all->bind_param("ss", $f, $t); $mine = [];
    foreach (fetchAllRows($all) as $r) { $s1 = strtotime($r['date'] . ' ' . $r['start']); $s2 = strtotime($r['date'] . ' ' . $r['end']); if ($s2 <= $s1) $s2 += 86400; $mine[(int)$r['userId']][] = [$s1, $s2]; }
    $ab = prepareQuery($conn, "SELECT a.user_id, a.start_date, a.end_date FROM absences a JOIN users u ON u.id = a.user_id WHERE a.status = 'approved' AND a.end_date >= ? AND a.start_date <= ?");
    $ab->bind_param("ss", $from, $to); $absences = fetchAllRows($ab);
    $av = prepareQuery($conn, "SELECT a.user_id, a.date, a.status FROM availability a WHERE a.date BETWEEN ? AND ?");
    $av->bind_param("ss", $from, $to); $avail = [];
    foreach (fetchAllRows($av) as $r) $avail[(int)$r['user_id']][$r['date']] = $r['status'];
    $ar = fetchAllRows(prepareQuery($conn, "SELECT user_id, dow, valid_from, valid_to FROM availability_rules"));
    $minRest = (float)$pub['min_rest_hours'] * 3600; $maxWeek = $pub['max_week_hours'];
    $past28 = []; $skillReq = []; $skillHave = [];
    if ($advanced) {   // automaattinen suunnittelu: huomioi viimeisten 4 viikon kuormitus ja vuoron roolille vaaditut osaamiset
        $p28 = prepareQuery($conn, "SELECT userId, SUM(MOD(TIME_TO_SEC(end) - TIME_TO_SEC(start) + 86400, 86400)) / 3600 AS h FROM shifts WHERE userId IS NOT NULL AND status = 'published' AND date >= DATE_SUB(?, INTERVAL 28 DAY) AND date < ? GROUP BY userId");
        $p28->bind_param("ss", $from, $from); foreach (fetchAllRows($p28) as $r) $past28[(int)$r['userId']] = (float)$r['h'];
        foreach (fetchAllRows(prepareQuery($conn, "SELECT id, for_role FROM skills WHERE for_role IS NOT NULL")) as $r) $skillReq[$r['for_role']][] = (int)$r['id'];
        foreach (fetchAllRows(prepareQuery($conn, "SELECT us.user_id, us.skill_id, us.valid_until FROM user_skills us JOIN skills s ON s.id = us.skill_id")) as $r) $skillHave[(int)$r['user_id']][(int)$r['skill_id']] = $r['valid_until'];
    }
    $weekHours = function (int $uid, int $ts) use (&$mine) { $ws = strtotime('monday this week', $ts); $we = $ws + 7 * 86400; $h = 0; foreach ($mine[$uid] ?? [] as $x) if ($x[0] >= $ws && $x[0] < $we) $h += ($x[1] - $x[0]) / 3600; return $h; };
    $prop = []; $unfilled = [];
    $defaultRole = $pub['roles'][0] ?? '';
    foreach (staffingRuleWindows($rules, $from, $to) as $w) {
        $need = (int)$w['rule']['min_staff']; $guard = 0;
        while ($guard++ < 20) {
            [$min] = minCountInWindow($iv, $w['ws'], $w['we'], $w['rule']['role'], $need);
            if ($min >= $need) break;
            $best = null; $bestScore = PHP_INT_MAX; $dur = ($w['we'] - $w['ws']) / 3600;
            foreach ($users as $u) {
                $uid = (int)$u['id'];
                foreach ($mine[$uid] ?? [] as $x) {   // päällekkäisyys tai liian lyhyt lepo
                    if ($x[0] < $w['we'] + $minRest && $x[1] > $w['ws'] - $minRest) continue 2;
                }
                foreach ($absences as $a) if ((int)$a['user_id'] === $uid && $w['date'] >= $a['start_date'] && $w['date'] <= $a['end_date']) continue 2;
                if (($avail[$uid][$w['date']] ?? '') === 'unavailable') continue;
                $dow = (int)date('N', $w['ws']) - 1;
                foreach ($ar as $r) if ((int)$r['user_id'] === $uid && (int)$r['dow'] === $dow && (!$r['valid_from'] || $r['valid_from'] <= $w['date']) && (!$r['valid_to'] || $r['valid_to'] >= $w['date'])) continue 2;
                $wh = $weekHours($uid, $w['ws']);
                if ($maxWeek !== null && $wh + $dur > $maxWeek) continue;
                $reqRole = $w['rule']['role'] ?: $defaultRole;
                if ($advanced && !empty($skillReq[$reqRole])) {   // vaaditut osaamiset voimassa vuoron päivänä
                    foreach ($skillReq[$reqRole] as $skId) { $vu = $skillHave[$uid][$skId] ?? false; if ($vu === false || ($vu !== null && $vu < $w['date'])) continue 2; }
                }
                $targetWeek = ((int)$u['target_hours']) / 4.33;
                $score = $wh - $targetWeek + (($avail[$uid][$w['date']] ?? '') === 'available' ? -1000 : 0);
                if ($advanced) $score += 0.5 * (($past28[$uid] ?? 0) / 4 - $targetWeek);   // tasaa kuormitusta: viime viikkoina paljon tehnyt saa vähemmän
                if ($score < $bestScore) { $bestScore = $score; $best = $u; }
            }
            if (!$best) { $unfilled[] = ['date' => $w['date'], 'start' => substr($w['rule']['start'], 0, 5), 'end' => substr($w['rule']['end'], 0, 5), 'role' => $w['rule']['role'], 'missing' => $need - $min]; break; }
            $role = $w['rule']['role'] ?: $defaultRole; $uid = (int)$best['id'];
            $prop[] = ['userId' => $uid, 'name' => $best['name'], 'date' => $w['date'], 'start' => substr($w['rule']['start'], 0, 5), 'end' => substr($w['rule']['end'], 0, 5), 'role' => $role,
                       'reason' => ($avail[$uid][$w['date']] ?? '') === 'available' ? 'merkinnyt itsensä vapaaksi' : 'vähiten tunteja viikolla'];
            $iv[] = [$w['ws'], $w['we'], (string)$role, $uid, 'draft']; $mine[$uid][] = [$w['ws'], $w['we']];
        }
    }
    return ['proposals' => $prop, 'unfilled' => $unfilled];
}


// Työaikapankki: kuukausittaiset tunnit vs. tavoite, ylityö viikkorajan yli ja kertynyt saldo (päättyneet kuukaudet)
function computeHourBank($conn, array $pub, array $users, int $months = 12): array {
    $from = date('Y-m-01', strtotime('-' . ($months - 1) . ' months')); $cur = date('Y-m');
    $st = prepareQuery($conn, "SELECT user_id, clock_in, clock_out FROM time_entries WHERE clock_out IS NOT NULL AND clock_in >= ?");
    $st->bind_param("s", $from); $mh = []; $wh = [];
    foreach (fetchAllRows($st) as $e) {
        $h = (strtotime($e['clock_out']) - strtotime($e['clock_in'])) / 3600; if ($h <= 0 || $h > 24) continue;
        $u = (int)$e['user_id']; $day = substr($e['clock_in'], 0, 10);
        $mh[$u][substr($day, 0, 7)] = ($mh[$u][substr($day, 0, 7)] ?? 0) + $h;
        $mon = date('Y-m-d', strtotime('monday this week', strtotime($day)));
        $wh[$u][$mon] = ($wh[$u][$mon] ?? 0) + $h;
    }
    $list = [];
    for ($d = strtotime($from); date('Y-m', $d) <= $cur; $d = strtotime('+1 month', $d)) $list[] = date('Y-m', $d);
    $out = [];
    foreach ($users as $u) {
        $uid = (int)$u['id']; $target = (float)$u['target_hours']; $rows = []; $saldo = 0.0; $otTotal = 0.0;
        foreach ($list as $m) {
            $ot = 0.0; foreach ($wh[$uid] ?? [] as $mon => $h) if (substr($mon, 0, 7) === $m && $h > $pub['overtime_week_hours']) $ot += $h - $pub['overtime_week_hours'];
            $actual = $mh[$uid][$m] ?? 0.0; $diff = $target > 0 ? $actual - $target : 0.0;
            if ($m < $cur) { $saldo += $diff; }
            $otTotal += $ot;
            $rows[] = ['month' => $m, 'actual' => round($actual, 2), 'target' => $target, 'diff' => round($diff, 2), 'overtime' => round($ot, 2)];
        }
        $out[] = ['id' => $uid, 'name' => $u['name'], 'target' => $target, 'saldo' => round($saldo, 2), 'overtime_total' => round($otTotal, 2), 'months' => $rows];
    }
    return $out;
}
// Viikon kustannusennuste suunnitelluista vuoroista (luonnokset mukana), budjetti ja myynti
function computeForecast($conn, array $pub, string $weekStart): array {
    $mon = date('Y-m-d', strtotime('monday this week', strtotime($weekStart))); $sun = date('Y-m-d', strtotime("$mon +6 days"));
    $users = []; foreach (fetchAllRows(prepareQuery($conn, "SELECT id, hourly_wage FROM users")) as $u) $users[(int)$u['id']] = (float)$u['hourly_wage'];
    $st = prepareQuery($conn, "SELECT userId, date, start, end, status FROM shifts WHERE date BETWEEN ? AND ?");
    $st->bind_param("ss", $mon, $sun);
    $days = []; for ($i = 0; $i < 7; $i++) { $d = date('Y-m-d', strtotime("$mon +$i days")); $days[$d] = ['date' => $d, 'hours' => 0.0, 'cost' => 0.0, 'sales' => null]; }
    $hours = 0.0; $cost = 0.0; $open = 0.0; $drafts = 0;
    foreach (fetchAllRows($st) as $r) {
        $d1 = new DateTime($r['date'] . ' ' . $r['start']); $d2 = new DateTime($r['date'] . ' ' . $r['end']); if ($d2 <= $d1) $d2->modify('+1 day');
        $p = wageParts($d1, $d2, $pub['evening_start'], $pub['night_end']);
        if ($r['userId'] === null) { $open += $p['n']; continue; }
        $c = wageTotal($p, $users[(int)$r['userId']] ?? 0.0, $pub['bonuses']);
        $hours += $p['n']; $cost += $c; if ($r['status'] === 'draft') $drafts++;
        $days[$r['date']]['hours'] += $p['n']; $days[$r['date']]['cost'] += $c;
    }
    $sales = 0.0;
    $ss = prepareQuery($conn, "SELECT date, amount FROM daily_sales WHERE date BETWEEN ? AND ?");
    $ss->bind_param("ss", $mon, $sun);
    foreach (fetchAllRows($ss) as $r) { $days[$r['date']]['sales'] = (float)$r['amount']; $sales += (float)$r['amount']; }
    $emp = $cost * (1 + $pub['side_cost_pct'] / 100);
    foreach ($days as &$d) { $d['hours'] = round($d['hours'], 2); $d['cost'] = round($d['cost'], 2); } unset($d);
    return ['weekStart' => $mon, 'hours' => round($hours, 2), 'cost' => round($cost, 2), 'employer_cost' => round($emp, 2), 'open_hours' => round($open, 2), 'drafts' => $drafts,
            'budget' => $pub['weekly_budget'], 'over_budget' => $pub['weekly_budget'] !== null && $emp > $pub['weekly_budget'], 'sales' => round($sales, 2),
            'labour_pct' => $sales > 0 ? round($emp / $sales * 100, 1) : null, 'days' => array_values($days)];
}


// Tallentaa lomakkeen tiedoston ($_FILES[$key]) kuvana; palauttaa suhteellisen polun tai null. Polku muodostetaan palvelimella.
// Tiedostot tallennetaan arvaamattomaan alihakemistoon (polku tallentuu riville, joten aiemmat tiedostot löytyvät vanhoistakin hakemistoista)
function uploadsSubdir(): string { return substr(hash('sha256', 'barshift-uploads'), 0, 16); }
function storeImageUpload(string $key): ?string {
    if (!isset($_FILES[$key]) || $_FILES[$key]['error'] === UPLOAD_ERR_NO_FILE) return null;
    $f = $_FILES[$key];
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Tiedoston lataus epäonnistui');
    if ($f['size'] > 5 * 1024 * 1024) fail('Kuva on liian suuri (max 5 MB)');
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!isset($allowed[$mime]) || @getimagesize($f['tmp_name']) === false) fail('Sallitut kuvamuodot: JPG, PNG, WEBP, GIF');
    $pubDir = uploadsSubdir();
    $rel = "uploads/{$pubDir}/" . date('Y-m') . '/';
    $dir = __DIR__ . '/' . $rel;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) fail('Tallennus epäonnistui', 500);
    $name = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($f['tmp_name'], $dir . $name)) fail('Tallennus epäonnistui', 500);
    chmod($dir . $name, 0644);
    return $rel . $name;
}
// Dokumentit (PDF tai kuva) tallennetaan hakemistoon uploads/docs/, jonne suora pääsy on estetty; lataus vain kirjautuneille API:n kautta
function storeDocumentUpload(string $key, bool $imagesOnly = false): array {
    if (!isset($_FILES[$key]) || $_FILES[$key]['error'] !== UPLOAD_ERR_OK) fail('Valitse tiedosto');
    $f = $_FILES[$key];
    if ($f['size'] > 10 * 1024 * 1024) fail('Tiedosto on liian suuri (max 10 MB)');
    $allowed = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if ($imagesOnly) unset($allowed['application/pdf']);
    if (!isset($allowed[$mime])) fail($imagesOnly ? 'Sallitut kuvat: JPG, PNG, WEBP' : 'Sallitut tiedostot: PDF, JPG, PNG, WEBP');
    if ($mime !== 'application/pdf' && @getimagesize($f['tmp_name']) === false) fail('Virheellinen kuva');
    $base = __DIR__ . '/uploads/docs';
    if (!is_dir($base) && !mkdir($base, 0755, true)) fail('Tallennus epäonnistui', 500);
    if (!is_file($base . '/.htaccess')) @file_put_contents($base . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\n  Order deny,allow\n  Deny from all\n</IfModule>\n");
    $sub = uploadsSubdir();
    if (!is_dir("$base/$sub") && !mkdir("$base/$sub", 0755, true)) fail('Tallennus epäonnistui', 500);
    $name = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($f['tmp_name'], "$base/$sub/$name")) fail('Tallennus epäonnistui', 500);
    chmod("$base/$sub/$name", 0640);
    return ["$sub/$name", $mime, (int)$f['size']];
}


function bsHubRecord($conn, bool $ok, string $err): void {
    $now = date('c');
    foreach ([['hub_last_sync', $now], ['hub_last_error', $ok ? '' : $err]] as [$k, $v]) { $st = $conn->prepare("INSERT INTO system_status (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)"); if ($st) { $st->bind_param('ss', $k, $v); $st->execute(); } }
}
// Hyväksytylle keikkahakemukselle luodaan keikkalaistunnus (työsuhdetyyppi casual) ja hakija asetetaan vuoroon.
// Jos hakijan sähköposti vastaa jo olemassa olevaa tunnusta, käytetään sitä. Palauttaa tiedot ylläpitäjälle tai null.
function hubCreateGigWorker($conn, $cfg, int $appId, int $shiftId): ?array {
    $app = fetchOne(prepareQuery($conn, "SELECT name, email, phone FROM hub_applications WHERE id = " . $appId));
    if (!$app) return null;
    $name = mb_substr(trim((string)$app['name']), 0, 100); $email = trim((string)($app['email'] ?? '')); $email = ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) ? $email : null;
    $phone = mb_substr((string)($app['phone'] ?? ''), 0, 20);
    $existing = null;
    if ($email !== null) { $q = prepareQuery($conn, "SELECT id, name, username FROM users WHERE LOWER(email) = LOWER(?) AND anonymized_at IS NULL AND status <> 'frozen' LIMIT 1"); $q->bind_param("s", $email); $existing = fetchOne($q); }
    $link = null; $emailed = false;
    if ($existing) { $uid = (int)$existing['id']; $username = $existing['username']; $name = $existing['name']; }
    else {
        $base = strtolower(strtr($name, ['ä' => 'a', 'ö' => 'o', 'å' => 'a', 'Ä' => 'a', 'Ö' => 'o', 'Å' => 'a', 'é' => 'e', 'ü' => 'u']));
        $base = trim(preg_replace('/[^a-z0-9]+/', '.', $base), '.'); $base = $base === '' ? 'keikkalainen' : substr($base, 0, 40);
        $username = $base;
        for ($i = 2; fetchOne(prepareQuery($conn, "SELECT id FROM users WHERE username = '" . $conn->real_escape_string($username) . "'")); $i++) $username = $base . $i;
        $pw = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);   // hakija asettaa salasanan itse kutsulinkistä
        $color = sprintf('#%02X%02X%02X', random_int(60, 200), random_int(60, 200), random_int(60, 200));
        $ins = prepareQuery($conn, "INSERT INTO users (name, username, password, role, color, hourly_wage, employment_type, email, phone) VALUES (?, ?, ?, 'employee', ?, 0, 'casual', ?, ?)");
        $ins->bind_param("ssssss", $name, $username, $pw, $color, $email, $phone); run($ins);
        $uid = (int)$conn->insert_id;
        [$link, $emailed] = issueAuthLink($conn, $cfg, ['id' => $uid, 'name' => $name, 'username' => $username, 'email' => $email], 'invite');
    }
    $as = prepareQuery($conn, "UPDATE shifts SET userId = ? WHERE id = ? AND userId IS NULL"); $as->bind_param("ii", $uid, $shiftId); run($as);
    return ['id' => $uid, 'name' => $name, 'username' => $username, 'existing' => (bool)$existing, 'link' => $link, 'emailed' => $emailed, 'email' => $email, 'phone' => $phone !== '' ? $phone : null, 'assigned' => $as->affected_rows > 0];
}
// Muutoksen jälkeen synkronoidaan keskukseen heti vastauksen jälkeen (ei hidasta käyttäjää; cron on varmistus)
function hubSyncAfterResponse($conn, array $cfg, array $vapid, bool $pull = false, int $throttleSecs = 0): void {
    if (!hubConfigured($cfg)) return;
    if ($throttleSecs > 0) {   // ylläpitäjän sivulatauksista: enintään kerran $throttleSecs sekunnissa (ei tarvitse croniakaan)
        $la = fetchOne(prepareQuery($conn, "SELECT v FROM system_status WHERE k = 'hub_last_attempt'"));
        if ($la && time() - (int)$la['v'] < $throttleSecs) return;
        $now = (string)time(); $st = $conn->prepare("INSERT INTO system_status (k, v) VALUES ('hub_last_attempt', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)"); if ($st) { $st->bind_param('s', $now); $st->execute(); }
    }
    register_shutdown_function(function () use ($conn, $cfg, $vapid, $pull) {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        try {
            $prow = fetchOne(prepareQuery($conn, "SELECT feature_hub_events, feature_hub_gigs, feature_hub_feed FROM pubs ORDER BY id LIMIT 1"));
            if (!$prow || (!$prow['feature_hub_events'] && !$prow['feature_hub_gigs'] && !$prow['feature_hub_feed'])) return;
            [$sent, $errs] = hubSync($conn, $cfg, $prow);
            if ($pull) { hubPullApplications($conn, $cfg, $prow, $vapid); hubFeedPull($conn, $cfg, $prow, $vapid); hubOutgoingPull($conn, $cfg, $prow, $vapid); } bsHubRecord($conn, $errs === 0, $errs ? hubLastError() : '');
        } catch (Throwable $e) { error_log('hub sync: ' . $e->getMessage()); }
    });
}
function maskName(string $n): string { $p = preg_split('/\s+/', trim($n)); return count($p) > 1 ? $p[0] . ' ' . mb_substr(end($p), 0, 1) . '.' : $p[0]; }


// Analytiikka ylläpidolle: tunnit kuukausittain, sairauspoissaolot, täsmällisyys (leimaus vs. vuoro) ja kuormituskartta (viikonpäivä × tunti)
function computeAnalytics($conn, array $pub, int $months): array {
    $from = date('Y-m-01', strtotime('-' . ($months - 1) . ' months')); $today = date('Y-m-d'); $cur = date('Y-m');
    $list = []; for ($d = strtotime($from); date('Y-m', $d) <= $cur; $d = strtotime('+1 month', $d)) $list[] = date('Y-m', $d);
    $users = []; foreach (fetchAllRows(prepareQuery($conn, "SELECT id, name FROM users WHERE anonymized_at IS NULL")) as $u) $users[(int)$u['id']] = $u['name'];
    // --- leimaukset: tunnit/kk ja kuormituskartta ---
    $te = prepareQuery($conn, "SELECT user_id, clock_in, clock_out FROM time_entries WHERE clock_out IS NOT NULL AND clock_in >= ? ORDER BY clock_in LIMIT 30000");
    $te->bind_param("s", $from); $entries = fetchAllRows($te);
    $hoursByMonth = array_fill_keys($list, 0.0); $heat = array_fill(0, 7, array_fill(0, 24, 0.0)); $byUser = [];
    foreach ($entries as $e) {
        $a = strtotime($e['clock_in']); $b = strtotime($e['clock_out']); if ($b <= $a || $b - $a > 86400) continue;
        $hoursByMonth[date('Y-m', $a)] = ($hoursByMonth[date('Y-m', $a)] ?? 0) + ($b - $a) / 3600;
        for ($t = $a; $t < $b; $t = min($b, (intdiv($t, 900) + 1) * 900)) {   // 15 min palat
            $n = min($b, (intdiv($t, 900) + 1) * 900); $heat[(int)date('N', $t) - 1][(int)date('G', $t)] += ($n - $t) / 3600;
        }
        $byUser[(int)$e['user_id']][] = [$a, $b];
    }
    // --- täsmällisyys ---
    $sh = prepareQuery($conn, "SELECT userId, date, start, end FROM shifts WHERE status = 'published' AND userId IS NOT NULL AND date >= ? AND date <= ?");
    $sh->bind_param("ss", $from, $today); $punct = [];
    foreach (fetchAllRows($sh) as $r) {
        $uid = (int)$r['userId']; if (!isset($users[$uid]) || empty($byUser[$uid])) continue;   // vain ne, jotka käyttävät leimausta
        $s1 = strtotime($r['date'] . ' ' . $r['start']); $s2 = strtotime($r['date'] . ' ' . $r['end']); if ($s2 <= $s1) $s2 += 86400;
        if ($s2 > time()) continue;
        $hit = null; foreach ($byUser[$uid] as $x) if ($x[0] >= $s1 - 3 * 3600 && $x[0] <= $s2) { $hit = $x; break; }
        $P =& $punct[$uid]; if (!$P) $P = ['id' => $uid, 'name' => $users[$uid], 'shifts' => 0, 'late' => 0, 'late_min' => 0, 'missing' => 0]; $P['shifts']++;
        if (!$hit) $P['missing']++; elseif ($hit[0] > $s1 + 5 * 60) { $P['late']++; $P['late_min'] += (int)round(($hit[0] - $s1) / 60); }
        unset($P);
    }
    foreach ($punct as &$P) { $P['avg_late'] = $P['late'] ? (int)round($P['late_min'] / $P['late']) : 0; unset($P['late_min']); } unset($P);
    // --- sairauspoissaolot ---
    $ab = prepareQuery($conn, "SELECT a.user_id, a.start_date, a.end_date FROM absences a JOIN users u ON u.id = a.user_id WHERE a.type = 'sick' AND a.status = 'approved' AND a.end_date >= ? AND a.start_date <= ?");
    $ab->bind_param("ss", $from, $today); $sickMonth = array_fill_keys($list, 0); $sickUser = [];
    foreach (fetchAllRows($ab) as $r) {
        $uid = (int)$r['user_id']; $days = 0;
        for ($d = max(strtotime($r['start_date']), strtotime($from)); $d <= min(strtotime($r['end_date']), strtotime($today)); $d += 86400) { $sickMonth[date('Y-m', $d)]++; $days++; }
        if (isset($users[$uid]) && $days) { $sickUser[$uid] = ($sickUser[$uid] ?? ['id' => $uid, 'name' => $users[$uid], 'days' => 0, 'episodes' => 0]); $sickUser[$uid]['days'] += $days; $sickUser[$uid]['episodes']++; }
    }
    usort($sickUser, fn($a, $b) => $b['days'] <=> $a['days']);
    $punct = array_values($punct); usort($punct, fn($a, $b) => ($b['late'] + $b['missing']) <=> ($a['late'] + $a['missing']));
    return ['months' => $list, 'hours' => array_map(fn($m) => round($hoursByMonth[$m], 1), $list), 'sick_days' => array_map(fn($m) => $sickMonth[$m], $list),
            'sick_by_user' => array_values($sickUser), 'punctuality' => $punct, 'heatmap' => array_map(fn($row) => array_map(fn($v) => round($v, 1), $row), $heat)];
}

function prepareQuery2($conn, string $sql, string $arg) { $st = prepareQuery($conn, $sql); $st->bind_param("s", $arg); return $st; }

// Vuoron ristiriidat (varoituksia, ei estä tallennusta): päällekkäisyys, lepoaika, viikkotunnit, poissaolo, saatavuus
function shiftWarnings($conn, array $pub, int $userId, string $date, string $start, string $end, int $excludeId = 0, ?string $role = null): array {
    $w = [];
    $d1 = new DateTime("$date $start"); $d2 = new DateTime("$date $end");
    if ($d2 <= $d1) $d2->modify('+1 day');
    $from = (clone $d1)->modify('-8 days')->format('Y-m-d'); $to = (clone $d1)->modify('+8 days')->format('Y-m-d');
    $st = prepareQuery($conn, "SELECT id, date, start, end FROM shifts WHERE userId = ? AND id != ? AND date BETWEEN ? AND ?");
    $st->bind_param("iiss", $userId, $excludeId, $from, $to);
    $weekStart = (clone $d1)->modify('monday this week')->setTime(0, 0); $weekEnd = (clone $weekStart)->modify('+7 days');
    $weekHours = ($d2->getTimestamp() - $d1->getTimestamp()) / 3600;
    foreach (fetchAllRows($st) as $o) {
        $o1 = new DateTime($o['date'] . ' ' . $o['start']); $o2 = new DateTime($o['date'] . ' ' . $o['end']);
        if ($o2 <= $o1) $o2->modify('+1 day');
        $label = $o1->format('j.n.') . ' ' . substr($o['start'], 0, 5) . '–' . substr($o['end'], 0, 5);
        if ($o1 < $d2 && $o2 > $d1) $w[] = ['type' => 'overlap', 'msg' => "Päällekkäinen vuoro ($label)"];
        else {
            $gap = $o1 >= $d2 ? ($o1->getTimestamp() - $d2->getTimestamp()) / 3600 : ($d1->getTimestamp() - $o2->getTimestamp()) / 3600;
            if ($gap < $pub['min_rest_hours']) $w[] = ['type' => 'rest', 'msg' => 'Lepoaika vain ' . rtrim(rtrim(number_format($gap, 1, ',', ''), '0'), ',') . " h vuoroon $label (vähintään " . rtrim(rtrim(number_format($pub['min_rest_hours'], 1, ',', ''), '0'), ',') . ' h)'];
        }
        if ($o1 >= $weekStart && $o1 < $weekEnd) $weekHours += ($o2->getTimestamp() - $o1->getTimestamp()) / 3600;
    }
    if ($pub['max_week_hours'] !== null && $weekHours > $pub['max_week_hours'] + 0.001)
        $w[] = ['type' => 'week', 'msg' => 'Viikon tunnit ' . rtrim(rtrim(number_format($weekHours, 1, ',', ''), '0'), ',') . ' h ylittää rajan ' . rtrim(rtrim(number_format($pub['max_week_hours'], 1, ',', ''), '0'), ',') . ' h'];
    $ab = prepareQuery($conn, "SELECT type FROM absences WHERE user_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date LIMIT 1");
    $ab->bind_param("is", $userId, $date);
    if ($r = fetchOne($ab)) $w[] = ['type' => 'absence', 'msg' => 'Työntekijällä on hyväksytty poissaolo tänä päivänä'];
    $av = prepareQuery($conn, "SELECT status FROM availability WHERE user_id = ? AND date = ?");
    $av->bind_param("is", $userId, $date);
    if (($r = fetchOne($av)) && $r['status'] === 'unavailable') $w[] = ['type' => 'availability', 'msg' => 'Työntekijä on merkinnyt itsensä estyneeksi tälle päivälle'];
    $dow = (int)(new DateTime($date))->format('N') - 1;
    $ar = prepareQuery($conn, "SELECT note FROM availability_rules WHERE user_id = ? AND dow = ? AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?) LIMIT 1");
    $ar->bind_param("iiss", $userId, $dow, $date, $date);
    if ($r = fetchOne($ar)) $w[] = ['type' => 'availability_rule', 'msg' => 'Toistuva estepäivä' . ($r['note'] ? ' (' . $r['note'] . ')' : '')];
    if ($role !== null && $role !== '') {   // osaamiset: vuoron rooliin vaaditut osaamiset (Hallinta → Osaaminen)
        $sk = prepareQuery($conn, "SELECT s.name, us.valid_until, us.user_id FROM skills s LEFT JOIN user_skills us ON us.skill_id = s.id AND us.user_id = ? WHERE s.for_role = ?");
        $sk->bind_param("is", $userId, $role);
        foreach (fetchAllRows($sk) as $r) {
            if ($r['user_id'] === null) $w[] = ['type' => 'skill', 'msg' => 'Puuttuu osaaminen: ' . $r['name']];
            elseif ($r['valid_until'] !== null && $r['valid_until'] < $date) $w[] = ['type' => 'skill', 'msg' => $r['name'] . ' on vanhentunut (' . date('j.n.Y', strtotime($r['valid_until'])) . ')'];
        }
        $jvq = prepareQuery($conn, "SELECT expiry_jv FROM users WHERE id = ?"); $jvq->bind_param("i", $userId); $jv = fetchOne($jvq);
        if ($role === 'Järjestyksenvalvoja' && $jv && $jv['expiry_jv'] !== null && $jv['expiry_jv'] < $date) $w[] = ['type' => 'skill', 'msg' => 'JV-kortti on vanhentunut (' . date('j.n.Y', strtotime($jv['expiry_jv'])) . ')'];
    }
    return $w;
}


// ===================== AUDITLOKI & TIETOSUOJA =====================
function audit($conn, array $me, string $action, ?string $target = null, ?string $detail = null): void {
    $st = $conn->prepare("INSERT INTO audit_log (user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?)");
    if (!$st) return;   // auditloki ei saa kaataa varsinaista toimintoa (esim. päivittämätön kanta)
    $uid = (int)$me['id']; $nm = mb_substr((string)$me['name'], 0, 100);
    $tg = $target === null ? null : mb_substr($target, 0, 120); $dt = $detail === null ? null : mb_substr($detail, 0, 300);
    $st->bind_param("issss", $uid, $nm, $action, $tg, $dt);
    $st->execute();
}
// Kirjaa vasta kun pyyntö on päättynyt onnistuneesti (tila < 400)
function auditOnSuccess($conn, array $me, string $action, ?string $target = null, ?string $detail = null): void {
    register_shutdown_function(function () use ($conn, $me, $action, $target, $detail) {
        if (http_response_code() < 400) audit($conn, $me, $action, $target, $detail);
    });
}
function rowsWhere($conn, string $sql, int $uid, int $n = 1): array {
    $st = prepareQuery($conn, $sql);
    $st->bind_param(str_repeat("i", $n), ...array_fill(0, $n, $uid));
    return fetchAllRows($st);
}
// Työntekijän kaikki tallennetut tiedot (GDPR-tietojen siirrettävyys ja tarkastusoikeus)
function collectUserData($conn, $cfg, int $uid): array {
    $msgs = rowsWhere($conn, "SELECT sender_id, receiver_id, message, is_read, created_at FROM private_messages WHERE sender_id = ? OR receiver_id = ? ORDER BY created_at", $uid, 2);
    foreach ($msgs as &$m) $m['message'] = decryptMessage($cfg, (string)$m['message']);
    unset($m);
    return [
        'exported_at' => date('c'),
        'profile' => rowsWhere($conn, "SELECT id, name, username, role, color, phone, employee_number, hourly_wage, target_hours, has_hygiene, has_alcohol, expiry_jv, start_date, employment_type FROM users WHERE id = ?", $uid),
        'shifts' => rowsWhere($conn, "SELECT date, start, end, role, status FROM shifts WHERE userId = ? ORDER BY date", $uid),
        'time_entries' => rowsWhere($conn, "SELECT clock_in, clock_out FROM time_entries WHERE user_id = ? ORDER BY clock_in", $uid),
        'absences' => rowsWhere($conn, "SELECT type, start_date, end_date, description, status, created_at FROM absences WHERE user_id = ? ORDER BY start_date", $uid),
        'availability' => rowsWhere($conn, "SELECT date, status FROM availability WHERE user_id = ? ORDER BY date", $uid),
        'shift_trades' => rowsWhere($conn, "SELECT offered_shift_id, offered_by_id, requested_by_id, status, created_at FROM shift_trades WHERE offered_by_id = ? OR requested_by_id = ?", $uid, 2),
        'shift_log_entries' => rowsWhere($conn, "SELECT message, created_at FROM shift_logs WHERE user_id = ? ORDER BY created_at", $uid),
        'shopping_list_entries' => rowsWhere($conn, "SELECT item_name, status, created_at FROM shopping_list WHERE added_by = ?", $uid),
        'private_messages' => $msgs,
        'kudos_given' => rowsWhere($conn, "SELECT to_user, message, created_at FROM kudos WHERE from_user = ?", $uid),
        'kudos_received' => rowsWhere($conn, "SELECT from_user, message, created_at FROM kudos WHERE to_user = ?", $uid),
        'checklist_progress' => rowsWhere($conn, "SELECT checklist_id, done, assigned_at, completed_at FROM checklist_progress WHERE user_id = ?", $uid),
        'document_acks' => rowsWhere($conn, "SELECT document_id, acked_at FROM document_acks WHERE user_id = ?", $uid),
        'availability_rules' => rowsWhere($conn, "SELECT dow, valid_from, valid_to, note FROM availability_rules WHERE user_id = ?", $uid),
        'push_subscriptions' => count(rowsWhere($conn, "SELECT id FROM push_subscriptions WHERE user_id = ?", $uid)),
    ];
}
function sendJsonDownload(array $payload, string $filename): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}


// ===================== KUTSUT, SALASANAN PALAUTUS JA KAKSIVAIHEINEN TUNNISTAUTUMINEN =====================
// Kertakäyttöinen linkkitunniste: selväkielinen tunniste vain linkissä, kantaan tallennetaan sen sha256.
function createAuthToken($conn, int $userId, string $kind, int $ttlSeconds): string {
    $tok = bin2hex(random_bytes(32));
    $h = hash('sha256', $tok);
    $st = prepareQuery($conn, "UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL");   // vanhat linkit mitätöidään
    $st->bind_param("i", $userId); run($st);
    $st = prepareQuery($conn, "INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))");
    $st->bind_param("issi", $userId, $kind, $h, $ttlSeconds); run($st);
    return $tok;
}
function findAuthToken($conn, string $tok): ?array {
    if (!preg_match('/^[0-9a-f]{64}$/', $tok)) return null;
    $h = hash('sha256', $tok);
    $st = prepareQuery($conn, "SELECT t.id, t.user_id, t.kind, u.name, u.username FROM auth_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW() AND u.anonymized_at IS NULL AND u.status != 'frozen'");
    $st->bind_param("s", $h);
    return fetchOne($st);
}

function authLink($cfg, string $tok): string { $b = bsBaseUrl($cfg); return ($b !== '' ? $b : '') . '/setpassword.html#t=' . $tok; }
// Lähettää kutsun/palautuslinkin jonoon. Palauttaa [linkki, lähetettiinkö sähköpostilla].
function issueAuthLink($conn, $cfg, array $u, string $kind): array {
    $ttl = $kind === 'reset' ? 3600 : 7 * 86400;
    $link = authLink($cfg, createAuthToken($conn, (int)$u['id'], $kind, $ttl));
    $emailed = false;
    if (!empty($u['email']) && bsMailConfigured($cfg)) {
        $subject = $kind === 'reset' ? '[BarShift] Salasanan vaihto' : '[BarShift] Sinut on kutsuttu BarShiftiin';
        $intro = $kind === 'reset' ? "Pyysit salasanan vaihtoa. Aseta uusi salasana alla olevasta linkistä (voimassa 1 tunnin). Jos et pyytänyt tätä, voit jättää viestin huomiotta."
               : "Sinulle on luotu BarShift-tunnus. Aseta salasanasi alla olevasta linkistä (voimassa 7 päivää).";
        bsEnqueueMail($conn, $u['email'], $subject, "Hei {$u['name']},\n\n$intro\n\n$link\n\nKirjautumistunnuksesi: {$u['username']}\n");
        $emailed = true;
    }
    return [$link, $emailed];
}
function rateLimited($conn, string $bucket, int $max): bool {   // login_attempts-taulun uudelleenkäyttö: bucket = "reset:IP" jne.
    $st = prepareQuery($conn, "SELECT COUNT(*) c FROM login_attempts WHERE attempted_at > NOW() - INTERVAL 15 MINUTE AND username = ?");
    $st->bind_param("s", $bucket);
    $r = fetchOne($st);
    return $r && (int)$r['c'] >= $max;
}
function rateHit($conn, string $bucket): void {
    $ip = '-';   // ei IP:tä: rajoitus koskee vain kyseistä ämpäriä, ei estä kirjautumista kokonaan samasta osoitteesta
    $st = prepareQuery($conn, "INSERT INTO login_attempts (ip, username) VALUES (?, ?)");
    $st->bind_param("ss", $ip, $bucket); $st->execute();
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(string $bin): string {
    $bits = ''; foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = ''; foreach (str_split($bits, 5) as $chunk) $out .= B32[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
function b32decode(string $s): string {
    $bits = ''; foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s))) as $c) { $p = strpos(B32, $c); if ($p !== false) $bits .= str_pad(decbin($p), 5, '0', STR_PAD_LEFT); }
    $out = ''; foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}
function totpCode(string $secretBin, int $step): string {   // RFC 6238 / RFC 4226, SHA-1, 6 numeroa
    $h = hash_hmac('sha1', pack('J', $step), $secretBin, true);
    $o = ord($h[19]) & 0xf;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}
// Palauttaa hyväksytyn aika-askeleen tai null. $lastStep estää saman koodin uudelleenkäytön.
function totpVerify(string $secretB32, string $code, int $lastStep = 0, ?int $now = null): ?int {
    $code = preg_replace('/\s+/', '', $code);
    if (!preg_match('/^\d{6}$/', $code)) return null;
    $bin = b32decode($secretB32); $cur = intdiv($now ?? time(), 30);
    foreach ([0, -1, 1] as $d) { $st = $cur + $d; if ($st > $lastStep && hash_equals(totpCode($bin, $st), $code)) return $st; }
    return null;
}
// Tarkistaa TOTP-koodin tai palautuskoodin käyttäjälle; kuluttaa käytetyn. Palauttaa true/false.
function verifySecondFactor($conn, $cfg, int $uid, string $code): bool {
    $st = prepareQuery($conn, "SELECT totp_secret, totp_last_step, recovery_codes FROM users WHERE id = ? AND totp_enabled = 1");
    $st->bind_param("i", $uid);
    $u = fetchOne($st);
    if (!$u || !$u['totp_secret']) return false;
    $secret = decryptMessage($cfg, (string)$u['totp_secret']);
    if (preg_match('/^\s*\d{3}\s?\d{3}\s*$/', $code)) {
        $step = totpVerify($secret, $code, (int)$u['totp_last_step']);
        if ($step === null) return false;
        $up = prepareQuery($conn, "UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?");
        $up->bind_param("iii", $step, $uid, $step); run($up);
        return $up->affected_rows > 0;
    }
    // palautuskoodi (kertakäyttöinen), muoto abcde-fghij
    $norm = strtolower(preg_replace('/[^A-Za-z0-9]/', '', $code));
    $hashes = json_decode((string)$u['recovery_codes'], true) ?: [];
    $h = hash('sha256', $norm);
    $i = array_search($h, $hashes, true);
    if (strlen($norm) !== 10 || $i === false) return false;
    unset($hashes[$i]);
    $json = json_encode(array_values($hashes));
    $up = prepareQuery($conn, "UPDATE users SET recovery_codes = ? WHERE id = ? AND recovery_codes = ?");
    $up->bind_param("sis", $json, $uid, $u['recovery_codes']); run($up);
    return $up->affected_rows > 0;
}

$action = $_GET['action'] ?? '';

// ===================== JULKINEN TAPAHTUMAKALENTERI (ei kirjautumista, ei istuntoa) =====================
// Julkinen data: baarin julkaistu profiili ja julkiset tapahtumat. Palauttaa [pub|null, events]. Ei julkaistua profiilia = ei mitään.
function loadPublicData($conn, $cfg): array {
    $r = fetchOne(prepareQuery($conn, "SELECT pb.name AS pub_title, p.display_name, p.description, p.address, p.city, p.lat, p.lng, p.website, p.color, pb.feature_tickets, pb.feature_bookings, pb.feature_payments
        FROM pub_profiles p CROSS JOIN pubs pb WHERE p.is_public = 1 ORDER BY pb.id LIMIT 1"));
    if (!$r) return [null, []];
    $web = $r['website'] && preg_match('#^https?://#i', $r['website']) ? $r['website'] : null;
    $pub = ['name' => $r['display_name'] ?: $r['pub_title'], 'description' => $r['description'], 'address' => $r['address'], 'city' => $r['city'],
            'lat' => $r['lat'] !== null ? (float)$r['lat'] : null, 'lng' => $r['lng'] !== null ? (float)$r['lng'] : null, 'website' => $web,
            'color' => preg_match('/^#[0-9a-fA-F]{6}$/', (string)$r['color']) ? $r['color'] : null,
            'features' => ['tickets' => (bool)$r['feature_tickets'], 'bookings' => (bool)$r['feature_bookings']]];
    $pays = (int)$r['feature_payments'] === 1;
    $evRows = fetchAllRows(prepareQuery($conn, "SELECT e.id, e.title, e.date, e.type, e.time_start, e.time_end, e.image_path, e.description, e.registration, e.capacity, e.ticket_price, e.ticket_url,
            (SELECT COALESCE(SUM(r.qty), 0) FROM event_registrations r WHERE r.event_id = e.id AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > NOW()))) AS reg_count
        FROM events e WHERE e.is_public = 1 AND e.date >= CURDATE() - INTERVAL 1 MONTH AND e.date <= CURDATE() + INTERVAL 12 MONTH
        ORDER BY e.date, e.time_start LIMIT 1500"));
    $events = [];
    foreach ($evRows as $e) {
        $img = $e['image_path'] && preg_match('#^uploads/[A-Za-z0-9_/.\-]+$#', $e['image_path']) && strpos($e['image_path'], '..') === false ? $e['image_path'] : null;
        $ev = ['id' => (int)$e['id'], 'title' => $e['title'], 'date' => $e['date'], 'type' => $e['type'] ?: 'other',
               'start' => $e['time_start'] ? substr($e['time_start'], 0, 5) : null, 'end' => $e['time_end'] ? substr($e['time_end'], 0, 5) : null,
               'image' => $img, 'description' => $e['description']];
        if ($pub['features']['tickets'] && $e['registration'] !== 'none') {   // ilmoittautuminen vain, jos baari on ottanut sen käyttöön
            $left = $e['capacity'] === null ? null : max(0, (int)$e['capacity'] - (int)$e['reg_count']);
            $ev['reg'] = ['mode' => $e['registration'], 'left' => $left, 'price' => $e['ticket_price'] === null ? null : (float)$e['ticket_price'],
                'pay' => $pays && $e['registration'] === 'tickets' && (float)$e['ticket_price'] > 0 && bsStripeConfigured($cfg), 'pay_methods' => bsStripeMethods($cfg),
                'url' => $e['ticket_url'] && preg_match('#^https://#i', $e['ticket_url']) ? $e['ticket_url'] : null];
        }
        $events[] = $ev;
    }
    return [$pub, $events];
}
function publicBaseUrl($cfg): string { return bsBaseUrl($cfg); }
function icsText(string $t): string {
    $t = str_replace('\\', '\\\\', $t);
    $t = str_replace([';', ','], ['\;', '\,'], $t);
    return str_replace(["\r\n", "\n", "\r"], '\n', $t);
}
function icsFold(string $line): string {   // RFC 5545: rivi enintään 75 tavua, jatkorivit alkavat välilyönnillä
    $out = ''; $limit = 75;
    while (strlen($line) > $limit) {
        $cut = $limit; while ($cut > 0 && (ord($line[$cut]) & 0xC0) === 0x80) $cut--;   // ei kesken UTF-8-merkin
        $out .= substr($line, 0, $cut) . "\r\n "; $line = substr($line, $cut); $limit = 74;
    }
    return $out . $line . "\r\n";
}

if ($method === 'GET' && in_array($action, ['public_events', 'public_ics', 'public_rss'], true)) {
    header('Access-Control-Allow-Origin: *');   // julkista dataa, ei evästeitä
    header('Cache-Control: public, max-age=60');
    [$pub, $events] = loadPublicData($conn, $cfg);
    if ($action === 'public_events') jsonResponse(['pub' => $pub, 'events' => $events, 'generated' => date('c')]);

    // Syötteet (iCal, RSS) vaativat julkaistun profiilin
    if (!$pub) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Baarin julkista profiilia ei ole julkaistu'; exit; }
    $base = publicBaseUrl($cfg);
    $tz = new DateTimeZone(getPub($conn)['timezone']);
    $today = (new DateTime('now', $tz))->format('Y-m-d');
    $events = array_values(array_filter($events, fn($e) => $e['date'] >= $today));
    $link = fn($e) => $base . '/tapahtumat.html';
    if ($action === 'public_ics') {
        header('Content-Type: text/calendar; charset=utf-8');
        header('Content-Disposition: inline; filename="tapahtumat.ics"');
        $host = parse_url($base, PHP_URL_HOST) ?: 'barshift';
        echo "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BarShift Pro//FI\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
        echo icsFold('X-WR-CALNAME:' . icsText($pub['name'] . ' – tapahtumat')) . icsFold('X-WR-TIMEZONE:' . $tz->getName());
        $stamp = gmdate('Ymd\THis\Z');
        foreach ($events as $e) {
            echo "BEGIN:VEVENT\r\n" . icsFold('UID:event-' . $e['id'] . '@' . $host) . "DTSTAMP:$stamp\r\n";
            if ($e['start']) {
                $d1 = new DateTime($e['date'] . ' ' . $e['start'], $tz);
                $d2 = $e['end'] ? new DateTime($e['date'] . ' ' . $e['end'], $tz) : (clone $d1)->modify('+2 hours');
                if ($d2 <= $d1) $d2->modify('+1 day');
                echo 'DTSTART:' . (clone $d1)->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z') . "\r\nDTEND:" . (clone $d2)->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z') . "\r\n";
            } else {
                echo 'DTSTART;VALUE=DATE:' . str_replace('-', '', $e['date']) . "\r\nDTEND;VALUE=DATE:" . date('Ymd', strtotime($e['date'] . ' +1 day')) . "\r\n";
            }
            echo icsFold('SUMMARY:' . icsText($e['title']));
            if ($e['description']) echo icsFold('DESCRIPTION:' . icsText($e['description']));
            $loc = trim(($pub['name'] ?? '') . ', ' . implode(', ', array_filter([$pub['address'], $pub['city']])), ', ');
            echo icsFold('LOCATION:' . icsText($loc)) . icsFold('URL:' . $link($e)) . "END:VEVENT\r\n";
        }
        echo "END:VCALENDAR\r\n";
        exit;
    }
    // RSS 2.0
    header('Content-Type: application/rss+xml; charset=utf-8');
    $x = fn($t) => htmlspecialchars((string)$t, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<rss version="2.0"><channel>';
    echo '<title>' . $x($pub['name'] . ' – tapahtumat') . '</title><link>' . $x($link(null)) . '</link><description>' . $x($pub['description'] ?: 'Tulevat tapahtumat') . '</description><language>fi</language>';
    echo '<lastBuildDate>' . gmdate('D, d M Y H:i:s') . ' GMT</lastBuildDate>';
    foreach (array_slice($events, 0, 50) as $e) {
        $when = date('j.n.Y', strtotime($e['date'])) . ($e['start'] ? ' klo ' . $e['start'] . ($e['end'] ? '–' . $e['end'] : '') : '');
        echo '<item><title>' . $x($e['title'] . ' (' . $when . ')') . '</title><link>' . $x($link($e)) . '</link>'
           . '<guid isPermaLink="false">' . $x('event-' . $e['id']) . '</guid>'
           . '<pubDate>' . (new DateTime($e['date'] . ' ' . ($e['start'] ?: '12:00'), $tz))->setTimezone(new DateTimeZone('UTC'))->format('D, d M Y H:i:s') . ' GMT</pubDate>'
           . '<description>' . $x($when . ($e['description'] ? ' – ' . $e['description'] : '')) . '</description></item>';
    }
    echo '</channel></rss>';
    exit;
}


// ===================== JULKISET ILMOITTAUTUMISET JA PÖYTÄVARAUKSET (ei kirjautumista) =====================
// Toimivat vain baareille, jotka ovat julkaisseet profiilinsa ja ottaneet ominaisuuden käyttöön (pubs.feature_tickets / feature_bookings).
function publicPub($conn, string $feature): ?array {
    if (!fetchOne(prepareQuery($conn, "SELECT 1 FROM pub_profiles WHERE is_public = 1"))) return null;
    $pub = getPub($conn);
    return !empty($pub['features'][$feature]) ? $pub : null;
}
function publicGuard($conn, string $bucket, int $max = 10): void {
    if (rateLimited($conn, $bucket, $max)) fail('Liian monta pyyntöä. Yritä myöhemmin uudelleen.', 429);
    rateHit($conn, $bucket);
}
function cleanGuestInput(array $d): array {
    if (!empty($d['website'])) jsonResponse(["success" => true]);   // honeypot: botit täyttävät piilokentän; vastataan onnistuneesti mitään tallentamatta
    $name = limitStr($d['name'] ?? '', 100, 'name'); $email = limitStr($d['email'] ?? '', 150, 'email');
    if (mb_strlen($name) < 2) fail('Anna nimi');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Anna toimiva sähköpostiosoite');
    return [$name, $email];
}
function bookingSlots($conn, array $pub, string $date, int $party): array {
    $b = $pub['booking']; $out = [];
    $today = date('Y-m-d');
    if ($date < $today || $date > date('Y-m-d', strtotime("+{$b['days_ahead']} days"))) return [];
    $dow = (int)date('N', strtotime($date)) - 1;
    $st = prepareQuery($conn, "SELECT starts_at, duration_min, party_size FROM bookings WHERE status IN ('pending','confirmed','seated') AND starts_at >= ? AND starts_at < ?");
    $from = date('Y-m-d H:i:s', strtotime("$date -1 day")); $to = date('Y-m-d H:i:s', strtotime("$date +2 days"));
    $st->bind_param("ss", $from, $to); $existing = fetchAllRows($st);
    $earliest = time() + $b['lead_hours'] * 3600;
    foreach ($b['hours'] as $h) {
        if ((int)$h['dow'] !== $dow) continue;
        $open = strtotime("$date {$h['open']}"); $close = strtotime("$date {$h['close']}"); if ($close <= $open) $close += 86400;
        for ($t = $open; $t + $b['duration_minutes'] * 60 <= $close; $t += $b['slot_minutes'] * 60) {
            if ($t < $earliest) continue;
            $used = 0; $te = $t + $b['duration_minutes'] * 60;
            foreach ($existing as $x) { $xs = strtotime($x['starts_at']); $xe = $xs + $x['duration_min'] * 60; if ($xs < $te && $xe > $t) $used += (int)$x['party_size']; }
            $free = $b['capacity'] - $used;
            if ($free >= $party) $out[] = ['time' => date('H:i', $t), 'free' => $free];
        }
    }
    return $out;
}

if ($method === 'POST' && $action === 'public_register') {
    $d = json_decode(file_get_contents("php://input"), true) ?: [];
    publicGuard($conn, 'reg:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 10);
    [$name, $email] = cleanGuestInput($d);
    $eid = (int)($d['eventId'] ?? 0); $qty = (int)($d['qty'] ?? 1);
    if ($qty < 1 || $qty > 10) fail('Henkilömäärä 1–10');
    $ev = fetchOne(prepareQuery($conn, "SELECT id, title, date, time_start, registration, capacity, ticket_url, is_public FROM events WHERE id = " . $eid . " AND is_public = 1 AND date >= CURDATE()"));
    if (!$ev || $ev['registration'] === 'none') fail('Tapahtumaan ei voi ilmoittautua', 404);
    $pubRow = getPub($conn);
    $vis = fetchOne(prepareQuery($conn, "SELECT is_public FROM pub_profiles"));
    if (empty($pubRow['features']['tickets']) || !$vis || !(int)$vis['is_public']) fail('Tapahtumaan ei voi ilmoittautua', 404);
    if ($ev['ticket_url']) fail('Liput myydään ulkoisessa palvelussa');
    $lock = $conn->query("SELECT GET_LOCK('reg" . $eid . "', 5)");   // estää ylivarauksen samanaikaisilla pyynnöillä
    try {
        $used = (int)fetchOne(prepareQuery($conn, "SELECT COALESCE(SUM(qty), 0) c FROM event_registrations WHERE event_id = " . $eid . " AND (status = 'confirmed' OR (status = 'pending' AND expires_at > NOW()))"))['c'];
        if ($ev['capacity'] !== null && $used + $qty > (int)$ev['capacity']) fail('Tapahtuma on täynnä tai paikkoja ei ole tarpeeksi (' . max(0, (int)$ev['capacity'] - $used) . ' vapaana)', 409);
        $dup = fetchOne(prepareQuery2($conn, "SELECT id FROM event_registrations WHERE event_id = " . $eid . " AND (status = 'confirmed' OR (status = 'pending' AND expires_at > NOW())) AND email = ?", $email));
        if ($dup) fail('Tällä sähköpostiosoitteella on jo ilmoittautuminen tähän tapahtumaan', 409);
        $code = strtoupper(bin2hex(random_bytes(4))); $tok = bin2hex(random_bytes(24)); $hash = hash('sha256', $tok);
        $priceRow = fetchOne(prepareQuery($conn, "SELECT ticket_price FROM events WHERE id = " . $eid));
        $payNow = !empty($pubRow['features']['payments']) && bsStripeConfigured($cfg) && $ev['registration'] === 'tickets' && $priceRow['ticket_price'] !== null && (float)$priceRow['ticket_price'] > 0;
        if ($payNow) {   // maksullinen lippu: paikka pidetään 30 min, vahvistus tulee Stripen webhookista
            $ins = prepareQuery($conn, "INSERT INTO event_registrations (event_id, name, email, qty, code, cancel_hash, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 31 MINUTE))");
        } else {
            $ins = prepareQuery($conn, "INSERT INTO event_registrations (event_id, name, email, qty, code, cancel_hash) VALUES (?, ?, ?, ?, ?, ?)");
        }
        $ins->bind_param("ississ", $eid, $name, $email, $qty, $code, $hash); run($ins); $regId = (int)$conn->insert_id;
        $wd = prepareQuery($conn, "DELETE FROM event_waitlist WHERE event_id = ? AND email = ?"); $wd->bind_param("is", $eid, $email); run($wd);   // ilmoittautunut poistuu odotuslistalta
    } finally { $conn->query("SELECT RELEASE_LOCK('reg" . $eid . "')"); }
    if ($payNow) {
        $cents = (int)round((float)$priceRow['ticket_price'] * 100);
        $base = bsBaseUrl($cfg);
        [$okS, $sess] = bsStripeCreateCheckout($cfg, ['mode' => 'payment', 'customer_email' => $email, 'client_reference_id' => (string)$regId,
            'success_url' => $base . '/tapahtumat.html?paid=' . $code, 'cancel_url' => $base . '/tapahtumat.html?cancelled=1', 'expires_at' => time() + 1860,
            'line_items' => [['quantity' => $qty, 'price_data' => ['currency' => 'eur', 'unit_amount' => $cents, 'product_data' => ['name' => mb_substr($ev['title'], 0, 120) . ' – ' . date('j.n.Y', strtotime($ev['date']))]]]],
            'metadata' => ['registration_id' => (string)$regId, 'code' => $code]]
            + (bsStripeMethods($cfg) ? ['payment_method_types' => bsStripeMethods($cfg)] : []));
        if (!$okS) { $conn->query("DELETE FROM event_registrations WHERE id = " . $regId); error_log('BarShift Stripe: ' . $sess); fail('Maksun aloitus epäonnistui. Yritä hetken päästä uudelleen.', 502); }
        $ps = prepareQuery($conn, "UPDATE event_registrations SET payment_ref = ? WHERE id = ?"); $sid = mb_substr($sess['id'], 0, 80); $ps->bind_param("si", $sid, $regId); run($ps);
        jsonResponse(["success" => true, "checkout_url" => $sess['url'], "code" => $code]);
    }
    $when = date('j.n.Y', strtotime($ev['date'])) . ($ev['time_start'] ? ' klo ' . substr($ev['time_start'], 0, 5) : '');
    $link = bsBaseUrl($cfg) . '/varaus.html#cancel=' . $tok;
    bsEnqueueMail($conn, $email, '[' . $pubRow['name'] . '] Ilmoittautuminen vahvistettu: ' . $ev['title'],
        "Hei $name,\n\nilmoittautumisesi on vahvistettu.\n\nTapahtuma: {$ev['title']}\nAika: $when\nHenkilöitä: $qty\nVarauskoodi: $code\n\nNäytä koodi ovella. Jos et pääsekään, peru ilmoittautuminen tästä: $link\n");
    jsonResponse(["success" => true, "code" => $code]);
}
if ($method === 'POST' && $action === 'public_cancel') {   // peruutus sähköpostin linkistä: pöytävaraus tai tapahtumailmoittautuminen
    $d = json_decode(file_get_contents("php://input"), true) ?: [];
    publicGuard($conn, 'cancel:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 20);
    $tok = (string)($d['token'] ?? ''); if (!preg_match('/^[0-9a-f]{48}$/', $tok)) fail('Virheellinen linkki', 404);
    $h = hash('sha256', $tok);
    $notify = function (callable $f) { try { $f(); } catch (\Throwable $e) { error_log('BarShift peruutusilmoitus: ' . $e->getMessage()); } };   // ilmoituksen epäonnistuminen ei saa estää peruutusta
    // 1) tapahtumailmoittautuminen (myös maksua odottava)
    $reg = fetchOne(prepareQuery2($conn, "SELECT r.id, r.status, r.name, r.paid_cents, e.title FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.cancel_hash = ?", $h));
    if ($reg) {
        if ($reg['status'] === 'cancelled') jsonResponse(["success" => true, "already" => true]);
        $st = prepareQuery($conn, "UPDATE event_registrations SET status = 'cancelled', expires_at = NULL WHERE id = ? AND status IN ('confirmed', 'pending')"); $rid = (int)$reg['id']; $st->bind_param("i", $rid); run($st);
        $notify(fn() => bsWaitlistPromote($conn, $cfg, (int)fetchOne(prepareQuery($conn, "SELECT event_id FROM event_registrations WHERE id = " . $rid))['event_id']));
        if ((int)$reg['paid_cents'] > 0) $notify(fn() => pushToPub($conn, 0, "Maksettu lippu peruttu", $reg['name'] . ': ' . $reg['title'] . ' – palauta ' . number_format($reg['paid_cents'] / 100, 2, ',', '') . ' € Stripessä', $vapid_auth, true));
        jsonResponse(["success" => true]);
    }
    // 2) pöytävaraus
    $bk = fetchOne(prepareQuery2($conn, "SELECT id, status, name, party_size, starts_at, (starts_at > NOW()) AS upcoming FROM bookings WHERE cancel_hash = ?", $h));
    if (!$bk) fail('Peruutuslinkkiä ei löytynyt. Tarkista, että olet kopioinut koko linkin, tai ota yhteyttä baariin.', 404);
    if (in_array($bk['status'], ['cancelled', 'declined'], true)) jsonResponse(["success" => true, "already" => true]);
    if (!in_array($bk['status'], ['pending', 'confirmed'], true) || !(int)$bk['upcoming']) fail('Varaus on jo alkanut tai ohi, joten sitä ei voi enää perua täältä. Ota tarvittaessa yhteyttä baariin.', 409);
    $st = prepareQuery($conn, "UPDATE bookings SET status = 'cancelled' WHERE id = ?"); $bid = (int)$bk['id']; $st->bind_param("i", $bid); run($st);
    $notify(fn() => pushToPub($conn, 0, "Varaus peruttu", $bk['name'] . ', ' . $bk['party_size'] . ' hlö, ' . date('j.n. \k\l\o H:i', strtotime($bk['starts_at'])), $vapid_auth, true));
    jsonResponse(["success" => true]);
}
if ($method === 'GET' && $action === 'public_feedback_info') {
    publicGuard($conn, 'fb:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 60);
    $tok = (string)($_GET['token'] ?? ''); if (!preg_match('/^[0-9a-f]{48}$/', $tok)) fail('Virheellinen linkki', 404);
    $r = fetchOne(prepareQuery2($conn, "SELECT r.rating, e.title, e.date, p.name AS pname FROM event_registrations r JOIN events e ON e.id = r.event_id CROSS JOIN pubs p WHERE r.feedback_hash = ?", hash('sha256', $tok)));
    if (!$r) fail('Linkki on virheellinen tai vanhentunut', 404);
    jsonResponse(["success" => true, "title" => $r['title'], "date" => $r['date'], "pub" => $r['pname'], "answered" => $r['rating'] !== null]);
}
if ($method === 'POST' && $action === 'public_feedback') {   // tapahtumapalaute sähköpostin linkistä (1–5 + vapaa teksti)
    $d = json_decode(file_get_contents("php://input"), true) ?: [];
    publicGuard($conn, 'fb:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 60);
    $tok = (string)($d['token'] ?? ''); if (!preg_match('/^[0-9a-f]{48}$/', $tok)) fail('Virheellinen linkki', 404);
    $rating = (int)($d['rating'] ?? 0); if ($rating < 1 || $rating > 5) fail('Anna arvosana 1–5');
    $text = mb_substr(trim((string)($d['text'] ?? '')), 0, 500); $textDb = $text === '' ? null : $text;
    $st = prepareQuery($conn, "UPDATE event_registrations SET rating = ?, feedback_text = ?, feedback_at = NOW() WHERE feedback_hash = ? AND rating IS NULL"); $h = hash('sha256', $tok); $st->bind_param("iss", $rating, $textDb, $h); run($st);
    if ($st->affected_rows < 1) {
        $ex = fetchOne(prepareQuery2($conn, "SELECT id FROM event_registrations WHERE feedback_hash = ?", $h));
        if (!$ex) fail('Linkki on virheellinen tai vanhentunut', 404);
        fail('Olet jo antanut palautteen. Kiitos!', 409);
    }
    jsonResponse(["success" => true]);
}
if ($method === 'POST' && $action === 'public_waitlist') {   // odotuslistalle täyteen menneeseen tapahtumaan
    $d = json_decode(file_get_contents("php://input"), true) ?: [];
    publicGuard($conn, 'wl:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 10);
    [$name, $email] = cleanGuestInput($d);
    $eid = (int)($d['eventId'] ?? 0); $qty = (int)($d['qty'] ?? 1); if ($qty < 1 || $qty > 10) fail('Henkilömäärä 1–10');
    $ev = fetchOne(prepareQuery($conn, "SELECT id, registration, capacity, ticket_url FROM events WHERE id = " . $eid . " AND is_public = 1 AND date >= CURDATE()"));
    if (!$ev || $ev['registration'] === 'none' || $ev['capacity'] === null || $ev['ticket_url']) fail('Odotuslistalle ei voi liittyä', 404);
    $pubRow = getPub($conn); $vis = fetchOne(prepareQuery($conn, "SELECT is_public FROM pub_profiles"));
    if (empty($pubRow['features']['tickets']) || !$vis || !(int)$vis['is_public']) fail('Odotuslistalle ei voi liittyä', 404);
    $free = bsWaitlistFree($conn, $eid); if ($free !== null && $free >= $qty) fail('Tapahtumassa on vielä tilaa – ilmoittaudu suoraan.', 409);
    if ((int)fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM event_waitlist WHERE event_id = " . $eid))['c'] >= 200) fail('Odotuslista on täynnä', 409);
    $dup = fetchOne(prepareQuery2($conn, "SELECT id FROM event_registrations WHERE event_id = " . $eid . " AND status = 'confirmed' AND email = ?", $email)); if ($dup) fail('Olet jo ilmoittautunut tähän tapahtumaan', 409);
    $st = prepareQuery($conn, "INSERT INTO event_waitlist (event_id, name, email, qty) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), qty = VALUES(qty)"); $st->bind_param("issi", $eid, $name, $email, $qty); run($st);
    $pos = (int)fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM event_waitlist WHERE event_id = " . $eid . " AND id <= (SELECT id FROM event_waitlist WHERE event_id = " . $eid . " AND email = '" . $conn->real_escape_string($email) . "')"))['c'];
    jsonResponse(["success" => true, "position" => $pos]);
}
if ($method === 'POST' && $action === 'stripe_webhook') {   // Stripen palvelinkutsu: allekirjoitus tarkistetaan, ei istuntoa
    $payload = file_get_contents('php://input');
    if (!bsStripeConfigured($cfg) || !bsStripeVerify($payload, (string)($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? ''), (string)$cfg['stripe']['webhook_secret'])) { http_response_code(400); echo 'invalid'; exit; }
    $evt = json_decode($payload, true); $obj = $evt['data']['object'] ?? [];
    $regId = (int)($obj['client_reference_id'] ?? 0);
    if (in_array($evt['type'] ?? '', ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], true) && $regId && ($obj['payment_status'] ?? '') === 'paid') {
        $cents = (int)($obj['amount_total'] ?? 0); $ref = mb_substr((string)($obj['payment_intent'] ?? $obj['id'] ?? ''), 0, 80);
        $st = prepareQuery($conn, "UPDATE event_registrations SET status = 'confirmed', paid_cents = ?, payment_ref = ?, expires_at = NULL WHERE id = ? AND status IN ('pending', 'cancelled') AND (payment_ref = ? OR payment_ref IS NULL OR payment_ref LIKE 'cs_%')");
        $st->bind_param("isis", $cents, $ref, $regId, $obj['id']); run($st);
        if ($st->affected_rows > 0) {
            $r = fetchOne(prepareQuery($conn, "SELECT r.name, r.email, r.qty, r.code, e.title, e.date, e.time_start FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.id = " . $regId));
            if ($r) {
                $pubR = getPub($conn); $when = date('j.n.Y', strtotime($r['date'])) . ($r['time_start'] ? ' klo ' . substr($r['time_start'], 0, 5) : '');
                bsEnqueueMail($conn, $r['email'], '[' . $pubR['name'] . '] Maksu vastaanotettu: ' . $r['title'], "Hei {$r['name']},\n\nmaksusi (" . number_format($cents / 100, 2, ',', '') . " €) on vastaanotettu ja paikkasi on vahvistettu.\n\nTapahtuma: {$r['title']}\nAika: $when\nHenkilöitä: {$r['qty']}\nVarauskoodi: {$r['code']}\n\nNäytä koodi ovella. Jos et pääsekään, ota yhteyttä baariin: maksun palautus hoidetaan sen kautta.\n");
                pushToPub($conn, 0, "Lipun maksu", $r['name'] . ', ' . $r['qty'] . ' × ' . $r['title'] . ' (' . number_format($cents / 100, 2, ',', '') . ' €)', $vapid_auth, true);
            }
        }
    } elseif (($evt['type'] ?? '') === 'checkout.session.expired' && $regId) {
        $st = prepareQuery($conn, "UPDATE event_registrations SET status = 'cancelled', expires_at = NULL WHERE id = ? AND status = 'pending'"); $st->bind_param("i", $regId); run($st);
        try { $eq = fetchOne(prepareQuery($conn, "SELECT event_id FROM event_registrations WHERE id = " . $regId)); if ($eq) bsWaitlistPromote($conn, $cfg, (int)$eq['event_id']); } catch (\Throwable $e) { error_log('BarShift odotuslista: ' . $e->getMessage()); }
    }
    http_response_code(200); echo 'ok'; exit;
}
if ($method === 'GET' && $action === 'health') {   // valvonta (esim. UptimeRobot): ?key=config['health_key']; 200 = kunnossa, 503 = ongelma
    $key = (string)($cfg['health_key'] ?? '');
    if ($key === '' || !hash_equals($key, (string)($_GET['key'] ?? ''))) { http_response_code(404); exit; }
    $st = systemStatus($conn, $cfg);
    http_response_code($st['ok'] ? 200 : 503);
    jsonResponse(['ok' => $st['ok'], 'alerts' => array_column($st['alerts'], 'text'), 'cron_age_minutes' => $st['cron']['age_minutes'], 'backup_age_hours' => $st['backup']['age_hours']]);
}
if ($method === 'GET' && $action === 'public_booking_info') {
    header('Cache-Control: public, max-age=60');
    $r = publicPub($conn, 'bookings'); if (!$r) fail('Varauksia ei ole käytössä', 404);
    $pp = fetchOne(prepareQuery($conn, "SELECT display_name, address, city FROM pub_profiles")); $b = $r['booking'];
    jsonResponse(["success" => true, "name" => $pp['display_name'] ?: $r['name'], "address" => $pp['address'], "city" => $pp['city'], "max_party" => $b['max_party'], "days_ahead" => $b['days_ahead'], "auto_confirm" => $b['auto_confirm'], "hours" => $b['hours'], "timezone" => $r['timezone']]);
}
if ($method === 'GET' && $action === 'public_slots') {
    $r = publicPub($conn, 'bookings'); if (!$r) fail('Varauksia ei ole käytössä', 404);
    date_default_timezone_set($r['timezone']);
    $date = validDate($_GET['date'] ?? null, 'date'); $party = (int)($_GET['party'] ?? 2);
    if ($party < 1 || $party > $r['booking']['max_party']) fail('Henkilömäärä 1–' . $r['booking']['max_party']);
    jsonResponse(["success" => true, "slots" => bookingSlots($conn, $r, $date, $party)]);
}
if ($method === 'POST' && $action === 'public_book') {
    $d = json_decode(file_get_contents("php://input"), true) ?: [];
    publicGuard($conn, 'book:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 8);
    $r = publicPub($conn, 'bookings'); if (!$r) fail('Varauksia ei ole käytössä', 404);
    $pub = $r; date_default_timezone_set($pub['timezone']); $b = $pub['booking'];
    [$name, $email] = cleanGuestInput($d);
    $phone = limitStr($d['phone'] ?? '', 30, 'phone'); $note = limitStr($d['note'] ?? '', 300, 'note');
    $party = (int)($d['party'] ?? 0); if ($party < 1 || $party > $b['max_party']) fail('Henkilömäärä 1–' . $b['max_party']);
    $date = validDate($d['date'] ?? null, 'date'); $time = substr(validTime($d['time'] ?? null, 'time'), 0, 5);
    $lock = $conn->query("SELECT GET_LOCK('bookings', 5)");
    try {
        if (!in_array($time, array_column(bookingSlots($conn, $pub, $date, $party), 'time'), true)) fail('Valittu aika ei ole enää vapaana. Valitse toinen aika.', 409);
        $starts = "$date $time:00"; $code = strtoupper(bin2hex(random_bytes(4))); $tok = bin2hex(random_bytes(24)); $hash = hash('sha256', $tok);
        $status = $b['auto_confirm'] ? 'confirmed' : 'pending'; $dur = $b['duration_minutes']; $ph = $phone === '' ? null : $phone; $nt = $note === '' ? null : $note;
        $ins = prepareQuery($conn, "INSERT INTO bookings (name, email, phone, party_size, starts_at, duration_min, note, status, code, cancel_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $ins->bind_param("sssisissss", $name, $email, $ph, $party, $starts, $dur, $nt, $status, $code, $hash); run($ins);
    } finally { $conn->query("SELECT RELEASE_LOCK('bookings')"); }
    $when = date('j.n.Y \k\l\o H:i', strtotime($starts)); $link = bsBaseUrl($cfg) . '/varaus.html#cancel=' . $tok;
    bsEnqueueMail($conn, $email, '[' . $pub['name'] . '] ' . ($status === 'confirmed' ? 'Pöytävaraus vahvistettu' : 'Pöytävaraus vastaanotettu'),
        "Hei $name,\n\n" . ($status === 'confirmed' ? "pöytävarauksesi on vahvistettu." : "olemme vastaanottaneet pöytävarauspyyntösi. Saat vahvistuksen sähköpostilla.") . "\n\nAika: $when\nHenkilöitä: $party\nVarauskoodi: $code\n\nJos suunnitelmat muuttuvat, peru varaus tästä: $link\n");
    pushToPub($conn, 0, $status === 'confirmed' ? "Uusi pöytävaraus" : "Uusi varauspyyntö", "$name, $party hlö, $when", $vapid_auth, true);
    jsonResponse(["success" => true, "status" => $status, "code" => $code]);
}

// Istunto: HttpOnly, Secure, SameSite=Strict
session_name('BSSESSID');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', 1);
ini_set('session.gc_maxlifetime', 60 * 60 * 24 * 7);
session_start();
// Istunnon käyttämättömyysaikakatkaisu (config: session_idle_minutes, oletus 480 = 8 h)
if (isset($_SESSION['uid'])) {
    $idleSecs = (int)(((float)($cfg['session_idle_minutes'] ?? 480)) * 60);
    if (isset($_SESSION['last']) && $idleSecs > 0 && time() - (int)$_SESSION['last'] > $idleSecs) { $_SESSION = []; }
    else $_SESSION['last'] = time();
}
// Laiterekisteri: mitätöity (uloskirjattu toisesta laitteesta) istunto katkaistaan; last_seen päivitetään enintään minuutin välein
if (isset($_SESSION['uid']) && !empty($_SESSION['dev'])) {
    try {
        $dh = hash('sha256', (string)$_SESSION['dev']);
        $dr = fetchOne(prepareQuery2($conn, "SELECT id, revoked_at FROM user_sessions WHERE dev_hash = ?", $dh));
        if ($dr && $dr['revoked_at'] !== null) { $_SESSION = []; }
        elseif ($dr && time() - (int)($_SESSION['devseen'] ?? 0) > 60) {
            $conn->query("UPDATE user_sessions SET last_seen = NOW() WHERE id = " . (int)$dr['id']);
            $_SESSION['devseen'] = time();
        }
    } catch (Throwable $e) { /* taulu puuttuu ennen migraatiota: ei estä käyttöä */ }
}

// ===================== iCAL (tunnistus tokenilla) =====================
if ($method === 'GET' && $action === 'ical') {   // henkilökohtainen kalenterisyöte (tilaus): vuorot, valinnaisesti poissaolot, baarin tapahtumat ja muistutus
    $token = $_GET['token'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{32,64}$/', $token)) { http_response_code(404); exit; }
    $u_stmt = prepareQuery($conn, "SELECT id, name FROM users WHERE ical_token = ? AND status <> 'frozen' AND anonymized_at IS NULL");
    $u_stmt->bind_param("s", $token);
    $user = fetchOne($u_stmt);
    if (!$user) { http_response_code(404); exit; }
    $pubI = getPub($conn); $tzI = new DateTimeZone($pubI['timezone']); $utc = new DateTimeZone('UTC');
    $host = parse_url(bsBaseUrl($cfg), PHP_URL_HOST) ?: 'barshift';
    $toUtc = function (string $date, string $time) use ($tzI, $utc): string { return (new DateTime("$date $time", $tzI))->setTimezone($utc)->format('Ymd\THis\Z'); };
    $fold = function (string $line): string { $o = ''; while (strlen($line) > 73) { $cut = 73; while ($cut > 0 && (ord($line[$cut]) & 0xC0) === 0x80) $cut--; $o .= substr($line, 0, $cut) . "\r\n "; $line = substr($line, $cut); } return $o . $line; };
    $esc = fn(string $t) => str_replace(["\\", ";", ",", "\r\n", "\n", "\r"], ["\\\\", "\\;", "\\,", "\\n", "\\n", "\\n"], $t);
    $alarm = isset($_GET['alarm']) && in_array((int)$_GET['alarm'], [15, 30, 60, 120, 1440], true) ? (int)$_GET['alarm'] : 0;
    $stamp = gmdate('Ymd\THis\Z'); $lines = [];
    $ev = function (string $uid, string $start, string $end, string $summary, string $desc, bool $withAlarm) use (&$lines, $stamp, $fold, $esc, $alarm, $pubI) {
        $lines[] = 'BEGIN:VEVENT'; $lines[] = "UID:$uid"; $lines[] = "DTSTAMP:$stamp"; $lines[] = "DTSTART:$start"; $lines[] = "DTEND:$end";
        $lines[] = $fold('SUMMARY:' . $esc($summary)); $lines[] = $fold('DESCRIPTION:' . $esc($desc)); $lines[] = $fold('LOCATION:' . $esc($pubI['name']));
        if ($withAlarm && $alarm) { $lines[] = 'BEGIN:VALARM'; $lines[] = 'ACTION:DISPLAY'; $lines[] = 'DESCRIPTION:' . ($alarm >= 1440 ? 'Huomenna' : 'Pian') . ' alkaa'; $lines[] = 'TRIGGER:-PT' . ($alarm >= 1440 ? '24H' : ($alarm >= 60 ? ($alarm / 60) . 'H' : $alarm . 'M')); $lines[] = 'END:VALARM'; }
        $lines[] = 'END:VEVENT';
    };
    $s_stmt = prepareQuery($conn, "SELECT id, `date`, `start`, `end`, `role` FROM shifts WHERE userId = ? AND status = 'published' AND `date` >= CURDATE() - INTERVAL 30 DAY AND `date` <= CURDATE() + INTERVAL 400 DAY");
    $s_stmt->bind_param("i", $user['id']);
    foreach (fetchAllRows($s_stmt) as $sh) {
        $endDate = $sh['end'] <= $sh['start'] ? date('Y-m-d', strtotime($sh['date'] . ' +1 day')) : $sh['date'];
        $ev('shift-' . $sh['id'] . '@' . $host, $toUtc($sh['date'], $sh['start']), $toUtc($endDate, $sh['end']), 'Työvuoro (' . $sh['role'] . ')', $pubI['name'] . ' · ' . substr($sh['start'], 0, 5) . '–' . substr($sh['end'], 0, 5) . ' · ' . $sh['role'], true);
    }
    if (!empty($_GET['events'])) {
        $e_stmt = prepareQuery($conn, "SELECT id, title, `date`, time_start, time_end FROM events WHERE `date` >= CURDATE() - INTERVAL 7 DAY AND `date` <= CURDATE() + INTERVAL 200 DAY");
        foreach (fetchAllRows($e_stmt) as $e) {
            $st0 = $e['time_start'] ?: '18:00:00'; $en0 = $e['time_end'] ?: null; $endDate = $e['date'];
            if ($en0 === null) { $endDt = (new DateTime($e['date'] . ' ' . $st0, $tzI))->modify('+3 hours'); $en = $endDt->setTimezone($utc)->format('Ymd\THis\Z'); }
            else { if ($en0 <= $st0) $endDate = date('Y-m-d', strtotime($e['date'] . ' +1 day')); $en = $toUtc($endDate, $en0); }
            $ev('event-' . $e['id'] . '@' . $host, $toUtc($e['date'], $st0), $en, 'Tapahtuma: ' . $e['title'], $pubI['name'] . ' – baarin tapahtuma', false);
        }
    }
    if (!empty($_GET['absences'])) {
        $a_stmt = prepareQuery($conn, "SELECT id, type, start_date, end_date FROM absences WHERE user_id = ? AND status = 'approved' AND end_date >= CURDATE() - INTERVAL 30 DAY");
        $a_stmt->bind_param("i", $user['id']);
        $types = ['vacation' => 'Loma', 'sick' => 'Sairasloma', 'other' => 'Poissaolo'];
        foreach (fetchAllRows($a_stmt) as $a) {   // koko päivän tapahtuma (DTEND on seuraava päivä)
            $lines[] = 'BEGIN:VEVENT'; $lines[] = 'UID:absence-' . $a['id'] . '@' . $host; $lines[] = "DTSTAMP:$stamp";
            $lines[] = 'DTSTART;VALUE=DATE:' . date('Ymd', strtotime($a['start_date'])); $lines[] = 'DTEND;VALUE=DATE:' . date('Ymd', strtotime($a['end_date'] . ' +1 day'));
            $lines[] = 'SUMMARY:' . $esc($types[$a['type']] ?? 'Poissaolo'); $lines[] = 'TRANSP:TRANSPARENT'; $lines[] = 'END:VEVENT';
        }
    }
    header('Content-Type: text/calendar; charset=utf-8');
    header('Cache-Control: private, max-age=900');
    echo "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BarShift Pro//FI\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n" . $fold('X-WR-CALNAME:' . $esc('BarShift – ' . $pubI['name'])) . "\r\nX-WR-TIMEZONE:" . $pubI['timezone'] . "\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\nX-PUBLISHED-TTL:PT1H\r\n";
    foreach ($lines as $l) echo $l . "\r\n";
    echo "END:VCALENDAR\r\n";
    exit;
}

// ===================== KUTSULINKIT JA SALASANAN PALAUTUS (ei kirjautumista) =====================
if ($method === 'GET' && $action === 'token_info') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (rateLimited($conn, "token:$ip", 20)) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);
    $t = findAuthToken($conn, (string)($_GET['token'] ?? ''));
    if (!$t) { rateHit($conn, "token:$ip"); fail('Linkki on virheellinen tai vanhentunut. Pyydä uusi linkki ylläpitäjältä tai käytä "Unohtuiko salasana?" -toimintoa.', 404); }
    jsonResponse(["success" => true, "kind" => $t['kind'], "name" => $t['name'], "login" => $t['username']]);
}
if ($method === 'POST' && $action === 'set_password') {
    $d = json_decode(file_get_contents("php://input"), true);
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (rateLimited($conn, "token:$ip", 20)) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);
    $t = findAuthToken($conn, (string)($d['token'] ?? ''));
    if (!$t) { rateHit($conn, "token:$ip"); fail('Linkki on virheellinen tai vanhentunut', 404); }
    $hash = password_hash(validPassword($d['password'] ?? ''), PASSWORD_DEFAULT);
    $conn->begin_transaction();
    $up = prepareQuery($conn, "UPDATE users SET password = ? WHERE id = ?");
    $up->bind_param("si", $hash, $t['user_id']); run($up);
    revokeUserSessions($conn, (int)$t['user_id']);
    $tu = prepareQuery($conn, "UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL");
    $tu->bind_param("i", $t['user_id']); run($tu);
    $conn->commit();
    $clr = prepareQuery($conn, "DELETE FROM login_attempts WHERE username = ?");
    $key = mb_strtolower($t['username']); $clr->bind_param("s", $key); $clr->execute();
    jsonResponse(["success" => true, "login" => $t['username']]);
}
if ($method === 'POST' && $action === 'request_reset') {
    $d = json_decode(file_get_contents("php://input"), true);
    $username = limitStr($d['username'] ?? '', 100, 'username');
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (rateLimited($conn, "reset:$ip", 5)) fail('Liian monta pyyntöä. Yritä myöhemmin uudelleen.', 429);
    rateHit($conn, "reset:$ip");
    // Vastaus on aina sama, ettei sillä voi selvittää mitkä tunnukset ovat olemassa
    $st = prepareQuery($conn, "SELECT id, name, username, email FROM users WHERE username = ? AND anonymized_at IS NULL AND status != 'frozen' AND email IS NOT NULL AND email != ''");
    $st->bind_param("s", $username);
    $u = fetchOne($st);
    if ($u && bsMailConfigured($cfg)) {
        $recent = prepareQuery($conn, "SELECT 1 FROM auth_tokens WHERE user_id = ? AND created_at > NOW() - INTERVAL 5 MINUTE");
        $recent->bind_param("i", $u['id']);
        if (!fetchOne($recent)) issueAuthLink($conn, $cfg, $u, 'reset');
    }
    jsonResponse(["success" => true, "message" => "Jos tunnukselle on tallennettu sähköpostiosoite, siihen on lähetetty salasanan vaihtolinkki."]);
}


// ===================== KIRJAUTUMINEN =====================
if ($method === 'POST' && $action === 'login') {
    $data = json_decode(file_get_contents("php://input"), true);
    $username = limitStr($data['username'] ?? '', 100, 'username');
    $password = is_string($data['password'] ?? null) ? $data['password'] : '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $key = mb_strtolower($username);

    // Brute force -suoja: max 8 epäonnistunutta yritystä / 15 min / IP tai tunnus
    $t = prepareQuery($conn, "SELECT COUNT(*) c FROM login_attempts WHERE attempted_at > NOW() - INTERVAL 15 MINUTE AND (ip = ? OR username = ?)");
    $t->bind_param("ss", $ip, $key);
    $row = fetchOne($t);
    if ($row && (int)$row['c'] >= 8) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);

    $stmt = prepareQuery($conn, "SELECT id, password, status, anonymized_at FROM users WHERE username = ?");
    $stmt->bind_param("s", $username);
    $u = fetchOne($stmt);
    if ($u && !empty($u['anonymized_at'])) $u = null;   // anonymisoidulla tunnuksella ei kirjauduta

    $valid = false;
    if ($u && $password !== '') {
        $stored = (string)$u['password'];
        if (password_get_info($stored)['algo'] !== null) {
            $valid = password_verify($password, $stored);
            if ($valid && password_needs_rehash($stored, PASSWORD_DEFAULT)) {
                $h = password_hash($password, PASSWORD_DEFAULT);
                $up = prepareQuery($conn, "UPDATE users SET password = ? WHERE id = ?");
                $up->bind_param("si", $h, $u['id']); $up->execute();
            }
        } elseif (hash_equals($stored, $password)) {
            // Vanha selkotekstinä tallennettu salasana -> päivitetään heti hashiksi
            $valid = true;
            $h = password_hash($password, PASSWORD_DEFAULT);
            $up = prepareQuery($conn, "UPDATE users SET password = ? WHERE id = ?");
            $up->bind_param("si", $h, $u['id']); $up->execute();
        }
    }

    if (!$valid) {
        $ins = prepareQuery($conn, "INSERT INTO login_attempts (ip, username) VALUES (?, ?)");
        $ins->bind_param("ss", $ip, $key); $ins->execute();
        fail('Väärä tunnus tai salasana', 401);
    }
    if (($u['status'] ?? '') === 'frozen') fail('Tämä baari on jäädytetty. Ota yhteyttä ylläpitoon.', 403);

    // Kaksivaiheinen tunnistautuminen: salasana ei vielä riitä, istuntoon merkitään odottava kirjautuminen
    $tf = prepareQuery($conn, "SELECT totp_enabled FROM users WHERE id = ?");
    $tf->bind_param("i", $u['id']);
    $tfr = fetchOne($tf);
    if ($tfr && (int)$tfr['totp_enabled'] === 1) {
        session_regenerate_id(true);
        $_SESSION = ['pending_uid' => (int)$u['id'], 'pending_at' => time(), 'pending_key' => $key];
        jsonResponse(["success" => true, "needs_2fa" => true]);
    }
    completeLogin($conn, (int)$u['id'], $key);
}
if ($method === 'POST' && $action === 'login_2fa') {
    $data = json_decode(file_get_contents("php://input"), true);
    $uid = (int)($_SESSION['pending_uid'] ?? 0); $key = (string)($_SESSION['pending_key'] ?? '');
    if (!$uid || time() - (int)($_SESSION['pending_at'] ?? 0) > 300) { $_SESSION = []; fail('Kirjautuminen vanheni. Aloita alusta.', 401); }
    if (rateLimited($conn, $key, 8)) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);
    if (!verifySecondFactor($conn, $cfg, $uid, is_string($data['code'] ?? null) ? $data['code'] : '')) {
        rateHit($conn, $key);
        fail('Väärä koodi', 401);
    }
    completeLogin($conn, $uid, $key, true);
}
function revokeUserSessions($conn, int $uid, string $exceptHash = ''): void {
    try {
        $st = prepareQuery($conn, "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL AND dev_hash <> ?");
        $st->bind_param("is", $uid, $exceptHash); run($st);
    } catch (Throwable $e) {}
}
function completeLogin($conn, int $uid, string $key, bool $mfa = false): void {
    $clr = prepareQuery($conn, "DELETE FROM login_attempts WHERE username = ?");
    $clr->bind_param("s", $key); $clr->execute();
    session_regenerate_id(true);
    $_SESSION = ['uid' => $uid, 'mfa' => $mfa, 'last' => time()];
    try {
        $dev = bin2hex(random_bytes(24)); $_SESSION['dev'] = $dev;
        $ua = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255); $ipd = mb_substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
        $ds = prepareQuery($conn, "INSERT INTO user_sessions (user_id, dev_hash, ip, user_agent) VALUES (?, ?, ?, ?)");
        $dh = hash('sha256', $dev); $ds->bind_param("isss", $uid, $dh, $ipd, $ua); run($ds);
    } catch (Throwable $e) { unset($_SESSION['dev']); }
    $me = currentUser($conn);
    $full = prepareQuery($conn, "SELECT id, name, username, role, color, phone, hourly_wage, ical_token, target_hours, has_hygiene, has_alcohol, expiry_jv, start_date, employment_type, email, notify_email, notify_gigs, totp_enabled FROM users WHERE id = ?");
    $full->bind_param("i", $me['id']);
    $user = fetchOne($full);
    jsonResponse(["success" => true, "user" => $user]);
}

if ($method === 'POST' && $action === 'logout') {
    if (!empty($_SESSION['dev'])) { try { $conn->query("UPDATE user_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL AND dev_hash = '" . hash('sha256', (string)$_SESSION['dev']) . "'"); } catch (Throwable $e) {} }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict']);
    }
    session_destroy();
    jsonResponse(["success" => true]);
}

// Kaikki alla vaatii kirjautumisen
$me = requireLogin($conn);
$myId = (int)$me['id'];
if ($method !== 'GET' && (in_array($action, ['event', 'shift', 'publish_shifts', 'clear_shifts', 'apply_week_template', 'save_pub_settings', 'save_pub_profile'], true) || $method === 'DELETE')) hubSyncAfterResponse($conn, $cfg, $vapid_auth);

// Baarin aikavyöhyke: PHP:n ja tietokannan (NOW(), CURDATE()) aika vastaavat baarin paikallista aikaa (leimaukset, vuorot)
if (true) {
    $tzRow = fetchOne(prepareQuery($conn, "SELECT timezone, require_2fa FROM pubs"));
    // Baari vaatii ylläpitäjiltä 2FA:n: ilman sitä sallitaan vain käyttöönotto, oma tietopyyntö ja perusasiat
    if (!empty($tzRow['require_2fa']) && isAdmin($me)) {
        $t2 = fetchOne(prepareQuery($conn, "SELECT totp_enabled FROM users WHERE id = " . $myId));
        $okActions = ['me', 'push_key', 'export_my_data', 'totp_begin', 'totp_enable'];
        if (!(int)($t2['totp_enabled'] ?? 0) && !in_array($action, $okActions, true)) jsonResponse(['error' => 'Baari vaatii ylläpitäjiltä kaksivaiheisen tunnistautumisen. Ota se käyttöön ennen jatkamista.', 'need_2fa' => true], 403);
    }
    $tzName = $tzRow['timezone'] ?? 'Europe/Helsinki';
    if (in_array($tzName, DateTimeZone::listIdentifiers(), true)) {
        date_default_timezone_set($tzName);
        $conn->query("SET time_zone = '" . (new DateTime('now', new DateTimeZone($tzName)))->format('P') . "'");
    }
}

// ===================== LUKU =====================
if ($method === 'GET') {
    if ($action === 'me') {
        $full = prepareQuery($conn, "SELECT id, name, username, role, color, phone, hourly_wage, ical_token, target_hours, has_hygiene, has_alcohol, expiry_jv, start_date, employment_type, email, notify_email, notify_gigs, totp_enabled FROM users WHERE id = ?");
        $full->bind_param("i", $myId);
        $user = fetchOne($full);
        jsonResponse(["success" => true, "user" => $user]);
    }
    if ($action === 'doc_file') {   // dokumentin lataus kirjautuneelle baarin jäsenelle
        $did = (int)($_GET['id'] ?? 0); requireRow($conn, 'documents', $did);
        $d = fetchOne(prepareQuery($conn, "SELECT title, file_path, mime FROM documents WHERE id = " . $did . ""));
        $path = __DIR__ . '/uploads/docs/' . $d['file_path'];
        if (!preg_match('#^[a-f0-9]{16}/[a-f0-9]{32}\.(pdf|jpg|png|webp)$#', $d['file_path']) || !is_file($path)) { http_response_code(404); exit; }
        header('Content-Type: ' . $d['mime']);
        header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9_-]+/', '_', $d['title']) . '.' . pathinfo($path, PATHINFO_EXTENSION) . '"');
        header('X-Content-Type-Options: nosniff'); header("Content-Security-Policy: default-src 'none'; sandbox"); header('Cache-Control: private, max-age=300');
        header('Content-Length: ' . filesize($path)); readfile($path); exit;
    }
    if ($action === 'analytics') {
        requirePerm($me, 'payroll.view');
        $m = max(1, min(12, (int)($_GET['months'] ?? 6)));
        jsonResponse(["success" => true] + computeAnalytics($conn, getPub($conn), $m));
    }
    if ($action === 'event_registrations') {
        requirePerm($me, 'events.manage');
        $eid = (int)($_GET['eventId'] ?? 0); requireRow($conn, 'events', $eid);
        $rows = fetchAllRows(prepareQuery($conn, "SELECT id, name, email, qty, status, arrived, code, created_at, paid_cents, rating, feedback_text FROM event_registrations WHERE event_id = " . $eid . " AND status <> 'pending' ORDER BY id"));
        if (($_GET['format'] ?? '') === 'csv') {
            audit($conn, $me, 'Ilmoittautumiset ladattu', 'event#' . $eid, 'CSV');
            header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="ilmoittautumiset_' . $eid . '.csv"');
            echo "\xEF\xBB\xBF" . "Nimi;Sähköposti;Henkilöä;Tila;Saapunut;Koodi;Ilmoittautui;Maksettu (EUR)\n";
            foreach ($rows as $r) echo implode(';', array_map('csvCell', [$r['name'], $r['email'], $r['qty'], $r['status'] === 'confirmed' ? 'vahvistettu' : 'peruttu', $r['arrived'] ? 'kyllä' : '', $r['code'], $r['created_at'], $r['paid_cents'] ? number_format($r['paid_cents'] / 100, 2, ',', '') : '']))  . "\n";
            exit;
        }
        jsonResponse(["success" => true, "registrations" => $rows, "waitlist" => fetchAllRows(prepareQuery($conn, "SELECT name, email, qty, notified_at FROM event_waitlist WHERE event_id = " . $eid . " ORDER BY id"))]);
    }
    if ($action === 'hour_bank') {
        $months = max(1, min(24, (int)($_GET['months'] ?? 12)));
        $pub = getPub($conn);
        if (can($me, 'payroll.view')) $us = fetchAllRows(prepareQuery($conn, "SELECT id, name, target_hours FROM users WHERE anonymized_at IS NULL ORDER BY name"));
        else $us = fetchAllRows(prepareQuery($conn, "SELECT id, name, target_hours FROM users WHERE id = " . $myId . ""));
        jsonResponse(["success" => true, "bank" => computeHourBank($conn, $pub, $us, $months), "overtime_week_hours" => $pub['overtime_week_hours']]);
    }
    if ($action === 'forecast') {
        requirePerm($me, 'sales.view');
        jsonResponse(["success" => true] + computeForecast($conn, getPub($conn), validDate($_GET['weekStart'] ?? date('Y-m-d'), 'weekStart')));
    }
    if ($action === 'coverage') {
        requirePerm($me, 'shifts.manage');
        $from = validDate($_GET['from'] ?? date('Y-m-d'), 'from'); $to = validDate($_GET['to'] ?? date('Y-m-d', strtotime('+13 days')), 'to');
        if ($to < $from || (strtotime($to) - strtotime($from)) / 86400 > 62) fail('Virheellinen ajanjakso (enintään 63 päivää)');
        jsonResponse(["success" => true, "coverage" => computeCoverage($conn, $from, $to)]);
    }
    if ($action === 'push_key') {   // julkinen VAPID-avain push-tilausta varten (ei salainen)
        jsonResponse(["success" => true, "key" => $cfg['vapid_public_key']]);
    }
    if ($action === 'export_my_data') {   // työntekijän oikeus saada omat tietonsa
        audit($conn, $me, 'export_own_data', $me['username']);
        sendJsonDownload(collectUserData($conn, $cfg, $myId), 'omat-tiedot-' . date('Y-m-d') . '.json');
    }
    if ($action === 'export_user_data') {
        requireAdmin($me);
        $uid = (int)($_GET['id'] ?? 0);
        requireRow($conn, 'users', $uid);
        audit($conn, $me, 'export_user_data', "user#$uid");
        sendJsonDownload(collectUserData($conn, $cfg, $uid), "tyontekija-$uid-" . date('Y-m-d') . '.json');
    }
    if ($action === 'audit_log') {
        requireAdmin($me);
        $st = prepareQuery($conn, "SELECT id, user_name, action, target, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 300");
        jsonResponse(["success" => true, "log" => fetchAllRows($st)]);
    }
    if ($action === 'cash_photo') {   // tilityksen kuva: admin tai tilityksen kirjaaja
        $cid = (int)($_GET['id'] ?? 0); requireRow($conn, 'cash_reports', $cid);
        $c = fetchOne(prepareQuery($conn, "SELECT photo_path, user_id FROM cash_reports WHERE id = " . $cid . ""));
        if (!can($me, 'sales.view') && (int)$c['user_id'] !== $myId) fail('Ei oikeuksia', 403);
        $path = __DIR__ . '/uploads/docs/' . $c['photo_path'];
        if (!$c['photo_path'] || !preg_match('#^[a-f0-9]{16}/[a-f0-9]{32}\.(jpg|png|webp)$#', $c['photo_path']) || !is_file($path)) { http_response_code(404); exit; }
        $ext = pathinfo($path, PATHINFO_EXTENSION);
        header('Content-Type: ' . ($ext === 'jpg' ? 'image/jpeg' : 'image/' . $ext));
        header('X-Content-Type-Options: nosniff'); header("Content-Security-Policy: default-src 'none'; sandbox"); header('Cache-Control: private, max-age=300');
        header('Content-Length: ' . filesize($path)); readfile($path); exit;
    }
    if ($action === 'event_guests_csv') {   // vieraslista ovelle (CSV), vain tapahtumien hallitsijat
        requirePerm($me, 'events.manage');
        $eid = (int)($_GET['event_id'] ?? 0); requireRow($conn, 'events', $eid);
        $ev = fetchOne(prepareQuery($conn, "SELECT title, date FROM events WHERE id = " . $eid . ""));
        $rows = fetchAllRows(prepareQuery($conn, "SELECT g.name, g.note, u.name AS by_name FROM event_guests g JOIN events e ON g.event_id = e.id LEFT JOIN users u ON g.added_by = u.id WHERE g.event_id = " . $eid . " ORDER BY g.name"));
        header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="vieraslista_' . $ev['date'] . '.csv"');
        echo "\xEF\xBB\xBF" . "Nimi;Huomio;Lisännyt\n";
        foreach ($rows as $r) echo implode(';', array_map('csvCell', [$r['name'], $r['note'], $r['by_name'] ?? ''])) . "\n";
        exit;
    }
    if ($action === 'cash_reports') {   // kassatilitykset (admin): JSON tai CSV
        requirePerm($me, 'sales.view');
        $from = validDate($_GET['from'] ?? date('Y-m-01'), 'from'); $to = validDate($_GET['to'] ?? date('Y-m-d'), 'to');
        if ($to < $from) fail('Loppupäivä on ennen alkua');
        $st = prepareQuery($conn, "SELECT c.*, u.name AS user_name FROM cash_reports c LEFT JOIN users u ON c.user_id = u.id WHERE c.date BETWEEN ? AND ? ORDER BY c.date DESC LIMIT 800");
        $st->bind_param("ss", $from, $to);
        $rows = array_map('cashView', fetchAllRows($st));
        if (($_GET['format'] ?? '') === 'csv') {
            audit($conn, $me, 'cash_export', "$from – $to", 'CSV');
            $fmt = fn($v) => $v === null ? '' : number_format((float)$v, 2, ',', '');
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="kassatilitys_' . $from . '_' . $to . '.csv"');
            echo "\xEF\xBB\xBF" . "Päivä;Myynti (EUR);Korttimaksut (EUR);Kassapohja (EUR);Kassasta maksetut (EUR);Käteistipit (EUR);Odotettu käteinen (EUR);Laskettu käteinen (EUR);Ero (EUR);Kirjaaja;Huomio\n";
            foreach (array_reverse($rows) as $r) echo implode(';', array_map('csvCell', [$r['date'], $fmt($r['sales_total']), $fmt($r['card_total']), $fmt($r['float_amount']), $fmt($r['expenses']), $fmt($r['tips']), $fmt($r['expected_cash']), $fmt($r['counted_cash']), $fmt($r['difference']), $r['user_name'] ?? '', $r['note']])) . "\n";
            exit;
        }
        jsonResponse(["success" => true, "reports" => $rows]);
    }
    if ($action === 'hours_confirm') {   // omat tunnit kuukaudelta (laskettu) + vahvistuksen tila; ?all=1 (payroll.view) kaikki työntekijät
        $month = (string)($_GET['month'] ?? date('Y-m', strtotime('first day of last month')));
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('Virheellinen kuukausi');
        $pubRow = getPub($conn);
        $calc = []; foreach (computePayroll($conn, $pubRow, $month) as $r) $calc[$r['id']] = $r;
        $st = prepareQuery($conn, "SELECT * FROM hour_confirmations WHERE month = ?"); $st->bind_param("s", $month);
        $conf = []; foreach (fetchAllRows($st) as $c) $conf[(int)$c['user_id']] = $c;
        $mk = function ($uid, $name) use ($calc, $conf) {
            $c = $conf[$uid] ?? null; $h = isset($calc[$uid]) ? (float)$calc[$uid]['hours'] : 0.0;
            return ['user_id' => $uid, 'name' => $name, 'hours' => $h, 'source' => $calc[$uid]['source'] ?? null, 'status' => $c['status'] ?? 'none', 'confirmed_hours' => $c ? (float)$c['hours'] : null,
                'note' => $c['note'] ?? '', 'admin_note' => $c['admin_note'] ?? '', 'confirmed_at' => $c['confirmed_at'] ?? null, 'decided_at' => $c['decided_at'] ?? null,
                'changed' => $c && $c['status'] === 'approved' && abs((float)$c['hours'] - $h) >= 0.05];
        };
        if (!empty($_GET['all'])) {
            requirePerm($me, 'payroll.view');
            $users = fetchAllRows(prepareQuery($conn, "SELECT id, name FROM users WHERE anonymized_at IS NULL ORDER BY name"));
            $rows = array_values(array_filter(array_map(fn($u) => $mk((int)$u['id'], $u['name']), $users), fn($r) => $r['hours'] > 0 || $r['status'] !== 'none'));
            jsonResponse(["success" => true, "month" => $month, "rows" => $rows]);
        }
        jsonResponse(["success" => true, "month" => $month] + $mk($myId, $me['name']));
    }
    if ($action === 'shift_bids') {   // hakijat vuoroon varoituksineen (shifts.manage)
        requirePerm($me, 'shifts.manage');
        $sid = (int)($_GET['shift_id'] ?? 0); requireRow($conn, 'shifts', $sid);
        $sh = fetchOne(prepareQuery($conn, "SELECT date, start, end, role FROM shifts WHERE id = " . $sid)); $pubRow = getPub($conn);
        $rows = fetchAllRows(prepareQuery($conn, "SELECT b.user_id, b.note, b.created_at, u.name FROM shift_bids b JOIN users u ON b.user_id = u.id WHERE b.shift_id = " . $sid . " ORDER BY b.created_at"));
        foreach ($rows as &$r) $r['warnings'] = shiftWarnings($conn, $pubRow, (int)$r['user_id'], $sh['date'], $sh['start'], $sh['end'], $sid, $sh['role']); unset($r);
        jsonResponse(["success" => true, "bids" => $rows]);
    }
    if ($action === 'guests') {   // vieraskortisto: lista hakusanalla (events.manage)
        requirePerm($me, 'events.manage'); requireGuestsFeature($conn);
        $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim((string)($_GET['q'] ?? ''))) . '%';
        $st = prepareQuery($conn, "SELECT g.id, g.name, g.email, g.phone, g.vip, g.allergies, g.notes, g.tags, g.updated_at,
            (SELECT COUNT(*) FROM bookings b WHERE b.status IN ('confirmed','seated') AND ((g.email IS NOT NULL AND LOWER(b.email) = LOWER(g.email)) OR (g.phone IS NOT NULL AND g.phone <> '' AND RIGHT(REGEXP_REPLACE(b.phone, '[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE(g.phone, '[^0-9]', ''), 9)))) AS visits,
            (SELECT COUNT(*) FROM bookings b WHERE b.status = 'no_show' AND g.email IS NOT NULL AND LOWER(b.email) = LOWER(g.email)) AS no_shows,
            (SELECT MAX(b.starts_at) FROM bookings b WHERE g.email IS NOT NULL AND LOWER(b.email) = LOWER(g.email)) AS last_visit
            FROM guests g WHERE (g.name LIKE ? OR g.email LIKE ? OR g.phone LIKE ? OR g.tags LIKE ?) ORDER BY g.vip DESC, g.name LIMIT 300");
        $st->bind_param("ssss", $q, $q, $q, $q);
        jsonResponse(["success" => true, "guests" => fetchAllRows($st)]);
    }
    if ($action === 'guest_history') {
        requirePerm($me, 'events.manage'); requireGuestsFeature($conn);
        $gid = (int)($_GET['id'] ?? 0); requireRow($conn, 'guests', $gid);
        $g = fetchOne(prepareQuery($conn, "SELECT email, phone FROM guests WHERE id = " . $gid . ""));
        $email = guestKeyEmail($g['email']); $ph = guestKeyPhone($g['phone']);
        $bk = fetchAllRows(prepareQuery($conn, "SELECT starts_at, party_size, status, note, phone, email FROM bookings ORDER BY starts_at DESC LIMIT 400"));
        $bk = array_values(array_filter($bk, fn($b) => ($email && guestKeyEmail($b['email']) === $email) || ($ph && guestKeyPhone($b['phone']) === $ph)));
        $regs = $email ? fetchAllRows(prepareQuery($conn, "SELECT r.qty, r.status, r.arrived, e.title, e.date FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE LOWER(r.email) = '" . $conn->real_escape_string($email) . "' ORDER BY e.date DESC LIMIT 50")) : [];
        jsonResponse(["success" => true, "bookings" => array_map(fn($b) => ['starts_at' => $b['starts_at'], 'party_size' => $b['party_size'], 'status' => $b['status'], 'note' => $b['note']], array_slice($bk, 0, 50)), "events" => $regs]);
    }
    if ($action === 'search') {   // yhteishaku: tulokset rajataan käyttäjän oikeuksien mukaan
        $qraw = trim((string)($_GET['q'] ?? '')); if (mb_strlen($qraw) < 2) jsonResponse(["success" => true, "results" => []]);
        $qraw = mb_substr($qraw, 0, 60); $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $qraw) . '%';
        $out = [];
        $add = function (string $type, string $label, string $sub, array $extra = []) use (&$out) { $out[] = ['type' => $type, 'label' => $label, 'sub' => $sub] + $extra; };
        $run5 = function (string $sql, string $types, array $params) use ($conn) { $st = prepareQuery($conn, $sql); $st->bind_param($types, ...$params); return fetchAllRows($st); };
        foreach ($run5("SELECT id, name, username FROM users WHERE anonymized_at IS NULL AND (name LIKE ? OR username LIKE ?) ORDER BY name LIMIT 8", "ss", [$like, $like]) as $r) $add('user', $r['name'], '@' . $r['username'], ['id' => (int)$r['id']]);
        foreach ($run5("SELECT id, title, date FROM events WHERE (title LIKE ? OR description LIKE ?) ORDER BY ABS(DATEDIFF(date, CURDATE())) LIMIT 8", "ss", [$like, $like]) as $r) $add('event', $r['title'], date('j.n.Y', strtotime($r['date'])), ['id' => (int)$r['id'], 'date' => $r['date']]);
        $draftCond = can($me, 'shifts.manage') ? '' : " AND s.status = 'published'";
        foreach ($run5("SELECT s.id, s.date, s.start, s.end, s.role, u.name FROM shifts s LEFT JOIN users u ON s.userId = u.id WHERE 1=1$draftCond AND (u.name LIKE ? OR s.role LIKE ?) AND s.date >= CURDATE() - INTERVAL 30 DAY ORDER BY s.date LIMIT 8", "ss", [$like, $like]) as $r) $add('shift', ($r['name'] ?: 'Avoin vuoro') . ' · ' . $r['role'], date('j.n.', strtotime($r['date'])) . ' ' . substr($r['start'], 0, 5) . '–' . substr($r['end'], 0, 5), ['id' => (int)$r['id'], 'date' => $r['date']]);
        foreach ($run5("SELECT id, message, created_at FROM notices WHERE message LIKE ? ORDER BY id DESC LIMIT 4", "s", [$like]) as $r) $add('notice', mb_substr($r['message'], 0, 80), 'Ilmoitustaulu');
        foreach ($run5("SELECT id, title FROM documents WHERE (title LIKE ? OR description LIKE ?) LIMIT 4", "ss", [$like, $like]) as $r) $add('document', $r['title'], 'Dokumentti', ['id' => (int)$r['id']]);
        foreach ($run5("SELECT id, item_name FROM shopping_list WHERE item_name LIKE ? LIMIT 4", "s", [$like]) as $r) $add('shopping', $r['item_name'], 'Puutelista');
        // yksityisviestit: vain omat, salaus puretaan palvelimella (viimeiset 500)
        $hits = 0;
        foreach (fetchAllRows(prepareQuery($conn, "SELECT id, sender_id, receiver_id, message, created_at FROM private_messages WHERE (sender_id = " . $myId . " OR receiver_id = " . $myId . ") ORDER BY id DESC LIMIT 500")) as $m) {
            $txt = decryptMessage($cfg, $m['message']); if (mb_stripos($txt, $qraw) === false) continue;
            $other = (int)$m['sender_id'] === $myId ? (int)$m['receiver_id'] : (int)$m['sender_id'];
            $add('message', mb_substr($txt, 0, 90), date('j.n.Y', strtotime($m['created_at'])), ['id' => $other]); if (++$hits >= 5) break;
        }
        if (can($me, 'sales.view')) foreach ($run5("SELECT id, date, sales_total, note FROM cash_reports WHERE (note LIKE ? OR date LIKE ?) ORDER BY date DESC LIMIT 5", "ss", [$like, $like]) as $r) $add('cash', 'Kassatilitys ' . date('j.n.Y', strtotime($r['date'])), number_format((float)$r['sales_total'], 2, ',', '') . ' €' . ($r['note'] ? ' · ' . mb_substr($r['note'], 0, 40) : ''), ['date' => $r['date']]);
        if (can($me, 'events.manage')) {
            foreach ($run5("SELECT id, name, party_size, starts_at FROM bookings WHERE (name LIKE ? OR phone LIKE ? OR email LIKE ? OR code LIKE ?) ORDER BY starts_at DESC LIMIT 5", "ssss", [$like, $like, $like, $like]) as $r) $add('booking', $r['name'] . ' · ' . $r['party_size'] . ' hlö', 'Varaus ' . date('j.n.Y H:i', strtotime($r['starts_at'])), ['id' => (int)$r['id']]);
            if (getPub($conn)['features']['guests']) foreach ($run5("SELECT id, name, email FROM guests WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ? OR tags LIKE ?) LIMIT 5", "ssss", [$like, $like, $like, $like]) as $r) $add('guest', $r['name'], 'Vieraskortisto' . ($r['email'] ? ' · ' . $r['email'] : ''), ['id' => (int)$r['id']]);
            foreach ($run5("SELECT g.id, g.event_id, g.name, e.title FROM event_guests g JOIN events e ON e.id = g.event_id WHERE g.name LIKE ? ORDER BY e.date DESC LIMIT 5", "s", [$like]) as $r) $add('event_guest', $r['name'], 'Vieraslista: ' . $r['title'], ['id' => (int)$r['event_id']]);
        } else foreach ($run5("SELECT g.id, g.event_id, g.name, e.title FROM event_guests g JOIN events e ON e.id = g.event_id WHERE g.name LIKE ? ORDER BY e.date DESC LIMIT 5", "s", [$like]) as $r) $add('event_guest', $r['name'], 'Vieraslista: ' . $r['title'], ['id' => (int)$r['event_id']]);
        jsonResponse(["success" => true, "results" => $out]);
    }
    if ($action === 'payslip') {   // kuukauden palkkaerittely PDF:nä hyväksytyistä tunneista (oma; payroll.view kenelle tahansa)
        $month = (string)($_GET['month'] ?? ''); if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('Virheellinen kuukausi');
        $uid = (int)($_GET['user_id'] ?? 0) ?: $myId; $mgr = can($me, 'payroll.view');
        if ($uid !== $myId && !$mgr) fail('Ei oikeuksia', 403);
        requireRow($conn, 'users', $uid);
        $hq = prepareQuery($conn, "SELECT status, decided_at FROM hour_confirmations WHERE user_id = ? AND month = ?"); $hq->bind_param("is", $uid, $month); $hc = fetchOne($hq);
        $approved = $hc && $hc['status'] === 'approved';
        if (!$approved && !$mgr) fail('Palkkaerittely on saatavilla, kun ylläpito on hyväksynyt kuukauden tunnit.', 409);
        $pub = getPub($conn); $row = null;
        foreach (computePayroll($conn, $pub, $month) as $r) if ($r['id'] === $uid) $row = $r;
        if (!$row) fail('Tältä kuukaudelta ei ole työtunteja', 404);
        $u = fetchOne(prepareQuery($conn, "SELECT name, employee_number FROM users WHERE id = " . $uid));
        $b = $pub['bonuses']; $w = $row['hourly_wage'];
        $fmt = fn($v) => number_format((float)$v, 2, ',', ' ') . ' €'; $fh = fn($v) => number_format((float)$v, 2, ',', ' ') . ' h';
        $lines = [['Perustyö', $row['hours'], $w, $row['base_pay']]];
        foreach ([['Iltalisä', $row['evening'], $b['evening']], ['Yölisä', $row['night'], $b['night']], ['Lauantailisä', $row['saturday'], $b['sat']], ['Sunnuntailisä', $row['sunday'], $w * ($b['sun'] - 1)]] as [$lab, $h, $rate]) if ($h > 0 && $rate != 0) $lines[] = [$lab, $h, $rate, $h * $rate];
        $months = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
        $label = $months[(int)substr($month, 5, 2) - 1] . ' ' . substr($month, 0, 4);
        $pdf = new BsPdf(); $pdf->rect(0, 782, 595, 60, [0.88, 0.30, 0.16]);
        $pdf->text(40, 805, 'Palkkaerittely', 20, true, 'l', [1, 1, 1]); $pdf->text(555, 805, $pub['name'], 11, false, 'r', [1, 1, 1]);
        $pdf->text(40, 750, $u['name'], 14, true); $pdf->text(40, 733, 'Jakso: ' . $label . ($u['employee_number'] ? '   ·   Työntekijänumero: ' . $u['employee_number'] : ''), 10);
        $pdf->text(555, 750, $approved ? 'Tunnit hyväksytty ' . date('j.n.Y', strtotime($hc['decided_at'])) : 'LUONNOS – tunnit eivät ole hyväksytty', 9, !$approved, 'r', $approved ? [0.3, 0.3, 0.3] : [0.8, 0.1, 0.1]);
        $y = 690; $pdf->text(40, $y, 'Erä', 9, true); $pdf->text(330, $y, 'Määrä', 9, true, 'r'); $pdf->text(440, $y, 'À-hinta', 9, true, 'r'); $pdf->text(555, $y, 'Summa', 9, true, 'r'); $pdf->line(40, $y - 6, 555, $y - 6, 0.8, [0.2, 0.2, 0.2]);
        foreach ($lines as $l) { $y -= 24; $pdf->text(40, $y, $l[0], 10); $pdf->text(330, $y, $fh($l[1]), 10, false, 'r'); $pdf->text(440, $y, $fmt($l[2]) . ($l[0] === 'Perustyö' ? '/h' : '/h'), 10, false, 'r'); $pdf->text(555, $y, $fmt($l[3]), 10, false, 'r'); $pdf->line(40, $y - 7, 555, $y - 7, 0.4); }
        $y -= 32; $pdf->text(40, $y, 'Yhteensä (brutto)', 12, true); $pdf->text(555, $y, $fmt($row['total_pay']), 12, true, 'r');
        $y -= 26; $pdf->text(40, $y, 'Tunnit ' . ($row['source'] === 'leimaukset' ? 'leimauksista' : 'toteutuneista vuoroista') . '.', 9, false, 'l', [0.4, 0.4, 0.4]);
        $pdf->line(40, 110, 555, 110, 0.5); $pdf->text(40, 94, 'Tämä on hyväksyttyjen tuntien ja sovittujen lisien perusteella laskettu ohjeellinen erittely, ei virallinen palkkalaskelma.', 8, false, 'l', [0.4, 0.4, 0.4]);
        $pdf->text(40, 82, 'Verot, työeläke- ja muut pidätykset sekä lomakorvaukset eivät sisälly. Virallinen palkkalaskelma tulee palkanlaskijalta.', 8, false, 'l', [0.4, 0.4, 0.4]);
        if ($uid !== $myId) audit($conn, $me, 'Palkkaerittely ladattu', "user#$uid $month", 'PDF');
        $out = $pdf->output('Palkkaerittely ' . $label);
        header('Content-Type: application/pdf'); header('Content-Disposition: attachment; filename="palkkaerittely_' . $month . '.pdf"'); header('Content-Length: ' . strlen($out)); header('Cache-Control: private, no-store');
        echo $out; exit;
    }
    if ($action === 'system_status') { requireAdmin($me); jsonResponse(['success' => true] + systemStatus($conn, $cfg)); }
    if ($action === 'cash_insights') {   // kassaerojen seuranta: kirjaajittain ja viikonpäivittäin (oletus 90 pv)
        requirePerm($me, 'sales.view');
        $days = max(14, min(400, (int)($_GET['days'] ?? 90))); $from = date('Y-m-d', strtotime("-$days days"));
        $rows = array_map('cashView', fetchAllRows(prepareQuery($conn, "SELECT c.*, u.name AS user_name FROM cash_reports c LEFT JOIN users u ON c.user_id = u.id WHERE c.date >= '" . $from . "' ORDER BY c.date")));
        $byUser = []; $byDow = []; $tot = ['reports' => 0, 'counted' => 0, 'balanced' => 0, 'short' => 0, 'over' => 0, 'diff_sum' => 0.0];
        foreach ($rows as $r) {
            $k = (int)($r['user_id'] ?? 0); $byUser[$k] ??= ['user_id' => $k ?: null, 'name' => $r['user_name'] ?? 'Tuntematon', 'reports' => 0, 'counted' => 0, 'balanced' => 0, 'short' => 0, 'over' => 0, 'diff_sum' => 0.0, 'abs_sum' => 0.0];
            $d = (int)date('w', strtotime($r['date'])); $byDow[$d] ??= ['dow' => $d, 'reports' => 0, 'counted' => 0, 'nonzero' => 0, 'diff_sum' => 0.0];
            $byUser[$k]['reports']++; $byDow[$d]['reports']++; $tot['reports']++;
            if ($r['difference'] === null) continue;
            $diff = $r['difference'];
            foreach ([&$byUser[$k], &$tot] as &$t) { $t['counted']++; $t['diff_sum'] += $diff; if ($diff == 0) $t['balanced']++; elseif ($diff < 0) $t['short']++; else $t['over']++; } unset($t);
            $byUser[$k]['abs_sum'] += abs($diff); $byDow[$d]['counted']++; $byDow[$d]['diff_sum'] += $diff; if ($diff != 0) $byDow[$d]['nonzero']++;
        }
        foreach ($byUser as &$u) { $u['diff_sum'] = round($u['diff_sum'], 2); $u['abs_avg'] = $u['counted'] ? round($u['abs_sum'] / $u['counted'], 2) : 0; unset($u['abs_sum']);
            $u['flag'] = $u['short'] >= 3 && $u['counted'] > 0 && $u['short'] / $u['counted'] >= 0.3; } unset($u);
        foreach ($byDow as &$d2) $d2['diff_sum'] = round($d2['diff_sum'], 2); unset($d2);
        $tot['diff_sum'] = round($tot['diff_sum'], 2);
        usort($byUser, fn($a, $b) => $a['diff_sum'] <=> $b['diff_sum']); ksort($byDow);
        jsonResponse(["success" => true, "days" => $days, "totals" => $tot, "by_user" => array_values($byUser), "by_dow" => array_values($byDow)]);
    }
    if ($action === 'cash_accounting') {   // kirjanpitovienti (CSV): päivittäiset kassasummat ALV-erittelyllä
        requirePerm($me, 'sales.view');
        $from = validDate($_GET['from'] ?? date('Y-m-01'), 'from'); $to = validDate($_GET['to'] ?? date('Y-m-d'), 'to');
        if ($to < $from) fail('Loppupäivä on ennen alkua');
        $vat = (float)fetchOne(prepareQuery($conn, "SELECT vat_rate FROM pubs"))['vat_rate'];
        $st = prepareQuery($conn, "SELECT * FROM cash_reports WHERE date BETWEEN ? AND ? ORDER BY date");
        $st->bind_param("ss", $from, $to);
        audit($conn, $me, 'cash_accounting_export', "$from – $to", 'CSV');
        $fmt = fn($v) => $v === null ? '' : number_format((float)$v, 2, ',', '');
        header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="kirjanpito_kassa_' . $from . '_' . $to . '.csv"');
        echo "\xEF\xBB\xBF" . "Päivä;Myynti brutto (EUR);ALV %;ALV (EUR);Myynti netto (EUR);Korttimaksut (EUR);Käteismyynti (EUR);Kassasta maksetut (EUR);Käteistipit (EUR);Laskettu käteinen (EUR);Kassapohja (EUR);Pankkiin vietävä (EUR);Kassaero (EUR)\n";
        $sum = array_fill_keys(['g', 'v', 'n', 'c', 'cash', 'exp', 'tips', 'dep', 'diff'], 0.0);
        foreach (fetchAllRows($st) as $raw) {
            $r = cashView($raw); $g = $r['sales_total']; $net = round($g / (1 + $vat / 100), 2); $v = round($g - $net, 2);
            $cash = round($g - ($r['card_total'] ?? 0), 2); $dep = $r['counted_cash'] === null ? null : round($r['counted_cash'] - ($r['float_amount'] ?? 0), 2);
            echo implode(';', array_map('csvCell', [$r['date'], $fmt($g), str_replace('.', ',', (string)$vat), $fmt($v), $fmt($net), $fmt($r['card_total']), $fmt($cash), $fmt($r['expenses']), $fmt($r['tips']), $fmt($r['counted_cash']), $fmt($r['float_amount']), $fmt($dep), $fmt($r['difference'])])) . "\n";
            $sum['g'] += $g; $sum['v'] += $v; $sum['n'] += $net; $sum['c'] += $r['card_total'] ?? 0; $sum['cash'] += $cash; $sum['exp'] += $r['expenses'] ?? 0; $sum['tips'] += $r['tips'] ?? 0; $sum['dep'] += $dep ?? 0; $sum['diff'] += $r['difference'] ?? 0;
        }
        echo implode(';', array_map('csvCell', ['Yhteensä', $fmt($sum['g']), '', $fmt($sum['v']), $fmt($sum['n']), $fmt($sum['c']), $fmt($sum['cash']), $fmt($sum['exp']), $fmt($sum['tips']), '', '', $fmt($sum['dep']), $fmt($sum['diff'])])) . "\n";
        exit;
    }
    if ($action === 'sales_report') {   // myynnin kehitys viikko/kk/vuosi edelliseen jaksoon verrattuna (admin)
        requirePerm($me, 'sales.view');
        $range = (string)($_GET['range'] ?? 'week');
        if (!in_array($range, ['week', 'month', 'year'], true)) fail('Virheellinen jakso');
        $anchor = new DateTime(validDate($_GET['date'] ?? date('Y-m-d'), 'date'));
        if ($range === 'week') { $a = (clone $anchor)->modify('monday this week'); $b = (clone $a)->modify('+6 days'); $pa = (clone $a)->modify('-7 days'); $pb = (clone $b)->modify('-7 days'); }
        elseif ($range === 'month') { $a = new DateTime($anchor->format('Y-m-01')); $b = (clone $a)->modify('last day of this month'); $pa = (clone $a)->modify('-1 month'); $pb = (clone $pa)->modify('last day of this month'); }
        else { $a = new DateTime($anchor->format('Y-01-01')); $b = new DateTime($anchor->format('Y-12-31')); $pa = (clone $a)->modify('-1 year'); $pb = (clone $b)->modify('-1 year'); }
        $load = function (DateTime $x, DateTime $y) use ($conn) {
            $st = prepareQuery($conn, "SELECT date, amount FROM daily_sales WHERE date BETWEEN ? AND ?");
            $f = $x->format('Y-m-d'); $t = $y->format('Y-m-d'); $st->bind_param("ss", $f, $t);
            $m = []; foreach (fetchAllRows($st) as $r) $m[$r['date']] = (float)$r['amount']; return $m;
        };
        $cur = $load($a, $b); $prev = $load($pa, $pb);
        $points = []; $best = null;
        if ($range === 'year') {
            for ($i = 0; $i < 12; $i++) {
                $m1 = (clone $a)->modify("+$i month"); $m2 = (clone $pa)->modify("+$i month");
                $sum = fn($map, $mm) => array_sum(array_filter($map, fn($k) => substr($k, 0, 7) === $mm->format('Y-m'), ARRAY_FILTER_USE_KEY));
                $points[] = ['label' => $m1->format('Y-m'), 'value' => round($sum($cur, $m1), 2), 'prev' => round($sum($prev, $m2), 2)];
            }
        } else {
            $n = (int)$a->diff($b)->days + 1;
            for ($i = 0; $i < $n; $i++) {
                $d1 = (clone $a)->modify("+$i day")->format('Y-m-d'); $d2 = (clone $pa)->modify("+$i day");
                $prevVal = $d2 <= $pb ? round($prev[$d2->format('Y-m-d')] ?? 0, 2) : null;
                $points[] = ['label' => $d1, 'value' => round($cur[$d1] ?? 0, 2), 'prev' => $prevVal];
                if (isset($cur[$d1]) && ($best === null || $cur[$d1] > $best['value'])) $best = ['date' => $d1, 'value' => round($cur[$d1], 2)];
            }
        }
        $total = round(array_sum($cur), 2); $ptotal = round(array_sum($prev), 2);
        if ($range === 'year') foreach ($points as $p) if ($best === null || $p['value'] > $best['value']) $best = ['date' => $p['label'], 'value' => $p['value']];
        $days = count($cur);
        $pr = fetchOne(prepareQuery($conn, "SELECT sales_target_week, sales_target_month FROM pubs"));
        $target = $range === 'week' ? $pr['sales_target_week'] : ($range === 'month' ? $pr['sales_target_month'] : ($pr['sales_target_month'] !== null ? round($pr['sales_target_month'] * 12, 2) : null));
        $fa = $a->format('Y-m-d'); $fb = $b->format('Y-m-d');
        $lh = fetchOne(prepareQuery($conn, "SELECT COALESCE(SUM(MOD(TIME_TO_SEC(end) - TIME_TO_SEC(start) + 86400, 86400)) / 3600, 0) AS h FROM shifts WHERE userId IS NOT NULL AND status = 'published' AND date BETWEEN '" . $fa . "' AND '" . $fb . "'"));
        $hours = round((float)$lh['h'], 1);
        jsonResponse(["success" => true, "target" => $target === null ? null : (float)$target, "labour_hours" => $hours, "sales_per_hour" => $hours > 0 ? round($total / $hours, 2) : null, "range" => $range, "from" => $a->format('Y-m-d'), "to" => $b->format('Y-m-d'), "prev_from" => $pa->format('Y-m-d'), "prev_to" => $pb->format('Y-m-d'),
            "points" => $points, "total" => $total, "prev_total" => $ptotal, "change_pct" => $ptotal > 0 ? round(($total - $ptotal) / $ptotal * 100, 1) : null,
            "days_with_sales" => $days, "average" => $days ? round($total / $days, 2) : 0, "best" => $best]);
    }
    if ($action === 'payroll' || $action === 'report') {   // palkka-ajo / raportti (admin): JSON tai CSV
        requirePerm($me, 'payroll.view');
        $pub = getPub($conn, true);
        if ($action === 'payroll') {
            $month = (string)($_GET['month'] ?? date('Y-m'));
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('Virheellinen kuukausi');
            $months = [$month];
        } else {   // useampi kuukausi: from..to (enintään 24)
            $from = (string)($_GET['from'] ?? date('Y-m')); $to = (string)($_GET['to'] ?? $from);
            foreach ([$from, $to] as $m) if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $m)) fail('Virheellinen kuukausi');
            if ($to < $from) fail('Loppukuukausi on ennen alkukuukautta');
            $months = [];
            for ($d = new DateTime("$from-01"); $d->format('Y-m') <= $to && count($months) < 25; $d->modify('+1 month')) $months[] = $d->format('Y-m');
            if (count($months) > 24) fail('Enintään 24 kuukautta kerrallaan');
        }
        $side = $pub['side_cost_pct'];
        $rows = [];
        $hc = []; $hq = prepareQuery($conn, "SELECT user_id, month, status FROM hour_confirmations WHERE month BETWEEN ? AND ?"); $hm0 = $months[0]; $hm1 = end($months); $hq->bind_param("ss", $hm0, $hm1);
        foreach (fetchAllRows($hq) as $c) $hc[$c['month']][(int)$c['user_id']] = $c['status'];
        foreach ($months as $month) foreach (computePayroll($conn, $pub, $month) as $r) {
            $r['month'] = $month; $r['hours_status'] = $hc[$month][$r['id']] ?? 'none'; $r['employer_cost'] = round($r['total_pay'] * (1 + $side / 100), 2);
            $rows[] = $r;
        }
        audit($conn, $me, $action . '_export', $months[0] . ($months[0] !== end($months) ? '–' . end($months) : ''), ($_GET['format'] ?? '') === 'csv' ? 'CSV' : 'JSON');
        if (($_GET['format'] ?? '') === 'csv') {
            $fmt = fn($v) => number_format((float)$v, 2, ',', '');
            if (($_GET['layout'] ?? '') === 'lines') {   // palkkatapahtumat: rivi per työntekijä ja palkkalaji (tuotavissa useimpiin palkkajärjestelmiin, palkkalajikoodit asetetaan Baari-välilehdellä)
                $empNos = []; foreach (fetchAllRows(prepareQuery($conn, "SELECT id, employee_number FROM users")) as $u) $empNos[(int)$u['id']] = (string)$u['employee_number'];
                $b = $pub['bonuses']; $pc = $pub['pay_codes'];
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="palkkatapahtumat_' . $months[0] . (count($months) > 1 ? '_' . end($months) : '') . '.csv"');
                echo "\xEF\xBB\xBF" . "Kuukausi;Työntekijänumero;Nimi;Palkkalaji;Määrä (h);Yksikköhinta (EUR);Summa (EUR)\n";
                foreach ($rows as $r) {
                    $lines = [[$pc['base'], $r['hours'], $r['hourly_wage']], [$pc['evening'], $r['evening'], $b['evening']], [$pc['night'], $r['night'], $b['night']], [$pc['sat'], $r['saturday'], $b['sat']], [$pc['sun'], $r['sunday'], $r['hourly_wage'] * ($b['sun'] - 1)]];
                    foreach ($lines as [$code, $qty, $rate]) {
                        if ($qty <= 0 || $rate == 0) continue;
                        echo implode(';', array_map('csvCell', [$r['month'], $empNos[$r['id']] ?? '', $r['name'], $code, $fmt($qty), $fmt($rate), $fmt($qty * $rate)])) . "\n";
                    }
                }
                exit;
            }
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . ($action === 'payroll' ? 'palkka-ajo_' : 'raportti_') . $months[0] . (count($months) > 1 ? '_' . end($months) : '') . '.csv"');
            echo "\xEF\xBB\xBF" . "Kuukausi;Työntekijä;Työsuhde;Lähde;Tuntipalkka;Tunnit;Ilta (h);Yö (h);La (h);Su (h);Perusosa (EUR);Yhteensä (EUR);Työnantajakustannus (EUR);Tunnit hyväksytty\n";
            foreach ($rows as $r) {
                echo implode(';', array_map('csvCell', [$r['month'], $r['name'], $r['employment_type'] === 'casual' ? 'keikkalainen' : 'vakituinen', $r['source'],
                    $fmt($r['hourly_wage']), $fmt($r['hours']), $fmt($r['evening']), $fmt($r['night']), $fmt($r['saturday']), $fmt($r['sunday']),
                    $fmt($r['base_pay']), $fmt($r['total_pay']), $fmt($r['employer_cost']), ['approved' => 'Hyväksytty', 'confirmed' => 'Vahvistettu', 'disputed' => 'Kiistetty', 'returned' => 'Palautettu'][$r['hours_status']] ?? 'Ei vahvistettu']))  . "\n";
            }
            exit;
        }
        jsonResponse(["success" => true, "month" => $months[0], "months" => $months, "rows" => $rows, "side_cost_pct" => $side,
                      "total" => round(array_sum(array_column($rows, 'total_pay')), 2), "employer_total" => round(array_sum(array_column($rows, 'employer_cost')), 2)]);
    }
    if ($action === 'pub_profile') {   // oman baarin julkinen profiili (admin)
        requireAdmin($me);
        $pp = prepareQuery($conn, "SELECT display_name, description, address, city, lat, lng, website, color, is_public FROM pub_profiles");
        $row = fetchOne($pp) ?: ['display_name' => null, 'description' => null, 'address' => null, 'city' => null, 'lat' => null, 'lng' => null, 'website' => null, 'color' => null, 'is_public' => 0];
        jsonResponse(["success" => true, "profile" => $row, "base_url" => publicBaseUrl($cfg)]);
    }


    $admin = isAdmin($me);
    $canShifts = can($me, 'shifts.manage'); $canAbs = can($me, 'absences.approve'); $canContent = can($me, 'content.manage'); $canEvents = can($me, 'events.manage'); $canSales = can($me, 'sales.view'); $canPay = can($me, 'payroll.view');

    $u_stmt = prepareQuery($conn, "SELECT id, name, username, role, access_role, color, phone, hourly_wage, ical_token, target_hours, has_hygiene, has_alcohol, expiry_jv, start_date, employment_type, email, notify_email, notify_gigs, totp_enabled, employee_number, anonymized_at FROM users");
    $users = fetchAllRows($u_stmt);
    if (!$admin) { // työntekijä ei näe kollegoiden palkkaa, iCal-tokenia tai puhelinta
        foreach ($users as &$usr) {
            if ((int)$usr['id'] !== $myId) { if (!$canPay) { $usr['hourly_wage'] = null; $usr['target_hours'] = null; $usr['employment_type'] = null; } $usr['ical_token'] = null; $usr['phone'] = null; $usr['start_date'] = null; $usr['email'] = null; $usr['employee_number'] = null; $usr['notify_email'] = null; $usr['notify_gigs'] = null; $usr['totp_enabled'] = null; }
        }
        unset($usr);
    }

    $draftFilter = $canShifts ? '' : " AND shifts.status = 'published'";   // luonnokset vain adminille
    $s_stmt = prepareQuery($conn, "SELECT shifts.* FROM shifts LEFT JOIN users ON shifts.userId = users.id WHERE 1=1$draftFilter ORDER BY date ASC, start ASC");
    $shifts = fetchAllRows($s_stmt);
    $e_stmt = prepareQuery($conn, "SELECT * FROM events ORDER BY date ASC, time_start ASC");
 $events = fetchAllRows($e_stmt);
    $a_stmt = prepareQuery($conn, "SELECT absences.* FROM absences JOIN users ON absences.user_id = users.id ORDER BY start_date DESC");
 $absences = fetchAllRows($a_stmt);
    if (!$canAbs) {   // työntekijä näkee kollegoista vain hyväksytyt poissaolot, ilman syytä (sairaus näkyy tyyppinä "muu")
        $absences = array_values(array_filter($absences, fn($ab) => (int)$ab['user_id'] === $myId || $ab['status'] === 'approved'));
        foreach ($absences as &$ab) { if ((int)$ab['user_id'] !== $myId) { $ab['description'] = null; if ($ab['type'] === 'sick') $ab['type'] = 'other'; } }
        unset($ab);
    }
    $t_stmt = prepareQuery($conn, "SELECT shift_trades.* FROM shift_trades JOIN users ON shift_trades.offered_by_id = users.id");
 $trades = fetchAllRows($t_stmt);
    $n_stmt = prepareQuery($conn, "SELECT * FROM notices ORDER BY created_at DESC LIMIT 5");
 $notices = fetchAllRows($n_stmt);
    $time_stmt = prepareQuery($conn, "SELECT * FROM time_entries ORDER BY clock_in DESC");
 $time_entries = fetchAllRows($time_stmt);
    $avail_stmt = prepareQuery($conn, "SELECT * FROM availability");
 $availability = fetchAllRows($avail_stmt);
    $tasks_stmt = prepareQuery($conn, "SELECT * FROM tasks ORDER BY sort_order ASC, id ASC");
 $tasks = fetchAllRows($tasks_stmt);
    $cst = prepareQuery($conn, "SELECT id, date, sales_total, card_total, counted_cash, float_amount, expenses, tips, note, user_id, photo_path FROM cash_reports WHERE date >= CURDATE() - INTERVAL " . ($canSales ? 14 : 3) . " DAY" . ($canSales ? "" : " AND user_id = " . (int)$myId) . " ORDER BY date DESC");
 $cash_recent = array_map('cashView', fetchAllRows($cst));
    $tc_stmt = prepareQuery($conn, "SELECT * FROM task_completions WHERE date >= CURDATE() - INTERVAL 7 DAY");
 $task_completions = fetchAllRows($tc_stmt);
    $log_stmt = prepareQuery($conn, "SELECT l.*, u.name as user_name FROM shift_logs l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT 15");
 $shift_logs = fetchAllRows($log_stmt);
    $shop_stmt = prepareQuery($conn, "SELECT s.*, u.name as added_by_name FROM shopping_list s LEFT JOIN users u ON s.added_by = u.id WHERE s.status IN ('pending', 'in_progress') ORDER BY s.created_at ASC");
 $shopping_list = fetchAllRows($shop_stmt);

    // Yksityisviestit: vain omat, purettuna
    $pm_stmt = prepareQuery($conn, "SELECT id, sender_id, receiver_id, message, is_read, created_at FROM (SELECT * FROM private_messages WHERE (sender_id = ? OR receiver_id = ?) ORDER BY id DESC LIMIT 500) t ORDER BY id ASC");
    $pm_stmt->bind_param("ii", $myId, $myId);
    $private_messages = fetchAllRows($pm_stmt);
    foreach ($private_messages as &$pm) { $pm['message'] = decryptMessage($cfg, (string)$pm['message']); }
    unset($pm);


    // Tiimi: perehdytyslistat, dokumentit, kiitokset ja kyselyt
    $checklists = []; $checklist_progress = []; $documents = []; $kudos = []; $surveys = [];
    if (($chk = $conn->query("SHOW TABLES LIKE 'checklists'")) && $chk->num_rows > 0) {   // päivittämättömässä kannassa taulua ei ole: ei kaadeta koko sivua
        $checklists = $canContent ? fetchAllRows(prepareQuery($conn, "SELECT id, name, items FROM checklists ORDER BY name")) : [];
        $prog = fetchAllRows(prepareQuery($conn, "SELECT p.id, p.checklist_id, p.user_id, p.done, p.completed_at, c.name, c.items FROM checklist_progress p JOIN checklists c ON c.id = p.checklist_id" . ($admin ? '' : ' AND p.user_id = ' . $myId)));
        foreach ($prog as $pr) $checklist_progress[] = ['id' => (int)$pr['id'], 'checklist_id' => (int)$pr['checklist_id'], 'user_id' => (int)$pr['user_id'], 'name' => $pr['name'], 'items' => json_decode($pr['items'], true), 'done' => json_decode($pr['done'], true) ?: [], 'completed_at' => $pr['completed_at']];
        foreach ($checklists as &$cl) $cl['items'] = json_decode($cl['items'], true); unset($cl);
        $acks = []; foreach (fetchAllRows(prepareQuery($conn, "SELECT a.document_id, a.user_id FROM document_acks a JOIN documents d ON d.id = a.document_id")) as $a) $acks[(int)$a['document_id']][] = (int)$a['user_id'];
        foreach (fetchAllRows(prepareQuery($conn, "SELECT id, title, description, mime, size, requires_ack, created_at FROM documents ORDER BY created_at DESC")) as $d) {
            $d['requires_ack'] = (int)$d['requires_ack']; $d['acked'] = in_array($myId, $acks[(int)$d['id']] ?? [], true);
            if ($canContent) $d['acked_by'] = $acks[(int)$d['id']] ?? [];
            $documents[] = $d;
        }
        $kudos = fetchAllRows(prepareQuery($conn, "SELECT id, from_user, to_user, message, created_at FROM kudos ORDER BY id DESC LIMIT 40"));
        $done = []; foreach (fetchAllRows(prepareQuery($conn, "SELECT sd.survey_id FROM survey_done sd JOIN surveys s ON s.id = sd.survey_id WHERE sd.user_id = " . $myId)) as $r) $done[(int)$r['survey_id']] = true;
        foreach (fetchAllRows(prepareQuery($conn, "SELECT id, question, status, created_at FROM surveys ORDER BY id DESC LIMIT 20")) as $sv) {
            $sv['answered'] = isset($done[(int)$sv['id']]);
            if ($canContent) {   // tulokset vain kun vastauksia vähintään 3 (nimettömyyden suoja)
                $aq = prepareQuery($conn, "SELECT rating, comment FROM survey_answers WHERE survey_id = ?"); $svid = (int)$sv['id']; $aq->bind_param("i", $svid);
                $ans = fetchAllRows($aq);
                $n = count($ans); $sv['answer_count'] = $n; $sv['results'] = null;
                if ($n >= 3) {
                    $rs = array_values(array_filter(array_column($ans, 'rating'), fn($x) => $x !== null)); $dist = array_fill(1, 5, 0); foreach ($rs as $x) $dist[(int)$x]++;
                    $comments = array_values(array_filter(array_column($ans, 'comment'))); shuffle($comments);
                    $sv['results'] = ['avg' => $rs ? round(array_sum($rs) / count($rs), 2) : null, 'rated' => count($rs), 'dist' => array_values($dist), 'comments' => $comments];
                }
            }
            $surveys[] = $sv;
        }
    }
    $bookings = [];
    if ($canEvents && ($chk3 = $conn->query("SHOW TABLES LIKE 'bookings'")) && $chk3->num_rows > 0) {
        $bookings = fetchAllRows(prepareQuery($conn, "SELECT id, name, email, phone, party_size, starts_at, duration_min, note, status, code, created_at FROM bookings WHERE starts_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND starts_at < DATE_ADD(CURDATE(), INTERVAL 90 DAY) ORDER BY starts_at"));
    }
    if ($bookings && getPub($conn)['features']['guests']) {   // VIP- ja allergiamerkinnät varauksiin
        $gl = fetchAllRows(prepareQuery($conn, "SELECT id, email, phone, vip, allergies FROM guests")); $byE = []; $byP = [];
        foreach ($gl as $g) { if ($k = guestKeyEmail($g['email'])) $byE[$k] = $g; if ($k = guestKeyPhone($g['phone'])) $byP[$k] = $g; }
        foreach ($bookings as &$bk) { $g = $byE[guestKeyEmail($bk['email'])] ?? $byP[guestKeyPhone($bk['phone'])] ?? null; $bk['guest_id'] = $g ? (int)$g['id'] : null; $bk['vip'] = $g ? (int)$g['vip'] : 0; $bk['allergies'] = $g ? $g['allergies'] : ''; } unset($bk);
    }
    $eventRegs = [];
    if ($canEvents && ($chk4 = $conn->query("SHOW TABLES LIKE 'event_registrations'")) && $chk4->num_rows > 0) {
        foreach (fetchAllRows(prepareQuery($conn, "SELECT r.event_id, COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.qty ELSE 0 END), 0) AS qty, SUM(r.arrived) AS arrived, AVG(r.rating) AS rating_avg, COUNT(r.rating) AS rating_cnt FROM event_registrations r JOIN events e ON e.id = r.event_id GROUP BY r.event_id")) as $r) $eventRegs[(int)$r['event_id']] = ['qty' => (int)$r['qty'], 'arrived' => (int)$r['arrived'], 'rating_avg' => $r['rating_avg'] === null ? null : round((float)$r['rating_avg'], 1), 'rating_cnt' => (int)$r['rating_cnt']];
    }
    $arSql = $canShifts ? "SELECT id, user_id, dow, valid_from, valid_to, note FROM availability_rules" : "SELECT id, user_id, dow, valid_from, valid_to, note FROM availability_rules WHERE user_id = " . $myId;
    $availability_rules = fetchAllRows(prepareQuery($conn, $arSql));
    // Vuoronvaihtojen ristiriitahuomautukset (eivät estä; admin ja työntekijä päättävät itse)
    $shiftById = []; foreach ($shifts as $sh) $shiftById[(int)$sh['id']] = $sh;
    $pubForTrades = getPub($conn);
    foreach ($trades as &$tr) {
        $tr['warnings'] = []; $tr['my_warnings'] = []; $tr['swap_warnings'] = [];
        if (!in_array($tr['status'], ['open', 'pending'], true) || !isset($shiftById[(int)$tr['offered_shift_id']])) continue;
        $sh = $shiftById[(int)$tr['offered_shift_id']];
        $recv = $tr['status'] === 'pending' ? (int)$tr['requested_by_id'] : (int)($tr['target_user_id'] ?? 0);
        if ($recv && ($canShifts || $recv === $myId || (int)$tr['offered_by_id'] === $myId)) $tr['warnings'] = shiftWarnings($conn, $pubForTrades, $recv, $sh['date'], $sh['start'], $sh['end'], $tr['status'] === 'pending' && $tr['swap_shift_id'] ? (int)$tr['swap_shift_id'] : 0, $sh['role'] ?? null);
        if ($tr['swap_shift_id'] && $tr['status'] === 'pending' && isset($shiftById[(int)$tr['swap_shift_id']]) && ($canShifts || (int)$tr['offered_by_id'] === $myId)) { $sw = $shiftById[(int)$tr['swap_shift_id']]; $tr['swap_warnings'] = shiftWarnings($conn, $pubForTrades, (int)$tr['offered_by_id'], $sw['date'], $sw['start'], $sw['end'], (int)$tr['offered_shift_id'], $sw['role'] ?? null); }
        if ($tr['status'] === 'open' && (int)$tr['offered_by_id'] !== $myId && !$canShifts) $tr['my_warnings'] = shiftWarnings($conn, $pubForTrades, $myId, $sh['date'], $sh['start'], $sh['end'], 0, $sh['role'] ?? null);
    }
    unset($tr);
    if ($admin || !empty($pubForTrades['features']['hub_feed'])) hubSyncAfterResponse($conn, $cfg, $vapid_auth, true, 120);   // ei vaadi croniakaan: ylläpitäjän sivulataus hakee hakemukset ja lähettää viivästyneet muutokset
    $hubPend = [];   // etusivun Huomio-lista: käsittelemättömät keikkahakemukset (vain vuorojen hallitsijoille)
    if ($canShifts && !empty($pubForTrades['features']['hub_gigs'])) {
        $hubPend = fetchAllRows(prepareQuery($conn, "SELECT a.id, a.name, s.date, s.start, s.end, s.role FROM hub_applications a JOIN shifts s ON s.id = a.shift_id WHERE a.status = 'pending' AND s.date >= CURDATE() ORDER BY s.date, a.id LIMIT 20"));
    }
    jsonResponse(["hub_pending_apps" => $hubPend, "users" => $users, "shifts" => $shifts, "events" => $events, "trades" => $trades, "absences" => $absences, "notices" => $notices, "time_entries" => $time_entries, "availability" => $availability, "tasks" => $tasks, "event_guests" => fetchAllRows(prepareQuery($conn, "SELECT g.id, g.event_id, g.name, g.note, g.added_by FROM event_guests g JOIN events e ON g.event_id = e.id WHERE e.date >= CURDATE() - INTERVAL 30 DAY ORDER BY g.id")), "system_alerts" => $admin ? systemStatus($conn, $cfg)['alerts'] : [], "skills" => fetchAllRows(prepareQuery($conn, "SELECT id, name, for_role FROM skills ORDER BY name")), "user_skills" => $canShifts ? fetchAllRows(prepareQuery($conn, "SELECT us.user_id, us.skill_id, us.valid_until FROM user_skills us JOIN skills s ON us.skill_id = s.id")) : fetchAllRows(prepareQuery($conn, "SELECT us.user_id, us.skill_id, us.valid_until FROM user_skills us WHERE us.user_id = " . $myId)), "hour_conf" => fetchAllRows(prepareQuery($conn, "SELECT month, hours, status, note, admin_note FROM hour_confirmations WHERE user_id = " . $myId . " AND month >= '" . date('Y-m', strtotime('-5 months')) . "' ORDER BY month DESC")), "shift_bids" => $canShifts ? fetchAllRows(prepareQuery($conn, "SELECT b.shift_id, b.user_id FROM shift_bids b JOIN shifts s ON b.shift_id = s.id")) : fetchAllRows(prepareQuery($conn, "SELECT shift_id, user_id FROM shift_bids WHERE user_id = " . $myId)), "perms" => $me['perms'], "access_roles" => $admin ? accessRolesOf(fetchOne(prepareQuery($conn, "SELECT access_roles FROM pubs"))['access_roles'] ?? null) : [], "task_completions" => $task_completions, "cash_recent" => $cash_recent, "shift_logs" => $shift_logs, "shopping_list" => $shopping_list, "private_messages" => $private_messages, "bookings" => $bookings, "event_regs" => (object)$eventRegs, "checklists" => $checklists, "checklist_progress" => $checklist_progress, "documents" => $documents, "kudos" => $kudos, "surveys" => $surveys, "staffing_rules" => $canShifts ? fetchAllRows(prepareQuery($conn, "SELECT id, dow, start, end, role, min_staff FROM staffing_rules ORDER BY dow, start")) : [], "coverage" => $canShifts ? computeCoverage($conn, date('Y-m-d'), date('Y-m-d', strtotime('+13 days'))) : [], "availability_rules" => $availability_rules, "pub" => getPub($conn, $admin), "week_templates" => $canShifts ? fetchAllRows(prepareQuery($conn, "SELECT id, name, (LENGTH(data) - LENGTH(REPLACE(data, '\"dow\"', ''))) / 5 AS n FROM week_templates ORDER BY name")) : [], "shift_templates" => $canShifts ? fetchAllRows(prepareQuery($conn, "SELECT id, name, start, end, role FROM shift_templates ORDER BY start, name")) : []]);
}

// ===================== KIRJOITUS =====================
if ($method === 'POST') {
    $contentType = $_SERVER["CONTENT_TYPE"] ?? '';
    if (strpos($contentType, 'multipart/form-data') !== false) {
        $data = $_POST;
    } else {
        $data = json_decode(file_get_contents("php://input"), true);
    }
    if (!is_array($data)) fail('Virheellinen pyyntö');

    $id = $data['id'] ?? null;
    if ($id === '') $id = null;
    if ($id !== null) $id = (int)$id;


    // Admin-toimien auditloki (kirjataan vasta onnistuneen pyynnön jälkeen)
    $auditMap = [
        'user' => ['Työntekijä ' . ($id ? 'muokattu' : 'lisätty'), fn() => [(string)($data['username'] ?? ''), ($data['name'] ?? '')]],
        'reset_password' => ['Salasana vaihdettu', fn() => ['user#' . (int)($data['userId'] ?? 0), null]],
        'save_pub_settings' => ['Baarin asetukset', fn() => [(string)($data['name'] ?? ''), null]],
        'save_pub_profile' => ['Julkinen profiili', fn() => [null, !empty($data['is_public']) ? 'julkaistu' : 'ei julkinen']],
        'publish_shifts' => ['Vuorot julkaistu', fn() => [null, null]],
        'handle_absence' => ['Poissaolo käsitelty', fn() => ['absence#' . (int)($data['id'] ?? 0), (string)($data['status'] ?? '')]],
        'time_entry' => ['Leimaus muokattu', fn() => ['time_entry#' . (int)($data['id'] ?? 0), ($data['clock_in'] ?? '') . ' – ' . ($data['clock_out'] ?? '')]],
        'anonymize_user' => ['Käyttäjä anonymisoitu', fn() => ['user#' . (int)($data['id'] ?? $data['userId'] ?? 0), null]],
    ];
    if (isset($auditMap[$action]) && (isAdmin($me) || (in_array($action, ['publish_shifts', 'time_entry'], true) && can($me, 'shifts.manage')) || ($action === 'handle_absence' && can($me, 'absences.approve')))) {
        [$label, $fn] = $auditMap[$action]; [$tg, $dt] = $fn();
        auditOnSuccess($conn, $me, $label, $tg, $dt === '' ? null : $dt);
    }

    if ($action === 'shift') {
        if (can($me, 'shifts.manage')) {
            $uId = nullableUserId($data['userId'] ?? null);
            if ($uId !== null) requireRow($conn, 'users', $uId);
            $date = validDate($data['date'] ?? null, 'date');
            $start = validTime($data['start'] ?? null, 'start');
            $end = validTime($data['end'] ?? null, 'end');
            $role = limitStr($data['role'] ?? '', 100, 'role');
            $status = ($data['status'] ?? 'published') === 'draft' ? 'draft' : 'published';
            $repeat = $id ? 0 : max(0, min(52, (int)($data['repeat_weeks'] ?? 0)));
            if ($id) {
                requireRow($conn, 'shifts', $id);
                $stmt = prepareQuery($conn, "UPDATE shifts SET userId = ?, date = ?, start = ?, end = ?, role = ?, status = ? WHERE id = ?");
                $stmt->bind_param("isssssi", $uId, $date, $start, $end, $role, $status, $id);
            } else {
                $stmt = prepareQuery($conn, "INSERT INTO shifts (userId, date, start, end, role, status) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->bind_param("isssss", $uId, $date, $start, $end, $role, $status);
                if ($repeat > 0) {   // viikoittainen toisto: luodaan kopiot seuraaville viikoille samassa transaktiossa
                    $conn->begin_transaction();
                    run($stmt);
                    for ($i = 1; $i <= $repeat; $i++) {
                        $d = date('Y-m-d', strtotime("$date +$i week"));
                        $stmt->bind_param("isssss", $uId, $d, $start, $end, $role, $status);
                        run($stmt);
                    }
                    $conn->commit();
                    jsonResponse(["success" => true, "created" => $repeat + 1]);
                }
            }
            run($stmt); $savedShiftId = $id ?: (int)$conn->insert_id;   // ennen getPubia: sen INSERT IGNORE nollaa insert_id:n
            if (array_key_exists('hub_gig', $data) && getPub($conn)['features']['hub_gigs']) {   // tarjolla keikkatyöläisille (vain avoin, julkaistu vuoro)
                $sid = $savedShiftId; $hg = (!empty($data['hub_gig']) && $uId === null && $status === 'published') ? 1 : 0; $hp = limitStr($data['hub_pay'] ?? '', 80, 'hub_pay');
                $hs = prepareQuery($conn, "UPDATE shifts SET hub_gig = ?, hub_pay = ? WHERE id = ? AND hub_gig <> 2"); $hs->bind_param("isi", $hg, $hp, $sid); run($hs);
            }
        } else {
            // Työntekijä saa vain ottaa itselleen oman baarinsa avoimen vuoron
            if (!$id) fail('Ei oikeuksia', 403);
            if (getPub($conn)['features']['bidding']) fail('Tähän baariin haetaan vuoroja: paina "Hae vuoroa"', 409);
            requireRow($conn, 'shifts', $id);
            $stmt = prepareQuery($conn, "UPDATE shifts SET userId = ? WHERE id = ? AND userId IS NULL AND status = 'published'");
            $stmt->bind_param("ii", $myId, $id);
            run($stmt);
            if ($stmt->affected_rows < 1) fail('Vuoro ei ole enää vapaana', 409);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'user') {
        if (!isAdmin($me)) fail('Ei oikeuksia', 403);
        $name = limitStr($data['name'] ?? '', 100, 'name');
        $username = limitStr($data['username'] ?? '', 100, 'username');
        if ($name === '' || $username === '' || strpbrk($username, '@ ') !== false) fail('Virheellinen nimi tai tunnus');
        $role = $data['role'] ?? 'employee';
        if (!in_array($role, ['admin', 'employee'], true)) fail('Virheellinen rooli');
        $wage = is_numeric($data['hourly_wage'] ?? 0) ? (float)($data['hourly_wage'] ?? 0) : 0.0;
        $target_hours = (int)($data['target_hours'] ?? 0);
        $has_hygiene = !empty($data['has_hygiene']) ? 1 : 0;
        $has_alcohol = !empty($data['has_alcohol']) ? 1 : 0;
        $ex_jv = !empty($data['expiry_jv']) ? validDate($data['expiry_jv'], 'expiry_jv') : null;
        $start_date = !empty($data['start_date']) ? validDate($data['start_date'], 'start_date') : null;
        if ($start_date !== null && $start_date > date('Y-m-d', strtotime('+1 year'))) fail('Aloituspäivä on liian kaukana tulevaisuudessa');
        $emp_type = ($data['employment_type'] ?? 'regular') === 'casual' ? 'casual' : 'regular';
        $email = limitStr($data['email'] ?? '', 150, 'email');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Sähköpostiosoite on virheellinen');
        $emailDb = $email === '' ? null : $email;
        $empNo = limitStr($data['employee_number'] ?? '', 20, 'employee_number'); $empNo = $empNo === '' ? null : $empNo;
        $accessRole = (string)($data['access_role'] ?? ''); if ($role !== 'employee' || $accessRole === 'employee') $accessRole = '';
        if ($accessRole !== '') { $ok = false; foreach (accessRolesOf(fetchOne(prepareQuery($conn, "SELECT access_roles FROM pubs"))['access_roles'] ?? null) as $ar) if ($ar['id'] === $accessRole) $ok = true; if (!$ok) fail('Tuntematon käyttöoikeusrooli'); }
        $accessDb = $accessRole === '' ? null : $accessRole;

        getPub($conn);   // varmistaa, että baarilla on pubs-rivi
        // Tunnus uniikki baarin sisällä
        $chk = prepareQuery($conn, "SELECT id FROM users WHERE username = ? AND id != ?");
        $selfId = $id ?? 0;
        $chk->bind_param("si", $username, $selfId);
        if (fetchOne($chk)) fail('Käyttäjätunnus on jo käytössä');

        if ($id) {
            requireRow($conn, 'users', $id);
            $tgt = prepareQuery($conn, "SELECT role FROM users WHERE id = ?");
            $tgt->bind_param("i", $id);
            $tr = fetchOne($tgt);
            if (!$tr) fail('Ei oikeuksia', 403);
            $stmt = prepareQuery($conn, "UPDATE users SET name = ?, username = ?, role = ?, hourly_wage = ?, target_hours = ?, has_hygiene = ?, has_alcohol = ?, expiry_jv = ?, start_date = ?, employment_type = ?, email = ?, employee_number = ? WHERE id = ?");
            $stmt->bind_param("sssdiiisssssi", $name, $username, $role, $wage, $target_hours, $has_hygiene, $has_alcohol, $ex_jv, $start_date, $emp_type, $emailDb, $empNo, $id);
            run($stmt);
            $st9 = prepareQuery($conn, "UPDATE users SET access_role = ? WHERE id = ?"); $st9->bind_param("si", $accessDb, $id); run($st9);
            if (!empty($data['password'])) {
                $hashed_password = password_hash(validPassword($data['password']), PASSWORD_DEFAULT);
                $stmt2 = prepareQuery($conn, "UPDATE users SET password = ? WHERE id = ?");
                $stmt2->bind_param("si", $hashed_password, $id); run($stmt2);
            }
        } else {
            // Kutsu: työntekijä asettaa salasanan itse linkistä; kantaan laitetaan väliaikaisesti arvaamaton salasana
            $link = false;
            if ($link && $emailDb === null) fail('Tunnusten yhdistäminen vaatii henkilön sähköpostiosoitteen');
            $invite = !empty($data['invite']) || $link;
            $hashed_password = $invite ? password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT) : password_hash(validPassword($data['password'] ?? ''), PASSWORD_DEFAULT);
            $color = preg_match('/^#[0-9a-fA-F]{6}$/', $data['color'] ?? '') ? $data['color'] : '#E14D2A';
            $stmt = prepareQuery($conn, "INSERT INTO users (name, username, password, role, color, hourly_wage, target_hours, has_hygiene, has_alcohol, expiry_jv, start_date, employment_type, email, employee_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("sssssdiiisssss", $name, $username, $hashed_password, $role, $color, $wage, $target_hours, $has_hygiene, $has_alcohol, $ex_jv, $start_date, $emp_type, $emailDb, $empNo);
            run($stmt);
            $newUid = $conn->insert_id; $st9 = prepareQuery($conn, "UPDATE users SET access_role = ? WHERE id = ?"); $st9->bind_param("si", $accessDb, $newUid); run($st9);
            if ($invite) {
                [$lnk, $emailed] = issueAuthLink($conn, $cfg, ['id' => $newUid, 'name' => $name, 'username' => $username, 'email' => $emailDb], $link ? 'link' : 'invite');
                jsonResponse(["success" => true, "invite" => ["link" => $lnk, "emailed" => $emailed, "kind" => 'invite']]);
            }
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'send_invite') {   // uusi kutsu-/palautuslinkki olemassa olevalle työntekijälle
        requireAdmin($me);
        $uid = (int)($data['userId'] ?? 0);
        requireRow($conn, 'users', $uid);
        $st = prepareQuery($conn, "SELECT id, name, username, email, role FROM users WHERE id = ? AND anonymized_at IS NULL");
        $st->bind_param("i", $uid);
        $u = fetchOne($st);
        if (!$u) fail('Ei löydy', 404);
        [$link, $emailed] = issueAuthLink($conn, $cfg, $u, 'invite');
        audit($conn, $me, 'Kutsulinkki luotu', $u['username'], $emailed ? 'lähetetty sähköpostilla' : 'linkki annettu adminille');
        jsonResponse(["success" => true, "invite" => ["link" => $link, "emailed" => $emailed]]);

    // ---- Kaksivaiheinen tunnistautuminen (TOTP) ----
    } elseif ($action === 'totp_begin') {
        $st = prepareQuery($conn, "SELECT totp_enabled FROM users WHERE id = ?");
        $st->bind_param("i", $myId);
        if ((int)(fetchOne($st)['totp_enabled'] ?? 0) === 1) fail('Kaksivaiheinen tunnistautuminen on jo käytössä');
        $secret = b32encode(random_bytes(20));
        $enc = encryptMessage($cfg, $secret);
        $up = prepareQuery($conn, "UPDATE users SET totp_secret = ?, totp_last_step = 0 WHERE id = ?");
        $up->bind_param("si", $enc, $myId); run($up);
        $label = rawurlencode('BarShift:' . $me['username']);
        jsonResponse(["success" => true, "secret" => trim(chunk_split($secret, 4, ' ')), "uri" => "otpauth://totp/$label?secret=$secret&issuer=BarShift&algorithm=SHA1&digits=6&period=30"]);

    } elseif ($action === 'totp_enable') {
        $st = prepareQuery($conn, "SELECT totp_secret, totp_enabled FROM users WHERE id = ?");
        $st->bind_param("i", $myId);
        $u = fetchOne($st);
        if (!$u || !$u['totp_secret'] || (int)$u['totp_enabled'] === 1) fail('Aloita käyttöönotto uudelleen');
        if (rateLimited($conn, 'totp:' . $myId, 8)) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);
        $step = totpVerify(decryptMessage($cfg, (string)$u['totp_secret']), (string)($data['code'] ?? ''));
        if ($step === null) { rateHit($conn, 'totp:' . $myId); fail('Koodi ei täsmää. Tarkista puhelimen kello ja yritä uudelleen.'); }
        $codes = []; $hashes = [];
        for ($i = 0; $i < 8; $i++) { $c = bin2hex(random_bytes(5)); $codes[] = substr($c, 0, 5) . '-' . substr($c, 5); $hashes[] = hash('sha256', $c); }
        $json = json_encode($hashes);
        $up = prepareQuery($conn, "UPDATE users SET totp_enabled = 1, totp_last_step = ?, recovery_codes = ? WHERE id = ?");
        $up->bind_param("isi", $step, $json, $myId); run($up);
        audit($conn, $me, '2FA otettu käyttöön', $me['username']);
        jsonResponse(["success" => true, "recovery_codes" => $codes]);

    } elseif ($action === 'hub_pair') {   // liitä baari keskukseen keskuksen antamalla liitoskoodilla (ei config.php-muokkausta)
        requireAdmin($me);
        if (rateLimited($conn, 'hubpair:' . $myId, 6)) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);
        rateHit($conn, 'hubpair:' . $myId);
        $url = hubNormalizeUrl((string)($data['url'] ?? '')); if ($url === null) fail('Keskuksen osoite: anna https://-osoite ilman polun jälkeistä osaa (esim. https://sivu.fi/hub)');
        $code = (string)($data['code'] ?? ''); if (strlen(preg_replace('/[^A-Za-z0-9]/', '', $code)) !== 20) fail('Liitoskoodi on 20 merkkiä (esim. ABCDE-FGHJK-LMNPQ-RSTUV)');
        [$ok, $res] = hubPairWithCode($cfg, $url, $code);
        if (!$ok) fail($res, 502);
        $enc = hubSeal($cfg, $res['private_key']);
        $st = prepareQuery($conn, "INSERT INTO hub_connection (id, url, pub_slug, private_key_enc, hub_name) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE url = VALUES(url), pub_slug = VALUES(pub_slug), private_key_enc = VALUES(private_key_enc), hub_name = VALUES(hub_name), connected_at = NOW()");
        $st->bind_param("ssss", $url, $res['slug'], $enc, $res['name']); run($st);
        $conn->query("DELETE FROM hub_sync");   // uusi yhteys: lähetetään kaikki uudelleen
        audit($conn, $me, 'Keskuspalvelin liitetty', $url);
        jsonResponse(["success" => true, "slug" => $res['slug'], "name" => $res['name']]);

    } elseif ($action === 'hub_disconnect') {
        requireAdmin($me);
        $stF = prepareQuery($conn, "UPDATE pubs SET feature_hub_events = 0, feature_hub_gigs = 0, feature_hub_feed = 0"); run($stF);
        if (hubConfigured($cfg)) { hubSync($conn, $cfg, ['feature_hub_events' => 0, 'feature_hub_gigs' => 0]); }   // poistaa julkaistut tapahtumat ja vuorot keskuksesta (parhaansa mukaan)
        $conn->query("DELETE FROM hub_connection WHERE id = 1"); $conn->query("DELETE FROM hub_sync"); $conn->query("DELETE FROM hub_feed"); $conn->query("DELETE FROM hub_outgoing");
        audit($conn, $me, 'Keskuspalvelin irrotettu', null);
        jsonResponse(["success" => true, "note" => isset($cfg['hub']['source']) && $cfg['hub']['source'] === 'config' ? 'Yhteys on määritelty myös config.php:ssä: poista hub-lohko sieltä' : null]);

    } elseif ($action === 'hub_sync_now') {   // testaa yhteys ja synkronoi heti (ylläpito)
        requireAdmin($me);
        if (!hubConfigured($cfg)) fail('Baaria ei ole liitetty keskukseen: liitä se ensin liitoskoodilla', 409);
        [$pc] = hubRequest($cfg, 'GET', '/v1/applications?since_id=999999999');
        if ($pc !== 200) { bsHubRecord($conn, false, hubLastError()); fail(hubLastError() ?: 'Keskus ei vastannut', 502); }
        $prow = fetchOne(prepareQuery($conn, "SELECT feature_hub_events, feature_hub_gigs, feature_hub_feed FROM pubs ORDER BY id LIMIT 1"));
        [$sent, $errs] = hubSync($conn, $cfg, $prow); $new = hubPullApplications($conn, $cfg, $prow, $vapid_auth);
        [$feedNew] = hubFeedPull($conn, $cfg, $prow, $vapid_auth); hubOutgoingPull($conn, $cfg, $prow, $vapid_auth);
        bsHubRecord($conn, $errs === 0, $errs ? hubLastError() : '');
        jsonResponse(["success" => $errs === 0, "sent" => $sent, "errors" => $errs, "new_applications" => $new, "feed_new" => $feedNew, "error" => $errs ? hubLastError() : null,
            "note" => (empty($prow['feature_hub_events']) && empty($prow['feature_hub_gigs']) && empty($prow['feature_hub_feed'])) ? 'Yhteys toimii, mutta mikään keskusominaisuus ei ole päällä (Baari → Asetukset → Keskuspalvelin).' : null]);

    } elseif ($action === 'hub_feed') {   // muiden baarien vapaat vuorot ja omat hakemukset (kaikki kirjautuneet)
        $pf = getPub($conn);
        if (empty($pf['features']['hub_feed']) || !hubConfigured($cfg)) jsonResponse(["success" => true, "enabled" => false, "shifts" => [], "applications" => []]);
        // Välilehden avaus hakee uudet vuorot ja hakemusten tilan heti (enintään kerran 15 s välein; keskus ei voi itse ilmoittaa)
        $lastPull = fetchOne(prepareQuery($conn, "SELECT v FROM system_status WHERE k = 'hub_feed_pull'"));
        $refreshed = false;
        if (!$lastPull || time() - (int)$lastPull['v'] >= 15) {
            $nowTs = (string)time(); $stp = prepareQuery($conn, "INSERT INTO system_status (k, v) VALUES ('hub_feed_pull', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)"); $stp->bind_param('s', $nowTs); run($stp);
            $prowF = fetchOne(prepareQuery($conn, "SELECT feature_hub_events, feature_hub_gigs, feature_hub_feed FROM pubs ORDER BY id LIMIT 1"));
            if ($prowF) { hubFeedPull($conn, $cfg, $prowF, $vapid_auth); hubOutgoingPull($conn, $cfg, $prowF, $vapid_auth); $refreshed = true; }
        }
        $shifts = fetchAllRows(prepareQuery($conn, "SELECT f.hub_shift_id AS id, f.bar_name, f.city, f.date, f.time_start, f.time_end, f.role, f.pay_text, f.note,
                (SELECT o.status FROM hub_outgoing o WHERE o.hub_shift_id = f.hub_shift_id AND o.user_id = " . (int)$myId . ") AS my_status
            FROM hub_feed f WHERE f.gone = 0 AND f.date >= CURDATE() ORDER BY f.date, f.time_start LIMIT 200"));
        $apps = fetchAllRows(prepareQuery($conn, "SELECT id, status, bar_name, city, date, time_start, time_end, role, address FROM hub_outgoing WHERE user_id = " . (int)$myId . " AND date >= CURDATE() - INTERVAL 14 DAY ORDER BY date DESC, id DESC LIMIT 50"));
        $me2 = fetchOne(prepareQuery($conn, "SELECT phone, email FROM users WHERE id = " . (int)$myId));
        jsonResponse(["success" => true, "enabled" => true, "refreshed" => $refreshed, "shifts" => $shifts, "applications" => $apps, "profile" => ["phone" => $me2['phone'] ?? '', "email" => $me2['email'] ?? '', "name" => $me['name']]]);

    } elseif ($action === 'hub_apply') {   // oma työntekijä hakee toisen baarin vuoroa: tiedot lähtevät keskuksen kautta vain vuoron tarjonneelle baarille
        $pf = getPub($conn);
        if (empty($pf['features']['hub_feed']) || !hubConfigured($cfg)) fail('Toiminto ei ole käytössä', 409);
        if (rateLimited($conn, 'hubapply:' . $myId, 20)) fail('Liian monta hakemusta. Yritä myöhemmin uudelleen.', 429);
        $sid = (int)($data['shiftId'] ?? 0);
        $phone = limitStr($data['phone'] ?? '', 40, 'phone'); $email = limitStr($data['email'] ?? '', 190, 'email'); $msg = limitStr($data['message'] ?? '', 500, 'message');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Sähköpostiosoite on virheellinen');
        if ($phone === '' && $email === '') fail('Anna puhelinnumero tai sähköposti, jotta baari voi ottaa yhteyttä');
        $f = fetchOne(prepareQuery($conn, "SELECT * FROM hub_feed WHERE hub_shift_id = " . $sid . " AND gone = 0 AND date >= CURDATE()"));
        if (!$f) fail('Vuoro ei ole enää haettavissa', 404);
        if (fetchOne(prepareQuery($conn, "SELECT id FROM hub_outgoing WHERE user_id = " . (int)$myId . " AND hub_shift_id = " . $sid))) fail('Olet jo hakenut tätä vuoroa', 409);
        rateHit($conn, 'hubapply:' . $myId);
        $payload = array_filter(['ref' => 'u' . $myId, 'name' => $me['name'], 'phone' => $phone ?: null, 'email' => $email ?: null, 'message' => $msg ?: null], fn($v) => $v !== null);
        [$code, $res] = hubRequest($cfg, 'POST', '/v1/feed/' . $sid . '/apply', $payload);
        if ($code !== 201 && $code !== 200) fail($res['error'] ?? 'Keskuspalvelin ei vastannut', $code === 0 ? 502 : ($code === 404 ? 404 : 409));
        $hid = (int)($res['id'] ?? 0); if ($hid <= 0) fail('Keskuspalvelin antoi virheellisen vastauksen', 502);
        $ins = prepareQuery($conn, "INSERT INTO hub_outgoing (hub_application_id, hub_shift_id, user_id, status, bar_name, city, date, time_start, time_end, role) VALUES (?,?,?,?,?,?,?,?,?,?)");
        $stt = in_array($res['status'] ?? '', ['pending', 'accepted', 'declined'], true) ? $res['status'] : 'pending';
        $ins->bind_param("iiisssssss", $hid, $sid, $myId, $stt, $f['bar_name'], $f['city'], $f['date'], $f['time_start'], $f['time_end'], $f['role']); run($ins);
        audit($conn, $me, 'Haettu vuoroa toisesta baarista', $f['bar_name'] . ' ' . $f['date']);
        jsonResponse(["success" => true]);

    } elseif ($action === 'hub_withdraw') {
        if (!hubConfigured($cfg)) fail('Toiminto ei ole käytössä', 409);
        $oid = (int)($data['id'] ?? 0);
        $o = fetchOne(prepareQuery($conn, "SELECT id, hub_application_id, status FROM hub_outgoing WHERE id = " . $oid . " AND user_id = " . (int)$myId));
        if (!$o) fail('Ei löydy', 404);
        if ($o['status'] !== 'pending') fail('Vain odottavan hakemuksen voi perua', 409);
        [$code, $res] = hubRequest($cfg, 'POST', '/v1/outgoing_applications/' . (int)$o['hub_application_id'] . '/withdraw', []);
        if ($code !== 200) fail($res['error'] ?? 'Keskuspalvelin ei vastannut', $code === 0 ? 502 : 409);
        if (empty($res['changed'])) fail('Hakemus on jo käsitelty', 409);
        $conn->query("DELETE FROM hub_outgoing WHERE id = " . $oid);
        jsonResponse(["success" => true]);

    } elseif ($action === 'hub_applications') {   // keikkahakemukset keskuspalvelimen kautta (vain ylläpito)
        requireAdmin($me);
        if (hubConfigured($cfg)) { $prow = fetchOne(prepareQuery($conn, "SELECT feature_hub_events, feature_hub_gigs, feature_hub_feed FROM pubs ORDER BY id LIMIT 1")); if ($prow) hubPullApplications($conn, $cfg, $prow, $vapid_auth); }
        $rows = fetchAllRows(prepareQuery($conn, "SELECT a.id, a.shift_id, a.name, a.skills, a.city, a.message, a.status, a.email, a.phone, a.created_at, s.date, s.start, s.end, s.role
            FROM hub_applications a JOIN shifts s ON s.id = a.shift_id ORDER BY a.status = 'pending' DESC, a.id DESC LIMIT 100"));
        jsonResponse(["success" => true, "applications" => $rows, "hub_connected" => hubConfigured($cfg)]);

    } elseif ($action === 'hub_decide') {
        requireAdmin($me);
        if (!hubConfigured($cfg)) fail('Baaria ei ole liitetty keskukseen', 409);
        $aid = (int)($data['id'] ?? 0); $dec = $data['decision'] ?? '';
        if (!in_array($dec, ['accepted', 'declined'], true)) fail('Virheellinen päätös');
        $a = fetchOne(prepareQuery($conn, "SELECT a.id, a.hub_id, a.shift_id, a.status FROM hub_applications a JOIN shifts s ON s.id = a.shift_id WHERE a.id = " . $aid . ""));
        if (!$a) fail('Ei löydy', 404);
        if ($a['status'] !== 'pending') fail('Hakemus on jo käsitelty', 409);
        [$code, $res] = hubRequest($cfg, 'POST', '/v1/applications/' . (int)$a['hub_id'] . '/decision', ['decision' => $dec]);
        if ($code !== 200) fail($res['error'] ?? 'Keskuspalvelin ei vastannut', $code === 0 ? 502 : 409);
        $up = prepareQuery($conn, "UPDATE hub_applications SET status = ?, decided_at = NOW() WHERE id = ?"); $up->bind_param("si", $dec, $aid); run($up);
        if ($dec === 'accepted') {   // vuoro täyttyi: muut hakemukset hylätään, ja hyväksytyn yhteystiedot haetaan keskuksesta
            $conn->query("UPDATE hub_applications SET status = 'declined', decided_at = NOW() WHERE shift_id = " . (int)$a['shift_id'] . " AND status = 'pending'");
            $conn->query("UPDATE shifts SET hub_gig = 2 WHERE id = " . (int)$a['shift_id']);
            [$c2, $r2] = hubRequest($cfg, 'GET', '/v1/applications?since_id=' . ((int)$a['hub_id'] - 1));
            foreach (($c2 === 200 ? ($r2['applications'] ?? []) : []) as $x) if ((int)$x['id'] === (int)$a['hub_id']) {
                $em = isset($x['email']) ? mb_substr((string)$x['email'], 0, 190) : null; $ph = isset($x['phone']) ? mb_substr((string)$x['phone'], 0, 40) : null;
                $cu = prepareQuery($conn, "UPDATE hub_applications SET email = ?, phone = ? WHERE id = ?"); $cu->bind_param("ssi", $em, $ph, $aid); run($cu);
            }
            $worker = hubCreateGigWorker($conn, $cfg, $aid, (int)$a['shift_id']);   // keikkalaiselle tunnus ja vuoro
            if ($worker) audit($conn, $me, 'Keikkahakemus hyväksytty', $worker['name'] . ' (' . $worker['username'] . ')' . (!empty($worker['existing']) ? ', olemassa oleva tunnus' : ', uusi keikkalaistunnus'));
            jsonResponse(["success" => true, "worker" => $worker]);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'my_sessions') {
        $cur = !empty($_SESSION['dev']) ? hash('sha256', (string)$_SESSION['dev']) : '';
        $rs = $conn->query("SELECT id, dev_hash, ip, user_agent, created_at, last_seen, revoked_at FROM user_sessions WHERE user_id = " . $myId . " ORDER BY created_at DESC LIMIT 30");
        $out = [];
        while ($r = $rs->fetch_assoc()) {
            $out[] = ['id' => (int)$r['id'], 'ip' => $r['ip'], 'user_agent' => $r['user_agent'], 'created_at' => $r['created_at'], 'last_seen' => $r['last_seen'],
                'revoked' => $r['revoked_at'] !== null, 'current' => $cur !== '' && hash_equals($r['dev_hash'], $cur)];
        }
        jsonResponse($out);

    } elseif ($action === 'revoke_session') {
        $id = (int)($data['id'] ?? 0);
        $cur = !empty($_SESSION['dev']) ? hash('sha256', (string)$_SESSION['dev']) : '';
        $st = prepareQuery($conn, "UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND dev_hash <> ?");
        $st->bind_param("iis", $id, $myId, $cur); run($st);
        audit($conn, $me, 'Laite kirjattu ulos', 'session#' . $id);
        jsonResponse(["success" => true]);

    } elseif ($action === 'revoke_other_sessions') {
        revokeUserSessions($conn, $myId, !empty($_SESSION['dev']) ? hash('sha256', (string)$_SESSION['dev']) : '');
        audit($conn, $me, 'Kaikki muut laitteet kirjattu ulos', $me['username']);
        jsonResponse(["success" => true]);

    } elseif ($action === 'totp_disable') {
        $st = prepareQuery($conn, "SELECT password FROM users WHERE id = ? AND totp_enabled = 1");
        $st->bind_param("i", $myId);
        $u = fetchOne($st);
        if (!$u) fail('Kaksivaiheinen tunnistautuminen ei ole käytössä');
        if (rateLimited($conn, 'totp:' . $myId, 8)) fail('Liian monta yritystä. Yritä myöhemmin uudelleen.', 429);
        if (!is_string($data['password'] ?? null) || !password_verify($data['password'], (string)$u['password']) || !verifySecondFactor($conn, $cfg, $myId, (string)($data['code'] ?? ''))) {
            rateHit($conn, 'totp:' . $myId); fail('Salasana tai koodi on väärä');
        }
        $up = prepareQuery($conn, "UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL, totp_last_step = 0 WHERE id = ?");
        $up->bind_param("i", $myId); run($up);
        audit($conn, $me, '2FA poistettu käytöstä', $me['username']);
        jsonResponse(["success" => true]);

    } elseif ($action === 'reset_2fa') {   // kadonnut laite: admin nollaa työntekijän (adminin oma nollaus: bin/admin.php palvelimelta)
        if (!isAdmin($me)) fail('Ei oikeuksia', 403);
        $uid = (int)($data['userId'] ?? 0);
        $st = prepareQuery($conn, "SELECT role FROM users WHERE id = ?");
        $st->bind_param("i", $uid);
        $t = fetchOne($st);
        if (!$t) fail('Ei löydy', 404);
        if ($t['role'] === 'admin') fail('Adminin kaksivaiheisen tunnistautumisen voi nollata vain palvelimelta (bin/admin.php)', 403);
        $up = prepareQuery($conn, "UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL, totp_last_step = 0 WHERE id = ?");
        $up->bind_param("i", $uid); run($up);
        revokeUserSessions($conn, $uid);
        audit($conn, $me, '2FA nollattu', 'user#' . $uid);
        jsonResponse(["success" => true]);

    } elseif ($action === 'notify_open_shift') {
        requirePerm($me, 'shifts.manage');
        $date = validDate($data['date'] ?? null, 'date');
        $start = validTime($data['start'] ?? null, 'start');
        pushToPub($conn, 0, "🟡 Uusi avoin vuoro!", "Tarjolla uusi vuoro ({$date} klo {$start}). Nappaa nopeasti!", $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'add_log') {
        $msg = limitStr($data['message'] ?? '', 2000, 'message');
        if ($msg === '') fail('Tyhjä viesti');
        $img = storeImageUpload('image');
        if ($id) {
            requireRow($conn, 'shift_logs', $id);
            $stmt = prepareQuery($conn, "UPDATE shift_logs SET message = ?, image_path = COALESCE(?, image_path) WHERE id = ?" . (isAdmin($me) ? "" : " AND user_id = ?"));
            if (isAdmin($me)) $stmt->bind_param("ssi", $msg, $img, $id); else $stmt->bind_param("ssii", $msg, $img, $id, $myId);
        } else {
            $stmt = prepareQuery($conn, "INSERT INTO shift_logs (user_id, message, image_path) VALUES (?, ?, ?)");
            $stmt->bind_param("iss", $myId, $msg, $img);
        }
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'add_shop_item') {
        $item = limitStr($data['item_name'] ?? '', 255, 'item_name');
        if ($item === '') fail('Tyhjä nimi');
        $img = storeImageUpload('image');
        $assignee = !empty($data['assigned_to']) ? (int)$data['assigned_to'] : null;
        if ($assignee !== null) requireRow($conn, 'users', $assignee);
        if ($id) {
            requireRow($conn, 'shopping', $id);
            $stmt = prepareQuery($conn, "UPDATE shopping_list SET item_name = ?, assigned_to = ?, image_path = COALESCE(?, image_path) WHERE id = ?");
            $stmt->bind_param("sisi", $item, $assignee, $img, $id);
        } else {
            $stmt = prepareQuery($conn, "INSERT INTO shopping_list (added_by, item_name, assigned_to, image_path) VALUES (?, ?, ?, ?)");
            $stmt->bind_param("isis", $myId, $item, $assignee, $img);
        }
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'shop_status') {   // avoin / työn alla, vastuuhenkilön otto
        $itemId = (int)($data['itemId'] ?? 0);
        requireRow($conn, 'shopping', $itemId);
        $status = ($data['status'] ?? '') === 'in_progress' ? 'in_progress' : 'pending';
        $assignee = $status === 'in_progress' ? $myId : null;
        $stmt = prepareQuery($conn, "UPDATE shopping_list SET status = ?, assigned_to = COALESCE(assigned_to, ?) WHERE id = ?");
        $stmt->bind_param("sii", $status, $assignee, $itemId);
        run($stmt);
        if ($status === 'pending') { $c = prepareQuery($conn, "UPDATE shopping_list SET assigned_to = NULL WHERE id = ?"); $c->bind_param("i", $itemId); run($c); }
        jsonResponse(["success" => true]);

    } elseif ($action === 'complete_shop_item') {
        $itemId = (int)($data['itemId'] ?? 0);
        requireRow($conn, 'shopping', $itemId);
        $stmt = prepareQuery($conn, "UPDATE shopping_list SET status = 'completed' WHERE id = ?");
        $stmt->bind_param("i", $itemId);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'clock_in') {
        $stmt = prepareQuery($conn, "INSERT INTO time_entries (user_id, clock_in) VALUES (?, NOW())");
        $stmt->bind_param("i", $myId);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'clock_out') {
        $stmt = prepareQuery($conn, "UPDATE time_entries SET clock_out = NOW() WHERE user_id = ? AND clock_out IS NULL LIMIT 1");
        $stmt->bind_param("i", $myId);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'availability') {
        $date = validDate($data['date'] ?? null, 'date');
        $status = (string)($data['status'] ?? '');
        if ($status === 'none') {
            $stmt = prepareQuery($conn, "DELETE FROM availability WHERE user_id = ? AND date = ?");
            $stmt->bind_param("is", $myId, $date);
        } else {
            $status = limitStr($status, 50, 'status');
            $stmt = prepareQuery($conn, "INSERT INTO availability (user_id, date, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?");
            $stmt->bind_param("isss", $myId, $date, $status, $status);
        }
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'task') {
        requirePerm($me, 'content.manage');
        $label = limitStr($data['label'] ?? '', 255, 'label');
        if ($label === '') fail('Tyhjä nimi');
        $kind = ($data['kind'] ?? 'normal') === 'cash' ? 'cash' : 'normal';
        if ($kind === 'cash') {   // baarilla on vain yksi kassatilitysrutiini
            $dup = prepareQuery($conn, "SELECT id FROM tasks WHERE kind = 'cash' AND id <> ?"); $dupId = (int)$id; $dup->bind_param("i", $dupId);
            if (fetchOne($dup)) fail('Kassatilitysrutiini on jo olemassa');
        }
        if ($id) {
            requireRow($conn, 'tasks', $id);
            $stmt = prepareQuery($conn, "UPDATE tasks SET label = ?, kind = ? WHERE id = ?");
            $stmt->bind_param("ssi", $label, $kind, $id);
            run($stmt);
            jsonResponse(["success" => true]);
        }
        $order_stmt = prepareQuery($conn, "SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM tasks");
        $next_order = (int)fetchOne($order_stmt)['next_order'];
        $stmt = prepareQuery($conn, "INSERT INTO tasks (label, sort_order, kind) VALUES (?, ?, ?)");
        $stmt->bind_param("sis", $label, $next_order, $kind);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'reorder_tasks') {
        requirePerm($me, 'content.manage');
        foreach ($data as $t) {
            if (!is_array($t)) continue;
            $tid = (int)($t['id'] ?? 0); $so = (int)($t['sort_order'] ?? 0);
            $stmt = prepareQuery($conn, "UPDATE tasks SET sort_order = ? WHERE id = ?");
            $stmt->bind_param("ii", $so, $tid);
            run($stmt);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'toggle_task') {
        $date = validDate($data['date'] ?? null, 'date');
        $taskId = (int)($data['task_id'] ?? 0);
        requireRow($conn, 'tasks', $taskId);
        $tk = fetchOne(prepareQuery($conn, "SELECT kind FROM tasks WHERE id = " . (int)$taskId . ""));
        if ($tk && $tk['kind'] === 'cash') fail('Kassatilitys kirjataan loppusumman syötöllä');
        if (!empty($data['completed'])) {
            $stmt = prepareQuery($conn, "INSERT IGNORE INTO task_completions (date, task_id) VALUES (?, ?)");
        } else {
            $stmt = prepareQuery($conn, "DELETE FROM task_completions WHERE date = ? AND task_id = ?");
        }
        $stmt->bind_param("si", $date, $taskId);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'generate_ical') {
        $token = bin2hex(random_bytes(16));
        $stmt = prepareQuery($conn, "UPDATE users SET ical_token = ? WHERE id = ?");
        $stmt->bind_param("si", $token, $myId);
        run($stmt);
        jsonResponse(["success" => true, "token" => $token]);

    } elseif ($action === 'anonymize_user') {
        requireAdmin($me);
        $uid = (int)($data['userId'] ?? 0);
        requireRow($conn, 'users', $uid);
        if ($uid === $myId) fail('Et voi anonymisoida omaa tunnustasi');
        $chk = prepareQuery($conn, "SELECT role FROM users WHERE id = ?");
        $chk->bind_param("i", $uid);
        $tr = fetchOne($chk);
        if (!$tr) fail('Ei oikeuksia', 403);
        // Työaika- ja vuorotiedot jäävät (kirjanpito, työaikalaki) ilman henkilötietoja; muu henkilödata poistetaan
        $conn->begin_transaction();
        $rnd = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);
        $nm = 'Poistettu käyttäjä'; $un = 'poistettu' . $uid;
        $st = prepareQuery($conn, "UPDATE users SET name = ?, username = ?, password = ?, phone = '', color = NULL, initials = NULL, ical_token = NULL, expiry_jv = NULL, has_hygiene = 0, has_alcohol = 0, anonymized_at = NOW() WHERE id = ?");
        $st->bind_param("sssi", $nm, $un, $rnd, $uid);
        run($st);
        foreach (["DELETE FROM push_subscriptions WHERE user_id = ?", "DELETE FROM private_messages WHERE sender_id = ? OR receiver_id = ?", "DELETE FROM availability WHERE user_id = ?", "UPDATE absences SET description = NULL WHERE user_id = ?", "DELETE FROM availability_rules WHERE user_id = ?", "DELETE FROM kudos WHERE from_user = ? OR to_user = ?", "UPDATE users SET email = NULL, employee_number = NULL WHERE id = ?", "UPDATE shift_logs SET message = '[poistettu]' WHERE user_id = ?"] as $sql) {
            $st = prepareQuery($conn, $sql);
            if (substr_count($sql, '?') === 2) $st->bind_param("ii", $uid, $uid); else $st->bind_param("i", $uid);
            run($st);
        }
        $conn->commit();
        jsonResponse(["success" => true]);

    } elseif ($action === 'week_template') {   // tallenna viikon vuorot pohjaksi
        requirePerm($me, 'shifts.manage');
        $name = limitStr($data['name'] ?? '', 60, 'name');
        if ($name === '') fail('Anna pohjalle nimi');
        $mon = new DateTime(validDate($data['weekStart'] ?? null, 'weekStart'));
        $mon->modify('monday this week');
        $from = $mon->format('Y-m-d'); $to = (clone $mon)->modify('+6 days')->format('Y-m-d');
        $st = prepareQuery($conn, "SELECT userId, date, start, end, role FROM shifts WHERE date BETWEEN ? AND ? ORDER BY date, start");
        $st->bind_param("ss", $from, $to);
        $items = [];
        foreach (fetchAllRows($st) as $r) {
            $dow = (int)(new DateTime($r['date']))->format('N') - 1;
            $items[] = ['dow' => $dow, 'userId' => $r['userId'] === null ? null : (int)$r['userId'], 'start' => substr($r['start'], 0, 5), 'end' => substr($r['end'], 0, 5), 'role' => (string)$r['role']];
        }
        if (!$items) fail('Valitulla viikolla ei ole vuoroja, joista pohjan voisi tehdä');
        if (count($items) > 400) fail('Liian monta vuoroa pohjaksi');
        $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM week_templates"));
        if ((int)$cnt['c'] >= 20) fail('Enintään 20 viikkopohjaa');
        $json = json_encode($items, JSON_UNESCAPED_UNICODE);
        $ins = prepareQuery($conn, "INSERT INTO week_templates (name, data) VALUES (?, ?)");
        $ins->bind_param("ss", $name, $json); run($ins);
        jsonResponse(["success" => true, "shifts" => count($items)]);

    } elseif ($action === 'apply_week_template') {   // syötä pohja valittuun viikkoon
        requirePerm($me, 'shifts.manage');
        $tid = (int)($data['id'] ?? 0);
        requireRow($conn, 'week_templates', $tid);
        $tp = fetchOne(prepareQuery($conn, "SELECT data FROM week_templates WHERE id = " . $tid . ""));
        $items = json_decode((string)$tp['data'], true) ?: [];
        $mon = new DateTime(validDate($data['weekStart'] ?? null, 'weekStart')); $mon->modify('monday this week');
        $status = ($data['status'] ?? 'published') === 'draft' ? 'draft' : 'published';
        $asOpen = ($data['mode'] ?? '') === 'open';   // kaikki avoimiksi vuoroiksi
        $valid = [];   // baarin voimassa olevat käyttäjät
        foreach (fetchAllRows(prepareQuery($conn, "SELECT id FROM users WHERE anonymized_at IS NULL")) as $u) $valid[(int)$u['id']] = true;
        $exists = prepareQuery($conn, "SELECT 1 FROM shifts WHERE date = ? AND start = ? AND end = ? AND ((userId IS NULL AND ? IS NULL) OR userId = ?) LIMIT 1");
        $ins = prepareQuery($conn, "INSERT INTO shifts (userId, date, start, end, role, status) VALUES (?, ?, ?, ?, ?, ?)");
        $created = 0; $skipped = 0; $opened = 0;
        $conn->begin_transaction();
        foreach ($items as $it) {
            $date = (clone $mon)->modify('+' . (int)$it['dow'] . ' days')->format('Y-m-d');
            $start = validTime($it['start'], 'start') ; $end = validTime($it['end'], 'end');
            $uid = (!$asOpen && $it['userId'] !== null && isset($valid[(int)$it['userId']])) ? (int)$it['userId'] : null;
            if (!$asOpen && $it['userId'] !== null && $uid === null) $opened++;   // työntekijä poistunut: vuoro avoimeksi
            $role = mb_substr((string)$it['role'], 0, 100);
            $exists->bind_param("sssii", $date, $start, $end, $uid, $uid); $exists->execute();
            if ($exists->get_result()->fetch_row()) { $skipped++; continue; }
            $ins->bind_param("isssss", $uid, $date, $start, $end, $role, $status); run($ins); $created++;
        }
        $conn->commit();
        jsonResponse(["success" => true, "created" => $created, "skipped" => $skipped, "opened" => $opened]);

    } elseif ($action === 'clear_shifts') {   // tyhjennä vuorot päivältä/viikolta/ajanjaksolta
        requirePerm($me, 'shifts.manage');
        $from = validDate($data['from'] ?? null, 'from'); $to = validDate($data['to'] ?? null, 'to');
        if ($to < $from) fail('Loppupäivä on ennen alkupäivää');
        if ((strtotime($to) - strtotime($from)) / 86400 > 92) fail('Enintään 93 päivää kerralla');
        $onlyDrafts = !empty($data['only_drafts']);
        $uid = ($data['userId'] ?? '') === '' || $data['userId'] === null ? null : (int)$data['userId'];
        if ($uid !== null && $uid > 0) requireRow($conn, 'users', $uid);
        $sql = "DELETE FROM shifts WHERE date BETWEEN ? AND ?" . ($onlyDrafts ? " AND status = 'draft'" : "");
        if ($uid !== null) $sql .= $uid === 0 ? " AND userId IS NULL" : " AND userId = " . $uid;   // 0 = vain avoimet vuorot
        $st = prepareQuery($conn, $sql);
        $st->bind_param("ss", $from, $to); run($st);
        $n = $st->affected_rows;
        audit($conn, $me, 'Vuorot tyhjennetty', "$from – $to", "$n vuoroa" . ($onlyDrafts ? ' (vain luonnokset)' : '') . ($uid ? ", käyttäjä #$uid" : ($uid === 0 ? ', avoimet' : '')));
        jsonResponse(["success" => true, "deleted" => $n]);

    } elseif ($action === 'cash_report') {
        requirePerm($me, 'cash.submit');
        $date = validDate($data['date'] ?? null, 'date');
        $today = date('Y-m-d');
        if ($date > $today) fail('Tulevalle päivälle ei voi kirjata kassatilitystä');
        if (!can($me, 'sales.view') && $date < date('Y-m-d', strtotime('-3 days'))) fail('Yli 3 päivän takaisen tilityksen korjaa ylläpitäjä', 403);
        $sales = cashMoney($data['sales_total'] ?? null, 'loppusumma', true);
        $card = cashMoney($data['card_total'] ?? null, 'korttimaksujen summa');
        $counted = cashMoney($data['counted_cash'] ?? null, 'laskettu käteinen');
        $float = cashMoney($data['float_amount'] ?? null, 'kassapohja');
        $expenses = cashMoney($data['expenses'] ?? null, 'kassasta maksetut'); $tips = cashMoney($data['tips'] ?? null, 'tipit');
        $note = limitStr($data['note'] ?? '', 500, 'note');
        if ($card !== null && $card > $sales) fail('Korttimaksut eivät voi ylittää myyntiä');
        $old = fetchOne(prepareQuery($conn, "SELECT photo_path, user_id FROM cash_reports WHERE date = '" . $date . "'"));
        $photo = $old['photo_path'] ?? null; $dropOld = null;
        $recorder = ($old && can($me, 'sales.view') && (int)$old['user_id'] !== $myId) ? ($old['user_id'] === null ? null : (int)$old['user_id']) : $myId;   // adminin korjaus ei vaihda kirjaajaa
        $corrected = $old && (int)$old['user_id'] !== $myId;
        if (isset($_FILES['photo']) && $_FILES['photo']['error'] !== UPLOAD_ERR_NO_FILE) { [$np] = storeDocumentUpload('photo', true); $dropOld = $photo; $photo = $np; }
        elseif (!empty($data['remove_photo']) && $data['remove_photo'] !== '0') { $dropOld = $photo; $photo = null; }
        $st = prepareQuery($conn, "INSERT INTO cash_reports (date, sales_total, card_total, counted_cash, float_amount, note, user_id, photo_path, expenses, tips) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE sales_total = VALUES(sales_total), card_total = VALUES(card_total), counted_cash = VALUES(counted_cash), float_amount = VALUES(float_amount), note = VALUES(note), user_id = VALUES(user_id), photo_path = VALUES(photo_path), expenses = VALUES(expenses), tips = VALUES(tips), updated_at = NOW()");
        $st->bind_param("sddddsisdd", $date, $sales, $card, $counted, $float, $note, $recorder, $photo, $expenses, $tips);
        run($st);
        if ($dropOld && preg_match('#^[a-f0-9]{16}/[a-f0-9]{32}\.(jpg|png|webp)$#', $dropOld)) @unlink(__DIR__ . '/uploads/docs/' . $dropOld);
        $st = prepareQuery($conn, "INSERT INTO daily_sales (date, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)");
        $st->bind_param("sd", $date, $sales); run($st);
        $tk = fetchOne(prepareQuery($conn, "SELECT id FROM tasks WHERE kind = 'cash' LIMIT 1"));
        if ($tk) { $tid = (int)$tk['id']; $st = prepareQuery($conn, "INSERT IGNORE INTO task_completions (date, task_id) VALUES (?, ?)"); $st->bind_param("si", $date, $tid); run($st); }
        $view = cashView(['sales_total' => $sales, 'card_total' => $card, 'counted_cash' => $counted, 'float_amount' => $float, 'expenses' => $expenses, 'tips' => $tips]);
        audit($conn, $me, $corrected ? 'Kassatilityksen korjaus' : 'Kassatilitys', $date, 'myynti ' . number_format($sales, 2, ',', '') . ($view['difference'] !== null ? ', ero ' . number_format($view['difference'], 2, ',', '') : ''));
        jsonResponse(["success" => true, "difference" => $view['difference'], "expected_cash" => $view['expected_cash'], "has_photo" => $photo !== null]);

    } elseif ($action === 'daily_sales') {
        requirePerm($me, 'sales.view');
        $date = validDate($data['date'] ?? null, 'date');
        if (($data['amount'] ?? '') === '' || $data['amount'] === null) {
            $st = prepareQuery($conn, "DELETE FROM daily_sales WHERE date = ?"); $st->bind_param("s", $date);
        } else {
            if (!is_numeric($data['amount']) || $data['amount'] < 0 || $data['amount'] > 10000000) fail('Virheellinen summa');
            $amt = (float)$data['amount'];
            $st = prepareQuery($conn, "INSERT INTO daily_sales (date, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)");
            $st->bind_param("sd", $date, $amt);
        }
        run($st);
        jsonResponse(["success" => true]);

    // ---- Perehdytyslistat ----
    } elseif ($action === 'checklist') {
        requirePerm($me, 'content.manage');
        $name = limitStr($data['name'] ?? '', 100, 'name'); if ($name === '') fail('Anna listalle nimi');
        $items = []; foreach ((array)($data['items'] ?? []) as $it) { $it = trim((string)$it); if ($it !== '') $items[] = mb_substr($it, 0, 200); }
        if (!$items || count($items) > 60) fail('Lisää 1–60 kohtaa');
        $json = json_encode($items, JSON_UNESCAPED_UNICODE);
        if ($id) { requireRow($conn, 'checklists', $id); $st = prepareQuery($conn, "UPDATE checklists SET name = ?, items = ? WHERE id = ?"); $st->bind_param("ssi", $name, $json, $id); }
        else {
            $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM checklists")); if ((int)$cnt['c'] >= 30) fail('Enintään 30 listaa');
            $st = prepareQuery($conn, "INSERT INTO checklists (name, items) VALUES (?, ?)"); $st->bind_param("ss", $name, $json);
        }
        run($st); jsonResponse(["success" => true]);

    } elseif ($action === 'assign_checklist') {
        requirePerm($me, 'content.manage');
        $cid = (int)($data['checklistId'] ?? 0); $uid = (int)($data['userId'] ?? 0);
        requireRow($conn, 'checklists', $cid); requireRow($conn, 'users', $uid);
        $st = prepareQuery($conn, "INSERT IGNORE INTO checklist_progress (checklist_id, user_id, done) VALUES (?, ?, '[]')");
        $st->bind_param("ii", $cid, $uid); run($st);
        if ($st->affected_rows > 0) sendPushToUser($conn, $uid, "Uusi perehdytyslista", "Sinulle on annettu tehtävälista. Katso Tiimi-sivu.", $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'checklist_toggle') {   // työntekijä omaansa, admin kenen tahansa
        $pid = (int)($data['progressId'] ?? 0); $idx = (int)($data['index'] ?? -1);
        $st = prepareQuery($conn, "SELECT p.id, p.user_id, p.done, c.items FROM checklist_progress p JOIN checklists c ON c.id = p.checklist_id WHERE p.id = ?");
        $st->bind_param("i", $pid); $row = fetchOne($st);
        if (!$row || ((int)$row['user_id'] !== $myId && !isAdmin($me))) fail('Ei oikeuksia', 403);
        $items = json_decode($row['items'], true) ?: []; if ($idx < 0 || $idx >= count($items)) fail('Virheellinen kohta');
        $done = array_map('intval', json_decode($row['done'], true) ?: []);
        $done = in_array($idx, $done, true) ? array_values(array_diff($done, [$idx])) : array_merge($done, [$idx]);
        $all = count(array_unique($done)) >= count($items); $json = json_encode(array_values(array_unique($done)));
        $up = prepareQuery($conn, "UPDATE checklist_progress SET done = ?, completed_at = " . ($all ? "NOW()" : "NULL") . " WHERE id = ?");
        $up->bind_param("si", $json, $pid); run($up);
        if ($all && (int)$row['user_id'] === $myId) pushToPub($conn, $myId, "Perehdytys valmis", $me['name'] . " on suorittanut tehtävälistan loppuun.", $vapid_auth, true);
        jsonResponse(["success" => true, "completed" => $all]);

    // ---- Dokumentit ----
    } elseif ($action === 'document') {
        requirePerm($me, 'content.manage');
        $title = limitStr($data['title'] ?? '', 150, 'title'); if ($title === '') fail('Anna dokumentille otsikko');
        $desc = limitStr($data['description'] ?? '', 500, 'description'); $desc = $desc === '' ? null : $desc;
        $ack = !empty($data['requires_ack']) && !in_array((string)$data['requires_ack'], ['0', 'false'], true) ? 1 : 0;
        if ($id) {
            requireRow($conn, 'documents', $id);
            $st = prepareQuery($conn, "UPDATE documents SET title = ?, description = ?, requires_ack = ? WHERE id = ?"); $st->bind_param("ssii", $title, $desc, $ack, $id); run($st);
        } else {
            $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM documents")); if ((int)$cnt['c'] >= 100) fail('Enintään 100 dokumenttia');
            [$path, $mime, $size] = storeDocumentUpload('file');
            $st = prepareQuery($conn, "INSERT INTO documents (title, description, file_path, mime, size, requires_ack) VALUES (?, ?, ?, ?, ?, ?)");
            $st->bind_param("ssssii", $title, $desc, $path, $mime, $size, $ack); run($st);
            if ($ack) pushToPub($conn, $myId, "Uusi dokumentti kuitattavana", $title, $vapid_auth);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'ack_document') {
        $did = (int)($data['id'] ?? 0); requireRow($conn, 'documents', $did);
        $st = prepareQuery($conn, "INSERT IGNORE INTO document_acks (document_id, user_id) VALUES (?, ?)"); $st->bind_param("ii", $did, $myId); run($st);
        jsonResponse(["success" => true]);

    // ---- Kiitokset ----
    } elseif ($action === 'kudos') {
        $to = (int)($data['to_user_id'] ?? 0); requireRow($conn, 'users', $to);
        if ($to === $myId) fail('Et voi kiittää itseäsi');
        $msg = limitStr($data['message'] ?? '', 300, 'message'); if (mb_strlen($msg) < 2) fail('Kirjoita kiitos');
        if (rateLimited($conn, 'kudos:' . $myId, 20)) fail('Liian monta kiitosta lyhyessä ajassa', 429);
        rateHit($conn, 'kudos:' . $myId);
        $st = prepareQuery($conn, "INSERT INTO kudos (from_user, to_user, message) VALUES (?, ?, ?)"); $st->bind_param("iis", $myId, $to, $msg); run($st);
        sendPushToUser($conn, $to, "Sait kiitoksen! 🎉", $me['name'] . ": " . $msg, $vapid_auth);
        jsonResponse(["success" => true]);

    // ---- Nimettömät kyselyt ----
    } elseif ($action === 'survey') {
        requirePerm($me, 'content.manage');
        $q = limitStr($data['question'] ?? '', 300, 'question'); if ($q === '') fail('Kirjoita kysymys');
        $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM surveys WHERE status = 'open'")); if ((int)$cnt['c'] >= 5) fail('Enintään 5 avointa kyselyä');
        $st = prepareQuery($conn, "INSERT INTO surveys (question) VALUES (?)"); $st->bind_param("s", $q); run($st);
        pushToPub($conn, $myId, "Uusi kysely", $q, $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'close_survey') {
        requirePerm($me, 'content.manage'); $sid = (int)($data['id'] ?? 0); requireRow($conn, 'surveys', $sid);
        $st = prepareQuery($conn, "UPDATE surveys SET status = ? WHERE id = ?"); $stat = !empty($data['reopen']) ? 'open' : 'closed'; $st->bind_param("si", $stat, $sid); run($st);
        jsonResponse(["success" => true]);

    } elseif ($action === 'survey_answer') {
        $sid = (int)($data['surveyId'] ?? 0); requireRow($conn, 'surveys', $sid);
        $sv = fetchOne(prepareQuery($conn, "SELECT status FROM surveys WHERE id = " . $sid . ""));
        if (!$sv || $sv['status'] !== 'open') fail('Kysely on suljettu', 409);
        $rating = ($data['rating'] ?? '') === '' ? null : (int)$data['rating']; if ($rating !== null && ($rating < 1 || $rating > 5)) fail('Arvosana 1–5');
        $comment = limitStr($data['comment'] ?? '', 500, 'comment'); $comment = $comment === '' ? null : $comment;
        if ($rating === null && $comment === null) fail('Anna arvosana tai kommentti');
        $conn->begin_transaction();
        $d = prepareQuery($conn, "INSERT IGNORE INTO survey_done (survey_id, user_id) VALUES (?, ?)"); $d->bind_param("ii", $sid, $myId); run($d);
        if ($d->affected_rows < 1) { $conn->rollback(); fail('Olet jo vastannut', 409); }
        $a = prepareQuery($conn, "INSERT INTO survey_answers (survey_id, rating, comment) VALUES (?, ?, ?)"); $a->bind_param("iis", $sid, $rating, $comment); run($a);   // ei käyttäjätunnusta
        $conn->commit();
        jsonResponse(["success" => true]);

    } elseif ($action === 'booking_status') {
        requirePerm($me, 'events.manage');
        $bid = (int)($data['id'] ?? 0);
        $bk = fetchOne(prepareQuery($conn, "SELECT id, name, email, party_size, starts_at, status FROM bookings WHERE id = " . $bid . ""));
        if (!$bk) fail('Varausta ei löydy', 404);
        $to = (string)($data['status'] ?? ''); if (!in_array($to, ['confirmed', 'declined', 'cancelled', 'seated', 'no_show'], true)) fail('Virheellinen tila');
        $st = prepareQuery($conn, "UPDATE bookings SET status = ? WHERE id = ?"); $st->bind_param("si", $to, $bid); run($st);
        if ($bk['email'] && in_array($to, ['confirmed', 'declined', 'cancelled'], true) && $bk['status'] !== $to) {
            $pn = getPub($conn)['name']; $when = date('j.n.Y \k\l\o H:i', strtotime($bk['starts_at']));
            $txt = ['confirmed' => "pöytävarauksesi on vahvistettu.", 'declined' => "valitettavasti emme pysty vahvistamaan varaustasi. Voit yrittää toista aikaa.", 'cancelled' => "varauksesi on peruttu."][$to];
            bsEnqueueMail($conn, $bk['email'], "[$pn] Pöytävarauksesi: " . ['confirmed' => 'vahvistettu', 'declined' => 'ei vahvistettavissa', 'cancelled' => 'peruttu'][$to], "Hei {$bk['name']},\n\n$txt\n\nAika: $when\nHenkilöitä: {$bk['party_size']}\n");
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'booking_create') {   // puhelinvaraus tai ovelta: admin kirjaa itse (ohittaa kapasiteettitarkistuksen)
        requirePerm($me, 'events.manage');
        $pub = getPub($conn); $name = limitStr($data['name'] ?? '', 100, 'name'); if ($name === '') fail('Anna nimi');
        $party = (int)($data['party'] ?? 0); if ($party < 1 || $party > 100) fail('Henkilömäärä 1–100');
        $starts = validDate($data['date'] ?? null, 'date') . ' ' . substr(validTime($data['time'] ?? null, 'time'), 0, 5) . ':00';
        $phone = limitStr($data['phone'] ?? '', 30, 'phone'); $note = limitStr($data['note'] ?? '', 300, 'note'); $ph = $phone === '' ? null : $phone; $nt = $note === '' ? null : $note;
        $code = strtoupper(bin2hex(random_bytes(4))); $dur = $pub['booking']['duration_minutes'];
        $st = prepareQuery($conn, "INSERT INTO bookings (name, phone, party_size, starts_at, duration_min, note, status, code) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)");
        $st->bind_param("ssisiss", $name, $ph, $party, $starts, $dur, $nt, $code); run($st);
        jsonResponse(["success" => true]);

    } elseif ($action === 'reg_update') {   // saapunut-merkintä tai ilmoittautumisen peruutus (admin)
        requirePerm($me, 'events.manage');
        $rid = (int)($data['id'] ?? 0);
        $r = fetchOne(prepareQuery($conn, "SELECT r.id FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.id = " . $rid . ""));
        if (!$r) fail('Ilmoittautumista ei löydy', 404);
        if (isset($data['arrived'])) { $a = !empty($data['arrived']) ? 1 : 0; $st = prepareQuery($conn, "UPDATE event_registrations SET arrived = ? WHERE id = ?"); $st->bind_param("ii", $a, $rid); run($st); }
        if (($data['status'] ?? '') === 'cancelled') { $st = prepareQuery($conn, "UPDATE event_registrations SET status = 'cancelled' WHERE id = ?"); $st->bind_param("i", $rid); run($st); $eq = fetchOne(prepareQuery($conn, "SELECT event_id FROM event_registrations WHERE id = " . (int)$rid)); if ($eq) bsWaitlistPromote($conn, $cfg, (int)$eq['event_id']); }
        jsonResponse(["success" => true]);

    } elseif ($action === 'staffing_rule') {
        requirePerm($me, 'shifts.manage');
        $dow = ($data['dow'] ?? '') === '' || $data['dow'] === null ? null : (int)$data['dow'];
        if ($dow !== null && ($dow < 0 || $dow > 6)) fail('Virheellinen viikonpäivä');
        $start = validTime($data['start'] ?? null, 'start'); $end = validTime($data['end'] ?? null, 'end');
        $role = limitStr($data['role'] ?? '', 50, 'role'); $role = $role === '' ? null : $role;
        $min = (int)($data['min_staff'] ?? 1); if ($min < 1 || $min > 50) fail('Vähimmäismiehitys 1–50');
        $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM staffing_rules"));
        if (!$id && (int)$cnt['c'] >= 60) fail('Enintään 60 miehityssääntöä');
        if ($id) {
            requireRow($conn, 'staffing_rules', $id);
            $st = prepareQuery($conn, "UPDATE staffing_rules SET dow = ?, start = ?, end = ?, role = ?, min_staff = ? WHERE id = ?");
            $st->bind_param("isssii", $dow, $start, $end, $role, $min, $id);
        } else {
            $st = prepareQuery($conn, "INSERT INTO staffing_rules (dow, start, end, role, min_staff) VALUES (?, ?, ?, ?, ?)");
            $st->bind_param("isssi", $dow, $start, $end, $role, $min);
        }
        run($st);
        jsonResponse(["success" => true]);

    } elseif ($action === 'suggest_schedule') {
        requirePerm($me, 'shifts.manage');
        $from = validDate($data['from'] ?? null, 'from'); $to = validDate($data['to'] ?? null, 'to');
        if ($to < $from || (strtotime($to) - strtotime($from)) / 86400 > 20) fail('Ehdotus enintään 21 päivälle');
        $pubS = getPub($conn); jsonResponse(["success" => true] + suggestSchedule($conn, $pubS, $from, $to, $pubS['features']['autoschedule']));

    } elseif ($action === 'auto_schedule') {   // luo viikon luonnos miehityssäännöistä (valinnainen ominaisuus)
        requirePerm($me, 'shifts.manage');
        $pubS = getPub($conn); if (!$pubS['features']['autoschedule']) fail('Automaattinen suunnittelu ei ole käytössä', 409);
        $ws = new DateTime(validDate($data['week_start'] ?? null, 'week_start')); $ws->modify('monday this week'); $from = $ws->format('Y-m-d'); $to = (clone $ws)->modify('+6 days')->format('Y-m-d');
        $res = suggestSchedule($conn, $pubS, $from, $to, true);
        $conn->begin_transaction(); $made = 0;
        foreach ($res['proposals'] as $p) {
            $dup = prepareQuery($conn, "SELECT id FROM shifts WHERE userId = ? AND date = ? AND start = ?"); $uidp = (int)$p['userId']; $stp = $p['start'] . ':00'; $dup->bind_param("iss", $uidp, $p['date'], $stp);
            if (fetchOne($dup)) continue;
            $ins = prepareQuery($conn, "INSERT INTO shifts (userId, date, start, end, role, status) VALUES (?, ?, ?, ?, ?, 'draft')"); $enp = $p['end'] . ':00';
            $ins->bind_param("issss", $uidp, $p['date'], $stp, $enp, $p['role']); run($ins); $made++;
        }
        $conn->commit();
        audit($conn, $me, 'Viikon luonnos luotu automaattisesti', $from, "$made vuoroa, " . count($res['unfilled']) . ' täyttämättä');
        jsonResponse(["success" => true, "created" => $made, "unfilled" => $res['unfilled'], "from" => $from, "to" => $to]);

    } elseif ($action === 'availability_rule') {   // toistuva estepäivä (työntekijä omansa, admin kenen tahansa)
        $uid = isAdmin($me) && !empty($data['userId']) ? (int)$data['userId'] : $myId;
        if ($uid !== $myId) requireRow($conn, 'users', $uid);
        $dow = (int)($data['dow'] ?? -1); if ($dow < 0 || $dow > 6) fail('Virheellinen viikonpäivä');
        $vf = !empty($data['valid_from']) ? validDate($data['valid_from'], 'valid_from') : null;
        $vt = !empty($data['valid_to']) ? validDate($data['valid_to'], 'valid_to') : null;
        if ($vf && $vt && $vt < $vf) fail('Loppupäivä on ennen alkupäivää');
        $note = limitStr($data['note'] ?? '', 100, 'note'); $note = $note === '' ? null : $note;
        $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM availability_rules WHERE user_id = " . $uid));
        if ((int)$cnt['c'] >= 30) fail('Enintään 30 sääntöä');
        $st = prepareQuery($conn, "INSERT INTO availability_rules (user_id, dow, valid_from, valid_to, note) VALUES (?, ?, ?, ?, ?)");
        $st->bind_param("iisss", $uid, $dow, $vf, $vt, $note); run($st);
        jsonResponse(["success" => true]);

    } elseif ($action === 'check_shift') {
        requirePerm($me, 'shifts.manage');
        $uId = nullableUserId($data['userId'] ?? null);
        if ($uId === null) jsonResponse(["success" => true, "warnings" => []]);
        requireRow($conn, 'users', $uId);
        $warn = shiftWarnings($conn, getPub($conn), $uId, validDate($data['date'] ?? null, 'date'), validTime($data['start'] ?? null, 'start'), validTime($data['end'] ?? null, 'end'), (int)($data['id'] ?? 0), limitStr($data['role'] ?? '', 100, 'role'));
        jsonResponse(["success" => true, "warnings" => $warn]);

    } elseif ($action === 'publish_shifts') {
        requirePerm($me, 'shifts.manage');
        $from = validDate($data['from'] ?? null, 'from'); $to = validDate($data['to'] ?? null, 'to');
        $aff = prepareQuery($conn, "SELECT DISTINCT userId FROM shifts WHERE status = 'draft' AND date BETWEEN ? AND ?");
        $aff->bind_param("ss", $from, $to);
        $userIds = array_filter(array_column(fetchAllRows($aff), 'userId'));
        $stmt = prepareQuery($conn, "UPDATE shifts SET status = 'published' WHERE status = 'draft' AND date BETWEEN ? AND ?");
        $stmt->bind_param("ss", $from, $to);
        run($stmt);
        $n = $stmt->affected_rows;
        if ($n > 0) pushToPub($conn, $myId, "Uusia vuoroja julkaistu", "Vuorolistaa on päivitetty ($from–$to). Tarkista vuorosi.", $vapid_auth);
        jsonResponse(["success" => true, "published" => $n]);

    } elseif ($action === 'shift_template') {
        requirePerm($me, 'shifts.manage');
        $name = limitStr($data['name'] ?? '', 60, 'name');
        if ($name === '') fail('Anna pohjalle nimi');
        $start = validTime($data['start'] ?? null, 'start'); $end = validTime($data['end'] ?? null, 'end');
        $role = limitStr($data['role'] ?? '', 50, 'role');
        $cnt = fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM shift_templates"));
        if (!$id && (int)$cnt['c'] >= 30) fail('Enintään 30 vuoropohjaa');
        if ($id) {
            requireRow($conn, 'shift_templates', $id);
            $stmt = prepareQuery($conn, "UPDATE shift_templates SET name = ?, start = ?, end = ?, role = ? WHERE id = ?");
            $stmt->bind_param("ssssi", $name, $start, $end, $role, $id);
        } else {
            $stmt = prepareQuery($conn, "INSERT INTO shift_templates (name, start, end, role) VALUES (?, ?, ?, ?)");
            $stmt->bind_param("ssss", $name, $start, $end, $role);
        }
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'bulk_shifts') {
        requirePerm($me, 'shifts.manage');
        $stmt = prepareQuery($conn, "INSERT INTO shifts (userId, date, start, end, role, status) VALUES (?, ?, ?, ?, ?, ?)");
        $conn->begin_transaction();
        foreach ($data as $s) {
            if (!is_array($s)) continue;
            $uId = nullableUserId($s['userId'] ?? null);
            if ($uId !== null) requireRow($conn, 'users', $uId);
            $date = validDate($s['date'] ?? null, 'date');
            $start = validTime($s['start'] ?? null, 'start');
            $end = validTime($s['end'] ?? null, 'end');
            $role = limitStr($s['role'] ?? '', 100, 'role');
            $status = ($s['status'] ?? 'published') === 'draft' ? 'draft' : 'published';
            $stmt->bind_param("isssss", $uId, $date, $start, $end, $role, $status);
            run($stmt);
        }
        $conn->commit();
        jsonResponse(["success" => true]);

    } elseif ($action === 'update_profile') {
        $phone = limitStr($data['phone'] ?? '', 30, 'phone');
        $email = limitStr($data['email'] ?? '', 150, 'email');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Sähköpostiosoite on virheellinen');
        $emailDb = $email === '' ? null : $email;
        $notifyEmail = !empty($data['notify_email']) ? 1 : 0;
        $notifyGigs = !empty($data['notify_gigs']) ? 1 : 0;
        $stmt = prepareQuery($conn, "UPDATE users SET phone = ?, email = ?, notify_email = ?, notify_gigs = ? WHERE id = ?");
        $stmt->bind_param("ssiii", $phone, $emailDb, $notifyEmail, $notifyGigs, $myId);
        run($stmt);
        if (!empty($data['new_password'])) {
            $hashed = password_hash(validPassword($data['new_password']), PASSWORD_DEFAULT);
            $stmt2 = prepareQuery($conn, "UPDATE users SET password = ? WHERE id = ?");
            $stmt2->bind_param("si", $hashed, $myId); run($stmt2);
            revokeUserSessions($conn, $myId, !empty($_SESSION['dev']) ? hash('sha256', (string)$_SESSION['dev']) : '');
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'notice') {
        requirePerm($me, 'content.manage');
        $message = limitStr($data['message'] ?? '', 2000, 'message');
        if ($message === '') fail('Tyhjä viesti');
        if ($id) {
            requireRow($conn, 'notices', $id);
            $stmt = prepareQuery($conn, "UPDATE notices SET message = ? WHERE id = ?");
            $stmt->bind_param("si", $message, $id);
            run($stmt);
            jsonResponse(["success" => true]);
        }
        $stmt = prepareQuery($conn, "INSERT INTO notices (message) VALUES (?)");
        $stmt->bind_param("s", $message);
        run($stmt);
        pushToPub($conn, 0, "Uusi ilmoitus!", $message, $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'reset_password') {
        if (!isAdmin($me)) fail('Ei oikeuksia', 403);
        $target = (int)($data['userId'] ?? 0);
        requireRow($conn, 'users', $target);
        $hashed_password = password_hash(validPassword($data['new_password'] ?? ''), PASSWORD_DEFAULT);
        $stmt = prepareQuery($conn, "UPDATE users SET password = ? WHERE id = ?");
        $stmt->bind_param("si", $hashed_password, $target);
        run($stmt);
        revokeUserSessions($conn, $target);
        jsonResponse(["success" => true]);

    } elseif ($action === 'event_guest') {   // vieraslistan nimi: kuka tahansa baarin työntekijä voi lisätä; muokkaus/poisto oma tai events.manage
        $eid = (int)($data['event_id'] ?? 0); requireRow($conn, 'events', $eid);
        $name = limitStr($data['name'] ?? '', 100, 'name'); if ($name === '') fail('Anna nimi');
        $note = limitStr($data['note'] ?? '', 200, 'note');
        $conn->begin_transaction();
        $ev = fetchOne(prepareQuery($conn, "SELECT guest_capacity FROM events WHERE id = " . $eid . " FOR UPDATE"));   // lukitus: ei ylibuukkausta
        if ($ev['guest_capacity'] === null) { $conn->rollback(); fail('Tapahtumalla ei ole vieraslistaa'); }
        $dupSt = prepareQuery($conn, "SELECT id FROM event_guests WHERE event_id = ? AND LOWER(name) = LOWER(?) AND id <> ?");
        $selfId = (int)$id; $dupSt->bind_param("isi", $eid, $name, $selfId);
        if (fetchOne($dupSt)) { $conn->rollback(); fail('Nimi on jo listalla', 409); }
        if ($id) {
            $own = fetchOne(prepareQuery($conn, "SELECT g.added_by FROM event_guests g JOIN events e ON g.event_id = e.id WHERE g.id = " . (int)$id . " AND g.event_id = " . $eid . ""));
            if (!$own) { $conn->rollback(); fail('Nimeä ei löytynyt', 404); }
            $st = prepareQuery($conn, "UPDATE event_guests SET name = ?, note = ? WHERE id = ?"); $st->bind_param("ssi", $name, $note, $id); run($st);
        } else {
            $n = (int)fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM event_guests g JOIN events e ON g.event_id = e.id WHERE g.event_id = " . $eid . ""))['c'];
            if ($n >= (int)$ev['guest_capacity']) { $conn->rollback(); fail('Vieraslista on täynnä (' . (int)$ev['guest_capacity'] . ' paikkaa)', 409); }
            $st = prepareQuery($conn, "INSERT INTO event_guests (event_id, name, note, added_by) VALUES (?, ?, ?, ?)"); $st->bind_param("issi", $eid, $name, $note, $myId); run($st);
        }
        $conn->commit();
        jsonResponse(["success" => true]);

    } elseif ($action === 'event') {
        requirePerm($me, 'events.manage');
        $title = limitStr($data['title'] ?? '', 200, 'title');
        if ($title === '') fail('Otsikko puuttuu');
        $date = validDate($data['date'] ?? null, 'date');
        $timeStart = validTime($data['time_start'] ?? '00:00', 'time_start');
        $timeEnd = validTime($data['time_end'] ?? null, 'time_end', true);
        $image_path = null;

        if ($id) {
            requireRow($conn, 'events', $id);
            $ex = prepareQuery($conn, "SELECT image_path FROM events WHERE id = ?");
            $ex->bind_param("i", $id);
            $existing = fetchOne($ex);
            $image_path = $existing['image_path'] ?? null;
        }

        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $f = $_FILES['image'];
            if ($f['size'] > 5 * 1024 * 1024) fail('Kuva on liian suuri (max 5 MB)');
            $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
            if (!isset($allowed[$mime]) || @getimagesize($f['tmp_name']) === false) fail('Sallitut kuvamuodot: JPG, PNG, WEBP, GIF');

            // Polku muodostetaan palvelimella: ei käyttäjän syöttämiä osia
            $pubDir = uploadsSubdir();
            $uploadDir = __DIR__ . "/uploads/{$pubDir}/" . date('Y-m') . '/';
            if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) fail('Tallennus epäonnistui', 500);
            $fileName = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
            if (move_uploaded_file($f['tmp_name'], $uploadDir . $fileName)) {
                chmod($uploadDir . $fileName, 0644);
                $image_path = "uploads/{$pubDir}/" . date('Y-m') . "/{$fileName}";
            } else {
                fail('Tallennus epäonnistui', 500);
            }
        }

        $evType = in_array($data['type'] ?? '', ['music', 'sports', 'quiz', 'theme', 'other'], true) ? $data['type'] : null;
        $evDesc = limitStr($data['description'] ?? '', 600, 'description');
        $evDesc = $evDesc === '' ? null : $evDesc;
        // Lomakkeelta (multipart) tulee merkkijonoja: '1' / 'true' = julkinen
        $evPublic = !empty($data['is_public']) && !in_array((string)$data['is_public'], ['0', 'false'], true) ? 1 : 0;

        if ($id) {
            $stmt = prepareQuery($conn, "UPDATE events SET title = ?, date = ?, time_start = ?, time_end = ?, time = ?, image_path = ?, type = COALESCE(?, type), description = ?, is_public = ? WHERE id = ?");
            $stmt->bind_param("ssssssssii", $title, $date, $timeStart, $timeEnd, $timeStart, $image_path, $evType, $evDesc, $evPublic, $id);
        } else {
            $insType = $evType ?? 'music';
            $stmt = prepareQuery($conn, "INSERT INTO events (title, date, time_start, time_end, time, type, image_path, description, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("ssssssssi", $title, $date, $timeStart, $timeEnd, $timeStart, $insType, $image_path, $evDesc, $evPublic);
        }
        run($stmt);
        $evId = $id ?: (int)$conn->insert_id;
        if (array_key_exists('guest_capacity', $data)) {   // sisäinen vieraslista (henkilökunta lisää nimiä); tyhjä = ei käytössä
            $gc = ($data['guest_capacity'] ?? '') === '' ? null : (int)$data['guest_capacity']; if ($gc !== null && ($gc < 1 || $gc > 2000)) fail('Vieraslistan paikkamäärä 1–2000');
            $gs = prepareQuery($conn, "UPDATE events SET guest_capacity = ? WHERE id = ?"); $gs->bind_param("ii", $gc, $evId); run($gs);
        }
        if (getPub($conn)['features']['tickets']) {   // ilmoittautuminen/liput vain, jos baari on ottanut ominaisuuden käyttöön
            $reg = in_array($data['registration'] ?? 'none', ['none', 'rsvp', 'tickets'], true) ? $data['registration'] : 'none';
            $cap = ($data['capacity'] ?? '') === '' ? null : (int)$data['capacity']; if ($cap !== null && ($cap < 1 || $cap > 100000)) fail('Paikkamäärä 1–100000');
            $price = ($data['ticket_price'] ?? '') === '' ? null : (float)$data['ticket_price']; if ($price !== null && ($price < 0 || $price > 100000)) fail('Virheellinen hinta');
            $url = limitStr($data['ticket_url'] ?? '', 255, 'ticket_url');
            if ($url !== '' && (!filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https')) fail('Lippulinkin on alettava https://');
            $urlDb = $url === '' ? null : $url;
            $ru = prepareQuery($conn, "UPDATE events SET registration = ?, capacity = ?, ticket_price = ?, ticket_url = ? WHERE id = ?");
            $ru->bind_param("sidsi", $reg, $cap, $price, $urlDb, $evId); run($ru);
            try { bsWaitlistPromote($conn, $cfg, $evId); } catch (\Throwable $e) { error_log('BarShift odotuslista: ' . $e->getMessage()); }
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'confirm_hours') {   // työntekijä vahvistaa (tai kiistää) oman kuukautensa tunnit
        $month = (string)($data['month'] ?? '');
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('Virheellinen kuukausi');
        $cur = date('Y-m');
        if ($month > $cur || ($month === $cur && (int)date('j') < 25)) fail('Kuukauden tunnit voi vahvistaa kuun 25. päivän jälkeen');
        $note = limitStr($data['note'] ?? '', 500, 'note'); $dispute = !empty($data['dispute']) && !in_array((string)$data['dispute'], ['0', 'false'], true);
        if ($dispute && $note === '') fail('Kerro kiistämisen syy huomautuskenttään');
        $exq = prepareQuery($conn, "SELECT status FROM hour_confirmations WHERE user_id = ? AND month = ?"); $exq->bind_param("is", $myId, $month); $ex = fetchOne($exq);
        if ($ex && $ex['status'] === 'approved') fail('Tunnit on jo hyväksytty. Pyydä ylläpitäjää avaamaan ne tarvittaessa.', 409);
        $hours = 0.0; foreach (computePayroll($conn, getPub($conn), $month) as $r) if ($r['id'] === $myId) $hours = (float)$r['hours'];
        $status = $dispute ? 'disputed' : 'confirmed';
        $st = prepareQuery($conn, "INSERT INTO hour_confirmations (user_id, month, hours, status, note, confirmed_at) VALUES (?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE hours = VALUES(hours), status = VALUES(status), note = VALUES(note), confirmed_at = NOW(), decided_by = NULL, decided_at = NULL, admin_note = ''");
        $st->bind_param("isdss", $myId, $month, $hours, $status, $note); run($st);
        if ($dispute) pushToPub($conn, $myId, "Tunnit kiistetty", $me['name'] . " kiisti kuukauden " . $month . " tunnit.", $vapid_auth);
        jsonResponse(["success" => true, "status" => $status, "hours" => $hours]);

    } elseif ($action === 'decide_hours') {   // ylläpito hyväksyy tai palauttaa korjattavaksi
        requirePerm($me, 'payroll.view');
        $uid = (int)($data['user_id'] ?? 0); requireRow($conn, 'users', $uid);
        $month = (string)($data['month'] ?? ''); if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('Virheellinen kuukausi');
        $dec = ($data['decision'] ?? '') === 'returned' ? 'returned' : (($data['decision'] ?? '') === 'approved' ? 'approved' : fail('Virheellinen päätös'));
        $note = limitStr($data['note'] ?? '', 300, 'note');
        $hours = 0.0; foreach (computePayroll($conn, getPub($conn), $month) as $r) if ($r['id'] === $uid) $hours = (float)$r['hours'];
        if ($dec === 'returned') {
            $st = prepareQuery($conn, "UPDATE hour_confirmations SET status = 'returned', decided_by = ?, decided_at = NOW(), admin_note = ? WHERE user_id = ? AND month = ?");
            $st->bind_param("isis", $myId, $note, $uid, $month); run($st);
            if ($st->affected_rows < 1) fail('Ei vahvistusta palautettavaksi', 404);
            sendPushToUser($conn, $uid, "Tunnit palautettu korjattavaksi", "Kuukauden $month tunnit: " . ($note ?: 'tarkista ja vahvista uudelleen'), $vapid_auth);
        } else {
            $st = prepareQuery($conn, "INSERT INTO hour_confirmations (user_id, month, hours, status, decided_by, decided_at, admin_note) VALUES (?, ?, ?, 'approved', ?, NOW(), ?)
                ON DUPLICATE KEY UPDATE hours = VALUES(hours), status = 'approved', decided_by = VALUES(decided_by), decided_at = NOW(), admin_note = VALUES(admin_note)");
            $st->bind_param("isdis", $uid, $month, $hours, $myId, $note); run($st);
        }
        audit($conn, $me, $dec === 'approved' ? 'Tunnit hyväksytty' : 'Tunnit palautettu', "user#$uid $month", $note === '' ? null : $note);
        jsonResponse(["success" => true]);

    } elseif ($action === 'shift_bid') {   // vuorohaku (kun baari on ottanut sen käyttöön): hae avointa vuoroa tai peru hakemus
        if (!getPub($conn)['features']['bidding']) fail('Vuorohaku ei ole käytössä', 409);
        $sid = (int)($data['shift_id'] ?? 0); requireRow($conn, 'shifts', $sid);
        if (!empty($data['withdraw'])) { $st = prepareQuery($conn, "DELETE FROM shift_bids WHERE shift_id = ? AND user_id = ?"); $st->bind_param("ii", $sid, $myId); run($st); jsonResponse(["success" => true]); }
        $shq = prepareQuery($conn, "SELECT date, start, end, role FROM shifts WHERE id = ? AND userId IS NULL AND status = 'published' AND date >= CURDATE()"); $shq->bind_param("i", $sid); $sh = fetchOne($shq);
        if (!$sh) fail('Vuoro ei ole enää haettavana', 409);
        $note = limitStr($data['note'] ?? '', 200, 'note');
        $st = prepareQuery($conn, "INSERT INTO shift_bids (shift_id, user_id, note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE note = VALUES(note)"); $st->bind_param("iis", $sid, $myId, $note); run($st);
        if ($st->affected_rows === 1) pushToPub($conn, $myId, "Uusi vuorohakemus", $me['name'] . " hakee vuoroa " . date('j.n.', strtotime($sh['date'])) . " " . substr($sh['start'], 0, 5) . "–" . substr($sh['end'], 0, 5), $vapid_auth, true);
        jsonResponse(["success" => true]);

    } elseif ($action === 'shift_assign') {   // ylläpito valitsee vuoron saajan (hakijoista tai kenet tahansa)
        requirePerm($me, 'shifts.manage');
        $sid = (int)($data['shift_id'] ?? 0); $uid = (int)($data['user_id'] ?? 0);
        requireRow($conn, 'shifts', $sid); requireRow($conn, 'users', $uid);
        $conn->begin_transaction();
        $st = prepareQuery($conn, "UPDATE shifts SET userId = ? WHERE id = ? AND userId IS NULL"); $st->bind_param("ii", $uid, $sid); run($st);
        if ($st->affected_rows < 1) { $conn->rollback(); fail('Vuorolla on jo tekijä', 409); }
        $others = array_map('intval', array_column(fetchAllRows(prepareQuery($conn, "SELECT user_id FROM shift_bids WHERE shift_id = " . $sid)), 'user_id'));
        $conn->query("DELETE FROM shift_bids WHERE shift_id = " . $sid);
        $conn->commit();
        $sh = fetchOne(prepareQuery($conn, "SELECT date, start, end FROM shifts WHERE id = " . $sid));
        $when = date('j.n.', strtotime($sh['date'])) . " " . substr($sh['start'], 0, 5) . "–" . substr($sh['end'], 0, 5);
        sendPushToUser($conn, $uid, "Sait vuoron", "Sinut valittiin vuoroon $when.", $vapid_auth);
        foreach ($others as $o) if ($o !== $uid) sendPushToUser($conn, $o, "Vuoro meni toiselle", "Hakemasi vuoro $when täytettiin.", $vapid_auth);
        audit($conn, $me, 'Vuoro annettu hakijalle', 'shift#' . $sid, "user#$uid");
        jsonResponse(["success" => true]);

    } elseif ($action === 'guest') {   // vieraskortiston vieras: lisää/muokkaa
        requirePerm($me, 'events.manage'); requireGuestsFeature($conn);
        $name = limitStr($data['name'] ?? '', 100, 'name'); if ($name === '') fail('Anna nimi');
        $email = limitStr($data['email'] ?? '', 150, 'email'); if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Sähköpostiosoite on virheellinen'); $emailDb = $email === '' ? null : strtolower($email);
        $phone = limitStr($data['phone'] ?? '', 30, 'phone'); $phoneDb = $phone === '' ? null : $phone;
        $vip = !empty($data['vip']) && !in_array((string)$data['vip'], ['0', 'false'], true) ? 1 : 0;
        $all = limitStr($data['allergies'] ?? '', 200, 'allergies'); $notes = limitStr($data['notes'] ?? '', 600, 'notes'); $tags = limitStr($data['tags'] ?? '', 200, 'tags');
        if ($emailDb !== null) { $dq = prepareQuery($conn, "SELECT id FROM guests WHERE email = ? AND id <> ?"); $self = (int)$id; $dq->bind_param("si", $emailDb, $self); if (fetchOne($dq)) fail('Tällä sähköpostilla on jo vieras kortistossa', 409); }
        if ($id) {
            requireRow($conn, 'guests', $id);
            $st = prepareQuery($conn, "UPDATE guests SET name = ?, email = ?, phone = ?, vip = ?, allergies = ?, notes = ?, tags = ? WHERE id = ?"); $st->bind_param("sssisssi", $name, $emailDb, $phoneDb, $vip, $all, $notes, $tags, $id); run($st); $gid = $id;
        } else {
            if ((int)fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM guests"))['c'] >= 5000) fail('Enintään 5000 vierasta');
            $st = prepareQuery($conn, "INSERT INTO guests (name, email, phone, vip, allergies, notes, tags) VALUES (?, ?, ?, ?, ?, ?, ?)"); $st->bind_param("sssisss", $name, $emailDb, $phoneDb, $vip, $all, $notes, $tags); run($st); $gid = (int)$conn->insert_id;
        }
        jsonResponse(["success" => true, "id" => $gid]);

    } elseif ($action === 'guest_from_booking') {   // lisää varauksen tekijä kortistoon (tai palauta olemassa oleva)
        requirePerm($me, 'events.manage'); requireGuestsFeature($conn);
        $bid = (int)($data['booking_id'] ?? 0); requireRow($conn, 'bookings', $bid);
        $b = fetchOne(prepareQuery($conn, "SELECT name, email, phone FROM bookings WHERE id = " . $bid));
        $email = guestKeyEmail($b['email']);
        if ($email) { $e = fetchOne(prepareQuery($conn, "SELECT id FROM guests WHERE email = '" . $conn->real_escape_string($email) . "'")); if ($e) jsonResponse(["success" => true, "id" => (int)$e['id'], "existing" => true]); }
        $st = prepareQuery($conn, "INSERT INTO guests (name, email, phone) VALUES (?, ?, ?)"); $ph = $b['phone'] ?: null; $st->bind_param("sss", $b['name'], $email, $ph); run($st);
        jsonResponse(["success" => true, "id" => (int)$conn->insert_id]);

    } elseif ($action === 'skill') {   // osaaminen (esim. "Ovi", "Anniskelu"); for_role = vuoron rooli, jolle osaaminen vaaditaan
        requirePerm($me, 'shifts.manage');
        $name = limitStr($data['name'] ?? '', 60, 'name'); if ($name === '') fail('Anna osaamiselle nimi');
        $fr = limitStr($data['for_role'] ?? '', 100, 'for_role'); $frDb = $fr === '' ? null : $fr;
        if ($id) { requireRow($conn, 'skills', $id); $st = prepareQuery($conn, "UPDATE skills SET name = ?, for_role = ? WHERE id = ?"); $st->bind_param("ssi", $name, $frDb, $id); run($st); }
        else {
            if ((int)fetchOne(prepareQuery($conn, "SELECT COUNT(*) c FROM skills"))['c'] >= 30) fail('Enintään 30 osaamista');
            $st = prepareQuery($conn, "INSERT INTO skills (name, for_role) VALUES (?, ?)"); $st->bind_param("ss", $name, $frDb); run($st);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'user_skill') {   // merkitse henkilölle osaaminen (has) tai poista se; valid_until = voimassa asti (valinn.)
        requirePerm($me, 'shifts.manage');
        $uid = (int)($data['user_id'] ?? 0); $sid = (int)($data['skill_id'] ?? 0);
        requireRow($conn, 'users', $uid); requireRow($conn, 'skills', $sid);
        if (!empty($data['has']) && !in_array((string)$data['has'], ['0', 'false'], true)) {
            $vu = empty($data['valid_until']) ? null : validDate($data['valid_until'], 'valid_until');
            $st = prepareQuery($conn, "INSERT INTO user_skills (user_id, skill_id, valid_until) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valid_until = VALUES(valid_until)"); $st->bind_param("iis", $uid, $sid, $vu); run($st);
        } else { $st = prepareQuery($conn, "DELETE FROM user_skills WHERE user_id = ? AND skill_id = ?"); $st->bind_param("ii", $uid, $sid); run($st); }
        jsonResponse(["success" => true]);

    } elseif ($action === 'save_finance') {   // myyntitavoitteet ja ALV-kanta (vain ylläpitäjä)
        requireAdmin($me);
        $num = function ($k, $max) use ($data) { $v = $data[$k] ?? ''; if ($v === '' || $v === null) return null; if (!is_numeric($v) || $v < 0 || $v > $max) fail('Virheellinen arvo: ' . $k); return round((float)$v, 2); };
        $tw = $num('sales_target_week', 10000000); $tm = $num('sales_target_month', 100000000); $vat = $num('vat_rate', 100) ?? 25.5;
        $st = prepareQuery($conn, "UPDATE pubs SET sales_target_week = ?, sales_target_month = ?, vat_rate = ?"); $st->bind_param("ddd", $tw, $tm, $vat); run($st);
        audit($conn, $me, 'Myyntitavoitteet päivitetty', null, null);
        jsonResponse(["success" => true]);

    } elseif ($action === 'save_access_roles') {   // baarin käyttöoikeusroolit (vain ylläpitäjä)
        requireAdmin($me);
        $out = []; $seen = [];
        foreach ((array)($data['roles'] ?? []) as $r) {
            if (!is_array($r)) continue;
            $rid = (string)($r['id'] ?? ''); $nm = trim(mb_substr((string)($r['name'] ?? ''), 0, 40));
            if ($rid === '') $rid = 'r' . bin2hex(random_bytes(4));
            if (!preg_match('/^[a-z0-9_]{1,40}$/', $rid) || isset($seen[$rid])) fail('Virheellinen rooli');
            if ($nm === '') fail('Anna jokaiselle roolille nimi');
            $seen[$rid] = 1;
            $perms = array_values(array_intersect(array_map('strval', (array)($r['perms'] ?? [])), array_keys(PERM_CATALOG)));
            $out[] = ['id' => $rid, 'name' => $nm, 'perms' => $perms];
        }
        if (!isset($seen['employee'])) fail('Työntekijä-rooli puuttuu');
        if (count($out) > 12) fail('Enintään 12 roolia');
        $json = json_encode($out, JSON_UNESCAPED_UNICODE);
        $st = prepareQuery($conn, "UPDATE pubs SET access_roles = ?"); $st->bind_param("s", $json); run($st);
        $ids = array_keys($seen);   // poistetun roolin käyttäjät palaavat perus-työntekijäksi
        $st = prepareQuery($conn, "UPDATE users SET access_role = NULL WHERE access_role IS NOT NULL AND access_role NOT IN ('" . implode("','", $ids) . "')"); run($st);
        audit($conn, $me, 'Käyttöoikeusroolit päivitetty', null, count($out) . ' roolia');
        jsonResponse(["success" => true, "access_roles" => $out]);

    } elseif ($action === 'save_pub_settings') {
        requireAdmin($me);
        getPub($conn);
        $name = limitStr($data['name'] ?? '', 120, 'name');
        if ($name === '') fail('Baarin nimi puuttuu');
        $tzName = (string)($data['timezone'] ?? 'Europe/Helsinki');
        if (!in_array($tzName, DateTimeZone::listIdentifiers(), true)) fail('Tuntematon aikavyöhyke');
        $roles = [];
        foreach ((array)($data['roles'] ?? []) as $r) {
            $r = trim((string)$r);
            if ($r === '' || mb_strlen($r) > 40 || in_array($r, $roles, true)) continue;
            $roles[] = $r;
        }
        if (count($roles) > 20) fail('Enintään 20 roolia');
        if (!$roles) $roles = DEFAULT_ROLES;
        $rolesJson = json_encode($roles, JSON_UNESCAPED_UNICODE);
        $rest = is_numeric($data['min_rest_hours'] ?? 11) ? (float)$data['min_rest_hours'] : 11.0;
        if ($rest < 0 || $rest > 24) fail('Lepoajan on oltava 0–24 h');
        $maxW = ($data['max_week_hours'] ?? '') === '' || $data['max_week_hours'] === null ? null : (float)$data['max_week_hours'];
        if ($maxW !== null && ($maxW <= 0 || $maxW > 168)) fail('Viikkotuntien raja on 1–168 h');
        $ev = (int)($data['evening_start'] ?? 18); $ne = (int)($data['night_end'] ?? 6);
        if ($ev < 12 || $ev > 23 || $ne < 0 || $ne > 12) fail('Virheelliset ilta-/yörajat');
        $b = (array)($data['bonuses'] ?? []);
        foreach (['evening', 'night', 'sat', 'sun'] as $k) { if (!isset($b[$k]) || !is_numeric($b[$k]) || $b[$k] < 0 || $b[$k] > 1000) fail('Virheellinen palkkalisä'); }
        $bill = [limitStr($data['billing_name'] ?? '', 120, 'billing_name'), limitStr($data['billing_email'] ?? '', 150, 'billing_email'),
                 limitStr($data['billing_vat'] ?? '', 30, 'billing_vat'), limitStr($data['billing_address'] ?? '', 250, 'billing_address')];
        if ($bill[1] !== '' && !filter_var($bill[1], FILTER_VALIDATE_EMAIL)) fail('Laskutussähköposti on virheellinen');
        foreach ($bill as &$bv) { if ($bv === '') $bv = null; } unset($bv);
        $side = is_numeric($data['side_cost_pct'] ?? 0) ? (float)($data['side_cost_pct'] ?? 0) : 0.0;
        if ($side < 0 || $side > 100) fail('Sivukulujen on oltava 0–100 %');
        $req2fa = !empty($data['require_2fa']) ? 1 : 0;
        if ($req2fa) { $own = fetchOne(prepareQuery($conn, "SELECT totp_enabled FROM users WHERE id = " . $myId)); if (!(int)($own['totp_enabled'] ?? 0)) fail('Ota ensin oma kaksivaiheinen tunnistautumisesi käyttöön (Oma profiili → Turvallisuus)'); }
        $ft = !empty($data['feature_tickets']) ? 1 : 0; $fb = !empty($data['feature_bookings']) ? 1 : 0;
        $bk = (array)($data['booking'] ?? []);
        $bkCap = max(1, min(2000, (int)($bk['capacity'] ?? 30))); $bkMax = max(1, min(30, (int)($bk['max_party'] ?? 8)));
        $bkSlot = (int)($bk['slot_minutes'] ?? 30); if (!in_array($bkSlot, [15, 30, 60], true)) fail('Aikaväli 15, 30 tai 60 min');
        $bkDur = max(30, min(480, (int)($bk['duration_minutes'] ?? 120))); $bkLead = max(0, min(72, (int)($bk['lead_hours'] ?? 2))); $bkDays = max(1, min(365, (int)($bk['days_ahead'] ?? 60)));
        $bkAuto = !empty($bk['auto_confirm']) ? 1 : 0; $bkHours = [];
        foreach ((array)($bk['hours'] ?? []) as $h) {
            if (!is_array($h)) continue; $d = (int)($h['dow'] ?? -1); if ($d < 0 || $d > 6) continue;
            $bkHours[] = ['dow' => $d, 'open' => validTime($h['open'] ?? null, 'open'), 'close' => validTime($h['close'] ?? null, 'close')];
        }
        if (count($bkHours) > 21) fail('Liian monta aukioloaikaa');
        $bkHoursJson = json_encode(array_map(fn($h) => ['dow' => $h['dow'], 'open' => substr($h['open'], 0, 5), 'close' => substr($h['close'], 0, 5)], $bkHours));
        $pc = (array)($data['pay_codes'] ?? []); $codes = [];
        foreach (['base' => 'PERUS', 'evening' => 'ILTA', 'night' => 'YO', 'sat' => 'LA', 'sun' => 'SU'] as $k => $def) {
            $c = trim((string)($pc[$k] ?? $def)); if ($c === '') $c = $def;
            if (!preg_match('/^[A-Za-z0-9ÅÄÖåäö_.\-]{1,20}$/u', $c)) fail('Palkkalaji saa sisältää vain kirjaimia, numeroita ja merkit _ . -');
            $codes[$k] = $c;
        }
        $otw = is_numeric($data['overtime_week_hours'] ?? 40) ? (float)($data['overtime_week_hours'] ?? 40) : 40.0; if ($otw < 10 || $otw > 80) fail('Ylityöraja 10–80 h/viikko');
        $budget = ($data['weekly_budget'] ?? '') === '' || $data['weekly_budget'] === null ? null : (float)$data['weekly_budget']; if ($budget !== null && ($budget < 0 || $budget > 1000000)) fail('Virheellinen budjetti');
        $remind = (int)($data['reminder_hours'] ?? 3); $clockAlert = (int)($data['clock_alert_minutes'] ?? 0);
        if ($remind < 0 || $remind > 48) fail('Muistutus: 0–48 tuntia');
        if ($clockAlert < 0 || $clockAlert > 240) fail('Leimaushälytys: 0–240 minuuttia');
        $ret = (int)($data['retention_months'] ?? 60);
        if ($ret < 24 || $ret > 120) fail('Säilytysajan on oltava 24–120 kuukautta');
        $be = (float)$b['evening']; $bn = (float)$b['night']; $bs = (float)$b['sat']; $bu = (float)$b['sun'];
        $stmt = prepareQuery($conn, "UPDATE pubs SET name = ?, timezone = ?, roles = ?, min_rest_hours = ?, max_week_hours = ?, evening_start = ?, night_end = ?, bonus_evening = ?, bonus_night = ?, bonus_sat = ?, bonus_sun = ?, billing_name = ?, billing_email = ?, billing_vat = ?, billing_address = ?, retention_months = ?, side_cost_pct = ?, reminder_hours = ?, clock_alert_minutes = ?, pay_code_base = ?, pay_code_evening = ?, pay_code_night = ?, pay_code_sat = ?, pay_code_sun = ?, overtime_week_hours = ?, weekly_budget = ?, feature_tickets = ?, feature_bookings = ?, booking_capacity = ?, booking_max_party = ?, booking_slot_minutes = ?, booking_duration_minutes = ?, booking_lead_hours = ?, booking_days_ahead = ?, booking_auto_confirm = ?, booking_hours = ?, require_2fa = ?");
        $stmt->bind_param("sssddiiddddssssidiisssssddiiiiiiiiisi", $name, $tzName, $rolesJson, $rest, $maxW, $ev, $ne, $be, $bn, $bs, $bu, $bill[0], $bill[1], $bill[2], $bill[3], $ret, $side, $remind, $clockAlert, $codes['base'], $codes['evening'], $codes['night'], $codes['sat'], $codes['sun'], $otw, $budget, $ft, $fb, $bkCap, $bkMax, $bkSlot, $bkDur, $bkLead, $bkDays, $bkAuto, $bkHoursJson, $req2fa);
        run($stmt);
        if (is_array($data['features_ext'] ?? null)) {   // valinnaiset ominaisuudet (vuorohaku, automaattinen suunnittelu, muistutukset, maksut, vieraskortisto)
            $fx = $data['features_ext']; $flag = fn($k) => !empty($fx[$k]) && !in_array((string)$fx[$k], ['0', 'false'], true) ? 1 : 0;
            $grh = max(2, min(72, (int)($fx['guest_reminder_hours'] ?? 24)));
            $fe = prepareQuery($conn, "UPDATE pubs SET feature_bidding = ?, feature_autoschedule = ?, feature_reminders = ?, feature_payments = ?, feature_guests = ?, guest_reminder_hours = ?, reminder_sms = ?, feature_hub_events = ?, feature_hub_gigs = ?, feature_hub_feed = ?");
            $f1 = $flag('bidding'); $f2 = $flag('autoschedule'); $f3 = $flag('reminders'); $f4 = $flag('payments'); $f5 = $flag('guests'); $f6 = $flag('reminder_sms');
            $f7 = hubConfigured($cfg) ? $flag('hub_events') : 0; $f8 = hubConfigured($cfg) ? $flag('hub_gigs') : 0; $f9 = hubConfigured($cfg) ? $flag('hub_feed') : 0;
            $fe->bind_param("iiiiiiiiii", $f1, $f2, $f3, $f4, $f5, $grh, $f6, $f7, $f8, $f9); run($fe);
        }
        jsonResponse(["success" => true, "pub" => getPub($conn, true)]);

    } elseif ($action === 'save_pub_profile') {
        requireAdmin($me);
        $dn = limitStr($data['display_name'] ?? '', 120, 'display_name');
        $desc = limitStr($data['description'] ?? '', 500, 'description');
        $addr = limitStr($data['address'] ?? '', 200, 'address');
        $city = limitStr($data['city'] ?? '', 80, 'city');
        $web = limitStr($data['website'] ?? '', 200, 'website');
        if ($web !== '' && (!filter_var($web, FILTER_VALIDATE_URL) || !in_array(parse_url($web, PHP_URL_SCHEME), ['http', 'https'], true))) fail('Verkkosivun osoitteen on alettava http:// tai https://');
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($data['color'] ?? '')) ? $data['color'] : null;
        $lat = ($data['lat'] ?? '') === '' || $data['lat'] === null ? null : (float)$data['lat'];
        $lng = ($data['lng'] ?? '') === '' || $data['lng'] === null ? null : (float)$data['lng'];
        if (($lat === null) !== ($lng === null)) fail('Anna sekä leveys- että pituusaste, tai jätä molemmat tyhjiksi');
        if ($lat !== null && ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180)) fail('Virheelliset koordinaatit');
        $isPublic = !empty($data['is_public']) ? 1 : 0;
        if ($isPublic && $dn === '') fail('Anna baarille julkinen nimi ennen julkaisua');
        // Sijainti osoitteesta, kun asiakas pyytää (osoite muuttunut tai koordinaatit puuttuvat)
        $warning = null;
        if (!empty($data['geocode'])) {
            $lat = $lng = null;
            if ($addr !== '') {
                $_SESSION['geo_n'] = ($_SESSION['geo_n'] ?? 0) + 1;
                if ($_SESSION['geo_n'] > 40) fail('Liian monta sijaintihakua tässä istunnossa. Yritä myöhemmin uudelleen.', 429);
                $g = geocodeAddress($cfg, $addr . ($city !== '' ? ', ' . $city : ''));
                if ($g) { $lat = $g['lat']; $lng = $g['lng']; }
                else $warning = 'Osoitetta ei löytynyt kartalta, joten baari ei näy kartalla. Tarkista osoite ja kaupunki tai aseta sijainti käsin.';
            }
        }
        $dn = $dn === '' ? null : $dn; $desc = $desc === '' ? null : $desc; $addr = $addr === '' ? null : $addr; $city = $city === '' ? null : $city; $web = $web === '' ? null : $web;
        $stmt = prepareQuery($conn, "INSERT INTO pub_profiles (id, display_name, description, address, city, lat, lng, website, color, is_public) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description), address = VALUES(address), city = VALUES(city), lat = VALUES(lat), lng = VALUES(lng), website = VALUES(website), color = VALUES(color), is_public = VALUES(is_public)");
        $stmt->bind_param("ssssddssi", $dn, $desc, $addr, $city, $lat, $lng, $web, $color, $isPublic);
        run($stmt);
        jsonResponse(["success" => true, "lat" => $lat, "lng" => $lng, "warning" => $warning]);

    } elseif ($action === 'geocode_address') {
        requireAdmin($me);
        $addr = limitStr($data['address'] ?? '', 200, 'address');
        $city = limitStr($data['city'] ?? '', 80, 'city');
        if ($addr === '') fail('Kirjoita osoite ensin');
        $_SESSION['geo_n'] = ($_SESSION['geo_n'] ?? 0) + 1;
        if ($_SESSION['geo_n'] > 40) fail('Liian monta sijaintihakua tässä istunnossa. Yritä myöhemmin uudelleen.', 429);
        $g = geocodeAddress($cfg, $addr . ($city !== '' ? ', ' . $city : ''));
        if (!$g) {
            $why = geocodeLastError();
            if ($why !== '' && !str_contains($why, 'ei_tulosta') && !str_contains($why, 'ei tulosta')) fail('Sijaintipalvelu ei vastannut (' . $why . '). Palvelimen ulospäin suuntautuvat yhteydet voivat olla estettyssä; voit myös syöttää koordinaatit käsin.', 502);
            fail('Osoitetta ei löytynyt kartalta. Tarkista kirjoitusasu ja kaupunki.', 404);
        }
        jsonResponse(["success" => true, "lat" => $g['lat'], "lng" => $g['lng'], "label" => $g['label']]);

    } elseif ($action === 'create_trade') {
        requirePerm($me, 'trades.use');
        $shiftId = (int)($data['shiftId'] ?? 0);
        requireRow($conn, 'shifts', $shiftId);
        $own = prepareQuery($conn, "SELECT id FROM shifts WHERE id = ? AND userId = ?");
        $own->bind_param("ii", $shiftId, $myId);
        if (!fetchOne($own)) fail('Voit tarjota vain omia vuorojasi', 403);
        $target = !empty($data['targetUserId']) ? (int)$data['targetUserId'] : null;
        if ($target !== null) { requireRow($conn, 'users', $target); if ($target === $myId) fail('Et voi tarjota vuoroa itsellesi'); }
        $stmt = prepareQuery($conn, "INSERT INTO shift_trades (offered_shift_id, offered_by_id, target_user_id) VALUES (?, ?, ?)");
        $stmt->bind_param("iii", $shiftId, $myId, $target);
        run($stmt);
        if ($target !== null) sendPushToUser($conn, $target, "Sinulle tarjotaan vuoroa", $me['name'] . " tarjoaa sinulle vuoroa. Katso etusivu.", $vapid_auth);
        else pushToPub($conn, $myId, "Uusi vuoro tarjolla!", "Työkaverisi laittoi juuri vuoron jakoon.", $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'request_trade') {
        requirePerm($me, 'trades.use');
        $tradeId = (int)($data['tradeId'] ?? 0);
        requireRow($conn, 'trades', $tradeId);
        $swap = (int)($data['swapShiftId'] ?? 0) ?: null;   // vastavuoroinen vaihto: pyytäjä tarjoaa oman vuoronsa tilalle
        if ($swap !== null) {
            $sq = prepareQuery($conn, "SELECT s.id FROM shifts s WHERE s.id = ? AND s.userId = ? AND s.status = 'published' AND s.date >= CURDATE() AND s.id <> (SELECT offered_shift_id FROM shift_trades WHERE id = ?)");
            $sq->bind_param("iii", $swap, $myId, $tradeId);
            if (!fetchOne($sq)) fail('Vaihtovuoron on oltava oma, tuleva, julkaistu vuorosi', 409);
        }
        $stmt = prepareQuery($conn, "UPDATE shift_trades SET requested_by_id = ?, status = 'pending', swap_shift_id = ? WHERE id = ? AND offered_by_id != ? AND status = 'open' AND (target_user_id IS NULL OR target_user_id = ?)");
        $stmt->bind_param("iiiii", $myId, $swap, $tradeId, $myId, $myId);
        run($stmt);
        if ($stmt->affected_rows < 1) fail('Vuoroa ei voi pyytää', 409);
        $t = prepareQuery($conn, "SELECT offered_by_id FROM shift_trades WHERE id = ?");
        $t->bind_param("i", $tradeId);
        if ($row = fetchOne($t)) sendPushToUser($conn, $row['offered_by_id'], "Vuoronvaihtopyyntö!", ($swap !== null ? $me['name'] . " ehdottaa vaihtoa: hän ottaa vuorosi ja antaa oman vuoronsa tilalle. Katso etusivu." : "Joku haluaa ottaa tarjoamasi vuoron. Hyväksy se sivuilla."), $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'handle_trade') {
        $tradeId = (int)($data['tradeId'] ?? 0);
        requireRow($conn, 'trades', $tradeId);
        $t = prepareQuery($conn, "SELECT offered_shift_id, offered_by_id, requested_by_id, swap_shift_id, status FROM shift_trades WHERE id = ?");
        $t->bind_param("i", $tradeId);
        $tr = fetchOne($t);
        if (!$tr || (!can($me, 'shifts.manage') && (int)$tr['offered_by_id'] !== $myId)) fail('Ei oikeuksia', 403);
        if (($data['decision'] ?? '') === 'accepted') {
            if (!$tr['requested_by_id']) fail('Ei pyytäjää', 409);
            requireRow($conn, 'users', $tr['requested_by_id']);
            $conn->begin_transaction();
            $u1 = prepareQuery($conn, "UPDATE shifts SET original_userId = COALESCE(original_userId, userId), userId = ? WHERE id = ?");
            $u1->bind_param("ii", $tr['requested_by_id'], $tr['offered_shift_id']); run($u1);
            if ($tr['swap_shift_id']) {   // vastavuoroinen vaihto: toinen vuoro siirtyy tarjoajalle
                $u3 = prepareQuery($conn, "UPDATE shifts SET original_userId = COALESCE(original_userId, userId), userId = ? WHERE id = ? AND userId = ?");
                $sw = (int)$tr['swap_shift_id']; $req = (int)$tr['requested_by_id']; $off = (int)$tr['offered_by_id'];
                $u3->bind_param("iii", $off, $sw, $req); run($u3);
                if ($u3->affected_rows < 1) { $conn->rollback(); fail('Vaihtovuoro ei ole enää pyytäjän', 409); }
            }
            $u2 = prepareQuery($conn, "UPDATE shift_trades SET status = 'accepted' WHERE id = ?");
            $u2->bind_param("i", $tradeId); run($u2);
            $conn->commit();
            // ylläpito saa vain tiedon (ei hyväksyntäpyyntöä); ristiriidat mukaan
            $pubT = getPub($conn); $wn = 0;
            foreach ([[(int)$tr['offered_shift_id'], (int)$tr['requested_by_id'], $tr['swap_shift_id'] ? (int)$tr['swap_shift_id'] : 0], [$tr['swap_shift_id'] ? (int)$tr['swap_shift_id'] : 0, (int)$tr['offered_by_id'], (int)$tr['offered_shift_id']]] as [$shId, $toUser, $exId]) {
                if (!$shId) continue; $shq = fetchOne(prepareQuery($conn, "SELECT date, start, end, role FROM shifts WHERE id = " . $shId));
                if ($shq) $wn += count(shiftWarnings($conn, $pubT, $toUser, $shq['date'], $shq['start'], $shq['end'], $exId, $shq['role']));
            }
            $names = []; foreach ([(int)$tr['offered_by_id'], (int)$tr['requested_by_id']] as $uid0) { $nr = fetchOne(prepareQuery($conn, "SELECT name FROM users WHERE id = " . $uid0)); $names[] = $nr['name'] ?? '?'; }
            $summary = $names[0] . ($tr['swap_shift_id'] ? ' ⇄ ' : ' → ') . $names[1] . ($wn ? " ($wn huomautusta)" : '');
            audit($conn, $me, $tr['swap_shift_id'] ? 'Vuoronvaihto (vaihto)' : 'Vuoronvaihto (siirto)', 'trade#' . $tradeId, $summary);
            pushToPub($conn, $myId, "Vuoronvaihto toteutui", $summary, $vapid_auth, true);
            sendPushToUser($conn, (int)$tr['requested_by_id'], "Vuoronvaihto hyväksytty", "Vuorosi on vahvistettu kalenteriisi.", $vapid_auth);
        } else {
            $stmt = prepareQuery($conn, "UPDATE shift_trades SET status = 'open', requested_by_id = NULL WHERE id = ?");
            $stmt->bind_param("i", $tradeId);
            run($stmt);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'absence') {
        $type = limitStr($data['type'] ?? '', 50, 'type');
        $startDate = validDate($data['startDate'] ?? null, 'startDate');
        $endDate = validDate($data['endDate'] ?? null, 'endDate');
        $desc = limitStr($data['description'] ?? '', 1000, 'description');
        if ($endDate < $startDate) fail('Päättymispäivä on ennen alkamispäivää');
        // Admin voi merkitä poissaolon (esim. jo pidetyn loman) toiselle työntekijälle: kirjautuu hyväksyttynä
        $forUser = (int)($data['userId'] ?? 0);
        if (!$id && can($me, 'absences.approve') && $forUser && $forUser !== $myId) {
            requireRow($conn, 'users', $forUser);
            $stmt = prepareQuery($conn, "INSERT INTO absences (user_id, type, start_date, end_date, description, status) VALUES (?, ?, ?, ?, ?, 'approved')");
            $stmt->bind_param("issss", $forUser, $type, $startDate, $endDate, $desc);
            run($stmt);
            sendPushToUser($conn, $forUser, "Poissaolo merkitty", "Ylläpitäjä merkitsi sinulle poissaolon.", $vapid_auth);
            jsonResponse(["success" => true]);
        }
        requirePerm($me, 'absences.request');
        if ($id) {
            $own = prepareQuery($conn, "SELECT id FROM absences WHERE id = ? AND user_id = ?");
            $own->bind_param("ii", $id, $myId);
            if (!fetchOne($own)) fail('Ei oikeuksia', 403);
            $stmt = prepareQuery($conn, "UPDATE absences SET type = ?, start_date = ?, end_date = ?, description = ?, status = 'pending' WHERE id = ?");
            $stmt->bind_param("ssssi", $type, $startDate, $endDate, $desc, $id);
        } else {
            $stmt = prepareQuery($conn, "INSERT INTO absences (user_id, type, start_date, end_date, description) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("issss", $myId, $type, $startDate, $endDate, $desc);
        }
        run($stmt);
        pushToPub($conn, $myId, "Uusi poissaolopyyntö!", "Työntekijä ilmoitti poissaolosta.", $vapid_auth, true);
        jsonResponse(["success" => true]);

    } elseif ($action === 'handle_absence') {
        requirePerm($me, 'absences.approve');
        $absId = (int)($data['id'] ?? 0);
        requireRow($conn, 'absences', $absId);
        $status = $data['status'] ?? '';
        if (!in_array($status, ['approved', 'rejected'], true)) fail('Virheellinen tila');
        $stmt = prepareQuery($conn, "UPDATE absences SET status = ? WHERE id = ?");
        $stmt->bind_param("si", $status, $absId);
        run($stmt);

        $a_stmt = prepareQuery($conn, "SELECT user_id, start_date, end_date FROM absences WHERE id = ?");
        $a_stmt->bind_param("i", $absId);
        if ($a = fetchOne($a_stmt)) {
            if (!empty($data['free_shifts'])) {
                $upd = prepareQuery($conn, "UPDATE shifts SET original_userId = COALESCE(original_userId, userId), userId = NULL WHERE userId = ? AND date >= ? AND date <= ?");
                $upd->bind_param("iss", $a['user_id'], $a['start_date'], $a['end_date']);
                run($upd);
                pushToPub($conn, $a['user_id'], "🟡 Uusi avoin vuoro!", "Sairasloman vuoksi uusia vuoroja vapautui jakoon. Nappaa nopeasti!", $vapid_auth);
            } elseif (!empty($data['restore_shifts'])) {
                $upd = prepareQuery($conn, "UPDATE shifts SET userId = original_userId WHERE original_userId = ? AND date >= ? AND date <= ? AND (userId IS NULL OR userId = 0)");
                $upd->bind_param("iss", $a['user_id'], $a['start_date'], $a['end_date']);
                run($upd);
            }
            $msg = $status === 'approved' ? "Poissaolopyyntösi on hyväksytty." : "Poissaolopyyntösi on hylätty.";
            sendPushToUser($conn, $a['user_id'], "Poissaolon tila päivitetty", $msg, $vapid_auth);
        }
        jsonResponse(["success" => true]);

    } elseif ($action === 'send_message') {
        $receiver = (int)($data['receiver_id'] ?? 0);
        $msg = limitStr($data['message'] ?? '', 2000, 'message');
        if ($msg === '' || $receiver === $myId) fail('Virheellinen viesti');
        requireRow($conn, 'users', $receiver);
        $enc = encryptMessage($cfg, $msg);
        $stmt = prepareQuery($conn, "INSERT INTO private_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)");
        $stmt->bind_param("iis", $myId, $receiver, $enc);
        run($stmt);
        sendPushToUser($conn, $receiver, "Uusi viesti", "Sinulle on uusi viesti: " . $me['name'], $vapid_auth);
        jsonResponse(["success" => true]);

    } elseif ($action === 'mark_messages_read') {
        $partner = (int)($data['chat_partner_id'] ?? 0);
        $stmt = prepareQuery($conn, "UPDATE private_messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ?");
        $stmt->bind_param("ii", $myId, $partner);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'time_entry') {
        requirePerm($me, 'shifts.manage');
        $tid = (int)($data['id'] ?? 0);
        requireRow($conn, 'time_entries', $tid);
        $re = '/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/';
        $in = (string)($data['clock_in'] ?? ''); $out = (string)($data['clock_out'] ?? '');
        if (!preg_match($re, $in) || !preg_match($re, $out) || strtotime($out) < strtotime($in)) fail('Virheelliset ajat');
        $stmt = prepareQuery($conn, "UPDATE time_entries SET clock_in = ?, clock_out = ? WHERE id = ?");
        $stmt->bind_param("ssi", $in, $out, $tid);
        run($stmt);
        jsonResponse(["success" => true]);

    } elseif ($action === 'test_push') {   // testi-ilmoitus itselle
        $n = sendPushToUser($conn, $myId, 'Testi-ilmoitus', 'Ilmoitukset toimivat tällä laitteella 🎉', $vapid_auth);
        jsonResponse(["success" => true, "delivered" => $n]);

    } elseif ($action === 'save_subscription') {
        $sub = $data['sub'] ?? null;
        $endpoint = $sub['endpoint'] ?? ''; $p256dh = $sub['keys']['p256dh'] ?? ''; $auth = $sub['keys']['auth'] ?? '';
        // Vain https-osoitteet, jotta palvelinta ei voi ohjata kutsumaan sisäverkon osoitteita (SSRF)
        $host = is_string($endpoint) ? parse_url($endpoint, PHP_URL_HOST) : null;
        if (!is_string($endpoint) || strlen($endpoint) > 1000 || parse_url($endpoint, PHP_URL_SCHEME) !== 'https' || !$host
            || filter_var($host, FILTER_VALIDATE_IP) || $host === 'localhost' || !is_string($p256dh) || !is_string($auth)) {
            fail('Virheellinen tilaus');
        }
        $check = prepareQuery($conn, "SELECT id FROM push_subscriptions WHERE endpoint = ?");
        $check->bind_param("s", $endpoint);
        if (!fetchOne($check)) {
            $stmt = prepareQuery($conn, "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)");
            $stmt->bind_param("isss", $myId, $endpoint, $p256dh, $auth);
            run($stmt);
        }
        jsonResponse(["success" => true]);
    }

    fail('Tuntematon toiminto', 404);
}

// ===================== POISTO =====================
if ($method === 'DELETE') {
    $id = intval($_GET['id'] ?? 0); $type = $_GET['type'] ?? '';
    $tables = ['shift' => ['shifts', 'shifts'], 'user' => ['users', 'users'], 'event' => ['events', 'events'], 'trade' => ['shift_trades', 'trades'],
               'absence' => ['absences', 'absences'], 'notice' => ['notices', 'notices'], 'task' => ['tasks', 'tasks'], 'shopping' => ['shopping_list', 'shopping'],
               'time_entry' => ['time_entries', 'time_entries'], 'shift_log' => ['shift_logs', 'shift_logs'], 'shift_template' => ['shift_templates', 'shift_templates'], 'week_template' => ['week_templates', 'week_templates'], 'staffing_rule' => ['staffing_rules', 'staffing_rules'], 'checklist' => ['checklists', 'checklists'], 'document' => ['documents', 'documents'], 'kudos' => ['kudos', 'kudos'], 'survey' => ['surveys', 'surveys'], 'availability_rule' => ['availability_rules', 'availability_rules'], 'cash_report' => ['cash_reports', 'cash_reports'], 'event_guest' => ['event_guests', 'event_guests'], 'skill' => ['skills', 'skills'], 'guest' => ['guests', 'guests']];
    if (!isset($tables[$type])) fail('Tuntematon tyyppi poistolle');
    [$table, $kind] = $tables[$type];

    {
        requireRow($conn, $kind, $id);
        if ($type === 'shopping') {
            // kuka tahansa baarin jäsen
        } elseif ($type === 'event_guest') {
            // kuka tahansa baarin työntekijä voi poistaa nimen vieraslistalta
        } elseif ($type === 'shift_log' && !isAdmin($me)) {
            $own = prepareQuery($conn, "SELECT id FROM shift_logs WHERE id = ? AND user_id = ?");
            $own->bind_param("ii", $id, $myId);
            if (!fetchOne($own)) fail('Ei oikeuksia', 403);
        } elseif ($type === 'absence' && !can($me, 'absences.approve')) {
            $own = prepareQuery($conn, "SELECT id FROM absences WHERE id = ? AND user_id = ?");
            $own->bind_param("ii", $id, $myId);
            if (!fetchOne($own)) fail('Ei oikeuksia', 403);
        } elseif ($type === 'kudos' && !isAdmin($me)) {
            $own = prepareQuery($conn, "SELECT id FROM kudos WHERE id = ? AND from_user = ?");
            $own->bind_param("ii", $id, $myId);
            if (!fetchOne($own)) fail('Ei oikeuksia', 403);
        } elseif ($type === 'trade' && !isAdmin($me)) {
            $own = prepareQuery($conn, "SELECT id FROM shift_trades WHERE id = ? AND offered_by_id = ?");
            $own->bind_param("ii", $id, $myId);
            if (!fetchOne($own)) fail('Ei oikeuksia', 403);
        } else {
            $delPerm = ['shift' => 'shifts.manage', 'shift_template' => 'shifts.manage', 'week_template' => 'shifts.manage', 'staffing_rule' => 'shifts.manage', 'time_entry' => 'shifts.manage',
                'absence' => 'absences.approve', 'event' => 'events.manage', 'notice' => 'content.manage', 'task' => 'content.manage', 'checklist' => 'content.manage', 'document' => 'content.manage', 'survey' => 'content.manage',
                'cash_report' => 'sales.view', 'skill' => 'shifts.manage', 'guest' => 'events.manage'][$type] ?? null;
            if ($delPerm) requirePerm($me, $delPerm); else requireAdmin($me);
        }
        if ($type === 'user' && $id === $myId) fail('Et voi poistaa omaa tunnustasi', 400);
    }
    if ($type === 'cash_report') {   // poistetaan myös päivän myyntiluku ja rutiinin kuittaus
        $cr = fetchOne(prepareQuery($conn, "SELECT date, photo_path FROM cash_reports WHERE id = " . (int)$id . ""));
        if ($cr) {
            if ($cr['photo_path'] && preg_match('#^[a-f0-9]{16}/[a-f0-9]{32}\.(jpg|png|webp)$#', $cr['photo_path'])) @unlink(__DIR__ . '/uploads/docs/' . $cr['photo_path']);
            $d0 = $cr['date'];
            $st = prepareQuery($conn, "DELETE FROM daily_sales WHERE date = ?"); $st->bind_param("s", $d0); run($st);
            $st = prepareQuery($conn, "DELETE tc FROM task_completions tc JOIN tasks t ON tc.task_id = t.id WHERE tc.date = ? AND t.kind = 'cash'"); $st->bind_param("s", $d0); run($st);
            audit($conn, $me, 'Poisto: kassatilitys', $d0);
        }
    }
    if ($type === 'document') {   // poistetaan myös tiedosto
        $d = fetchOne(prepareQuery($conn, "SELECT file_path FROM documents WHERE id = " . (int)$id . ""));
        if ($d && preg_match('#^[a-f0-9]{16}/[a-f0-9]{32}\.(pdf|jpg|png|webp)$#', $d['file_path'])) @unlink(__DIR__ . '/uploads/docs/' . $d['file_path']);
    }
    if (in_array($type, ['user', 'shift', 'event', 'absence', 'time_entry', 'notice', 'document', 'survey', 'checklist', 'event_guest'], true)) audit($conn, $me, 'Poisto: ' . $type, $type . '#' . $id);
    $stmt = prepareQuery($conn, "DELETE FROM `$table` WHERE id = ?");
    $stmt->bind_param("i", $id);
    run($stmt);
    jsonResponse(["success" => true]);
}

fail('Metodia ei tueta', 405);
