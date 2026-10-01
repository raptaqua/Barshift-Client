<?php
// Yhteys BarShift Hub -keskuspalvelimeen (barshift-server). Vain työntö: tämä asennus lähettää keskukseen vain sen, minkä baari on itse
// julkaissut (julkiset tapahtumat, keikkatyönä tarjotut avoimet vuorot) ja hakee omat hakemuksensa. Keskus ei koskaan kutsu tätä asennusta.

// Yhteys liitetään hallintapaneelista (taulu hub_connection); config.php:n 'hub'-lohko toimii edelleen vaihtoehtona.
function hubSeal(array $cfg, string $plain): string {
    $k = base64_decode((string)($cfg['message_key'] ?? ''), true); if ($k === false || strlen($k) !== 32) throw new RuntimeException('message_key puuttuu');
    $iv = random_bytes(12); $ct = openssl_encrypt($plain, 'aes-256-gcm', $k, OPENSSL_RAW_DATA, $iv, $tag);
    return 'v1:' . base64_encode($iv . $tag . $ct);
}
function hubUnseal(array $cfg, string $stored): ?string {
    $k = base64_decode((string)($cfg['message_key'] ?? ''), true); $raw = base64_decode(substr($stored, 3), true);
    if ($k === false || strlen($k) !== 32 || strncmp($stored, 'v1:', 3) !== 0 || $raw === false || strlen($raw) < 29) return null;
    $pt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $k, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $pt === false ? null : $pt;
}
function hubLoadConfig($conn, array &$cfg): void {
    $r = $conn->query("SELECT url, pub_slug, private_key_enc FROM hub_connection WHERE id = 1");
    $row = $r ? $r->fetch_assoc() : null;
    if (!$row) return;
    $key = hubUnseal($cfg, (string)$row['private_key_enc']);
    if ($key !== null) $cfg['hub'] = ['url' => $row['url'], 'pub_slug' => $row['pub_slug'], 'private_key' => $key, 'source' => 'db'];
}
// Hallintapaneelista annettu osoite: https (http vain paikalliseen testaukseen), ei sisäverkon osoitteita
function hubNormalizeUrl(string $url): ?string {
    $url = rtrim(trim($url), '/'); $p = parse_url($url);
    if (!$p || empty($p['host']) || !empty($p['query']) || !empty($p['fragment']) || !empty($p['user'])) return null;
    $scheme = strtolower($p['scheme'] ?? ''); $host = strtolower($p['host']);
    $loop = in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    if ($scheme !== 'https' && !($scheme === 'http' && $loop)) return null;
    if (!$loop) { $ip = filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) ? trim($host, '[]') : gethostbyname($host); if (filter_var($ip, FILTER_VALIDATE_IP) && !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return null; }
    return $url;
}
// Liittäminen: luo oma Ed25519-avainpari, rekisteröi julkinen avain keskuksessa liitoskoodilla. Palauttaa [ok, virhe|tiedot]
function hubPairWithCode(array $cfg, string $url, string $code): array {
    $code = implode('-', str_split(strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code)), 5));
    $kp = sodium_crypto_sign_keypair();
    $ch = curl_init($url . '/v1/pair');
    $raw = json_encode(['code' => $code, 'public_key' => base64_encode(sodium_crypto_sign_publickey($kp))]);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $raw, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_HTTPHEADER => ['Content-Type: application/json']]);
    $res = curl_exec($ch); $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) return [false, 'Yhteys keskukseen epäonnistui (' . ($err ?: 'ei yhteyttä') . '). Tarkista osoite.'];
    $j = json_decode((string)$res, true);
    if ($http !== 200 || !is_array($j) || empty($j['slug'])) return [false, ($http === 404 && is_array($j) && !empty($j['error']) ? $j['error'] : 'Keskus vastasi ' . $http . (is_array($j) && !empty($j['error']) ? ': ' . $j['error'] : ' (tarkista osoite: sen on osoitettava keskuksen asennuspolkuun)'))];
    return [true, ['slug' => (string)$j['slug'], 'name' => (string)($j['name'] ?? ''), 'private_key' => base64_encode(sodium_crypto_sign_secretkey($kp))]];
}

function hubConfigured(array $cfg): bool {
    $h = $cfg['hub'] ?? null;
    return is_array($h) && !empty($h['url']) && !empty($h['pub_slug']) && !empty($h['private_key']);
}

// Allekirjoitettu pyyntö. Palauttaa [http-status, dekoodattu JSON]. Allekirjoitettava: METHOD\nPATH\nTS\nNONCE\nsha256(body)
function hubRequest(array $cfg, string $method, string $path, ?array $body = null): array {
    $h = $cfg['hub']; $raw = $body === null ? '' : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ts = (string)time(); $nonce = bin2hex(random_bytes(12));
    $sk = base64_decode((string)$h['private_key'], true);
    if ($sk === false || strlen($sk) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) return [0, ['error' => 'Virheellinen hub-avain']];
    $sig = base64_encode(sodium_crypto_sign_detached($method . "\n" . $path . "\n" . $ts . "\n" . $nonce . "\n" . hash('sha256', $raw), $sk));
    $ch = curl_init(rtrim((string)$h['url'], '/') . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Pub: ' . $h['pub_slug'], 'X-Timestamp: ' . $ts, 'X-Nonce: ' . $nonce, 'X-Signature: ' . $sig],
    ]);
    if ($raw !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $raw);
    $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) { hubLastError('Yhteys keskukseen epäonnistui (' . $err . '). Tarkista hub.url.'); return [0, ['error' => 'Yhteys keskukseen epäonnistui']]; }
    $j = json_decode((string)$res, true);
    if ($code !== 200) hubLastError('Keskus vastasi ' . $code . ': ' . (is_array($j) ? (string)($j['error'] ?? '') : mb_substr(strip_tags((string)$res), 0, 80)) . ($code === 404 ? ' (tarkista hub.url: osoitteen on osoitettava keskuksen asennuspolkuun)' : ($code === 401 ? ' (tarkista pub_slug ja private_key; avain pitää olla rekisteröity keskukseen)' : '')));
    return [$code, is_array($j) ? $j : []];
}

// Viimeisin epäonnistuneen pyynnön syy (näytetään ylläpitäjälle)
function hubLastError(?string $set = null): string { static $e = ''; if ($set !== null) $e = $set; return $e; }
function hubRows($conn, string $sql): array { $r = $conn->query($sql); return $r ? $r->fetch_all(MYSQLI_ASSOC) : []; }
function hubTimeStr(?string $t): ?string { return $t ? substr($t, 0, 5) : null; }

// Synkronoi baarin julkiset tapahtumat ja keikkatyönä tarjotut vuorot. Palauttaa [lähetetyt, virheet].
function hubSync($conn, array $cfg, array $pub): array {
    if (!hubConfigured($cfg)) return [0, 0];
    $sent = 0; $errs = 0;
    $known = [];
    foreach (hubRows($conn, "SELECT kind, local_id, hash FROM hub_sync") as $r) $known[$r['kind']][(int)$r['local_id']] = $r['hash'];
    $push = function (string $kind, int $id, array $payload) use ($conn, $cfg, &$known, &$sent, &$errs) {
        $hash = sha1(json_encode($payload));
        if (($known[$kind][$id] ?? null) === $hash) return;
        $ext = ($kind === 'event' ? 'e' : 's') . $id;
        [$code] = hubRequest($cfg, 'PUT', $kind === 'profile' ? '/v1/profile' : '/v1/' . ($kind === 'event' ? 'events' : 'shifts') . '/' . $ext, $payload);
        if ($code === 200) {
            $st = $conn->prepare("INSERT INTO hub_sync (kind, local_id, hash) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE hash = VALUES(hash), synced_at = NOW()");
            $st->bind_param("sis", $kind, $id, $hash); $st->execute(); $known[$kind][$id] = $hash; $sent++;
        } else $errs++;
    };
    $drop = function (string $kind, int $id) use ($conn, $cfg, &$known, &$errs) {
        $ext = ($kind === 'event' ? 'e' : 's') . $id;
        [$code] = hubRequest($cfg, 'DELETE', '/v1/' . ($kind === 'event' ? 'events' : 'shifts') . '/' . $ext);
        if ($code === 200 || $code === 404) {
            $st = $conn->prepare("DELETE FROM hub_sync WHERE kind = ? AND local_id = ?"); $st->bind_param("si", $kind, $id); $st->execute(); unset($known[$kind][$id]);
        } else $errs++;
    };

    // Baarin julkinen osoite ja sijainti kartalle (vain jos baarin julkinen profiili on julkaistu)
    if (!empty($pub['feature_hub_events'])) {
        $pq = $conn->prepare("SELECT address, city, lat, lng, website FROM pub_profiles WHERE is_public = 1"); $pq->execute();
        if ($pr = $pq->get_result()->fetch_assoc()) {
            $push('profile', 0, array_filter(['address' => $pr['address'] ?: null, 'city' => $pr['city'] ?: null, 'lat' => $pr['lat'] !== null && $pr['lng'] !== null ? (float)$pr['lat'] : null,
                'lng' => $pr['lat'] !== null && $pr['lng'] !== null ? (float)$pr['lng'] : null, 'website' => ($pr['website'] && preg_match('#^https?://#i', $pr['website'])) ? $pr['website'] : null], fn($v) => $v !== null));
        }
    }

    // Julkiset tapahtumat (valinnainen)
    $want = [];
    if (!empty($pub['feature_hub_events'])) {
        $st = $conn->prepare("SELECT id, title, date, time_start, time_end, type, description, registration, ticket_price, ticket_url FROM events WHERE is_public = 1 AND date >= CURDATE() ORDER BY date LIMIT 500");
        $st->execute();
        foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $e) {
            $want[(int)$e['id']] = true;
            $price = ($e['registration'] ?? 'none') !== 'none' && $e['ticket_price'] !== null ? rtrim(rtrim(number_format((float)$e['ticket_price'], 2, ',', ''), '0'), ',') . ' €' : null;
            $push('event', (int)$e['id'], array_filter([
                'title' => mb_substr((string)$e['title'], 0, 160), 'date' => $e['date'], 'time_start' => hubTimeStr($e['time_start']), 'time_end' => hubTimeStr($e['time_end']),
                'description' => $e['description'] ? mb_substr((string)$e['description'], 0, 1000) : null, 'type' => $e['type'] ?: null, 'price_text' => $price,
                'url' => ($e['ticket_url'] && preg_match('#^https://#i', $e['ticket_url'])) ? $e['ticket_url'] : null,
            ], fn($v) => $v !== null));
        }
    }
    foreach (array_keys($known['event'] ?? []) as $id) if (empty($want[$id])) $drop('event', (int)$id);

    // Keikkatyönä tarjotut vuorot (valinnainen): vain aika, rooli ja palkkateksti
    $wantS = [];
    if (!empty($pub['feature_hub_gigs'])) {
        $st = $conn->prepare("SELECT id, date, start, end, role, hub_pay, hub_gig, userId, status FROM shifts WHERE hub_gig IN (1, 2) AND date >= CURDATE() - INTERVAL 7 DAY ORDER BY date LIMIT 500");
        $st->execute();
        foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $s) {
            $wantS[(int)$s['id']] = true;
            $open = (int)$s['hub_gig'] === 1 && empty($s['userId']) && $s['status'] === 'published';
            $status = $open ? 'open' : ((int)$s['hub_gig'] === 1 && $s['status'] !== 'published' ? 'cancelled' : 'filled');
            $push('shift', (int)$s['id'], array_filter([
                'date' => $s['date'], 'time_start' => hubTimeStr($s['start']), 'time_end' => hubTimeStr($s['end']), 'role' => $s['role'] ?: null,
                'pay_text' => $s['hub_pay'] ?: null, 'status' => $status,
            ], fn($v) => $v !== null));
        }
    }
    foreach (array_keys($known['shift'] ?? []) as $id) if (empty($wantS[$id])) $drop('shift', (int)$id);
    return [$sent, $errs];
}

// Hakee uudet hakemukset keikkavuoroihin. Palauttaa uusien määrän.
function hubPullApplications($conn, array $cfg, array $pub, array $vapid): int {
    if (!hubConfigured($cfg) || empty($pub['feature_hub_gigs'])) return 0;
    $since = (int)(hubRows($conn, "SELECT COALESCE(MAX(hub_id), 0) m FROM hub_applications")[0]['m'] ?? 0);
    [$code, $j] = hubRequest($cfg, 'GET', '/v1/applications?since_id=' . $since);
    if ($code !== 200 || !is_array($j['applications'] ?? null)) return 0;
    $new = 0;
    foreach ($j['applications'] as $a) {
        if (!preg_match('/^s(\d+)$/', (string)($a['shift'] ?? ''), $m)) continue;
        $chk = $conn->prepare("SELECT id FROM shifts WHERE id = ?"); $sid = (int)$m[1]; $chk->bind_param("i", $sid); $chk->execute();
        if (!$chk->get_result()->fetch_assoc()) continue;
        $st = $conn->prepare("INSERT IGNORE INTO hub_applications (hub_id, shift_id, name, skills, city, message, status, email, phone) VALUES (?,?,?,?,?,?,?,?,?)");
        $hid = (int)$a['id']; $nm = mb_substr((string)($a['name'] ?? ''), 0, 120); $sk = mb_substr((string)($a['skills'] ?? ''), 0, 300); $ct = mb_substr((string)($a['city'] ?? ''), 0, 80);
        $msg = isset($a['message']) ? mb_substr((string)$a['message'], 0, 500) : null; $stt = in_array($a['status'] ?? '', ['pending', 'accepted', 'declined'], true) ? $a['status'] : 'pending';
        $em = isset($a['email']) ? mb_substr((string)$a['email'], 0, 190) : null; $ph = isset($a['phone']) ? mb_substr((string)$a['phone'], 0, 40) : null;
        $st->bind_param("iisssssss", $hid, $sid, $nm, $sk, $ct, $msg, $stt, $em, $ph); $st->execute();
        if ($st->affected_rows > 0) { $new++; if (function_exists('pushToPub')) pushToPub($conn, 0, 'Uusi keikkahakemus', "$nm hakee keikkavuoroa. Katso Ylläpito → Keikkahakemukset.", $vapid, true); }
    }
    return $new;
}


// ===================== MUIDEN BAARIEN VAPAAT VUOROT (feed) =====================
// Keskus välittää toisten baarien avoimet vuorot (julkista tietoa). Omat työntekijät saavat ilmoituksen ja voivat hakea vuoroa tästä
// sovelluksesta; hakijan tiedot (nimi, yhteystieto, viesti) lähtevät keskuksen kautta vain vuoron tarjonneelle baarille.
function hubFmtTime(?string $t): string {
    $t = substr((string)$t, 0, 5); if ($t === '') return '';
    return substr($t, 3, 2) === '00' ? (string)(int)substr($t, 0, 2) : (string)(int)substr($t, 0, 2) . ':' . substr($t, 3, 2);
}
function hubFmtShift(array $s): string {
    $d = date('j.n.', strtotime((string)$s['date']));
    $role = trim((string)($s['role'] ?? ''));
    return 'Baarissa ' . $s['bar_name'] . ' haetaan työntekijää' . ($role !== '' ? " ($role)" : '') . " päivälle $d ajalle " . hubFmtTime($s['time_start']) . '–' . hubFmtTime($s['time_end']);
}

// Hakee muiden baarien avoimet vuorot ja ilmoittaa uusista niille, jotka ovat ottaneet ilmoitukset käyttöön. Palauttaa [uusia, ilmoitettuja].
function hubFeedPull($conn, array $cfg, array $pub, array $vapid): array {
    if (!hubConfigured($cfg) || empty($pub['feature_hub_feed'])) return [0, 0];
    [$code, $j] = hubRequest($cfg, 'GET', '/v1/feed');
    if ($code !== 200 || !is_array($j['shifts'] ?? null)) return [0, 0];
    $first = (int)(hubRows($conn, "SELECT COUNT(*) c FROM hub_feed")[0]['c'] ?? 0) === 0;   // ensimmäisellä haulla vanhoista ei ilmoiteta
    $seen = []; $fresh = [];
    foreach ($j['shifts'] as $x) {
        if (!is_array($x) || !isset($x['id']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($x['date'] ?? '')) || empty($x['time_start']) || empty($x['time_end'])) continue;
        $id = (int)$x['id']; $seen[$id] = true;
        $row = ['bar_name' => mb_substr((string)($x['pub'] ?? ''), 0, 120), 'city' => mb_substr((string)($x['city'] ?? ''), 0, 80), 'date' => (string)$x['date'],
                'time_start' => substr((string)$x['time_start'], 0, 8), 'time_end' => substr((string)$x['time_end'], 0, 8), 'role' => isset($x['role']) ? mb_substr((string)$x['role'], 0, 60) : null,
                'pay_text' => isset($x['pay_text']) ? mb_substr((string)$x['pay_text'], 0, 80) : null, 'note' => isset($x['note']) ? mb_substr((string)$x['note'], 0, 300) : null];
        $st = $conn->prepare("INSERT IGNORE INTO hub_feed (hub_shift_id, bar_name, city, date, time_start, time_end, role, pay_text, note) VALUES (?,?,?,?,?,?,?,?,?)");
        $st->bind_param("issssssss", $id, $row['bar_name'], $row['city'], $row['date'], $row['time_start'], $row['time_end'], $row['role'], $row['pay_text'], $row['note']); $st->execute();
        if ($st->affected_rows > 0) { $fresh[] = $row; continue; }
        $up = $conn->prepare("UPDATE hub_feed SET bar_name = ?, city = ?, date = ?, time_start = ?, time_end = ?, role = ?, pay_text = ?, note = ?, gone = 0 WHERE hub_shift_id = ?");
        $up->bind_param("ssssssssi", $row['bar_name'], $row['city'], $row['date'], $row['time_start'], $row['time_end'], $row['role'], $row['pay_text'], $row['note'], $id); $up->execute();
    }
    foreach (hubRows($conn, "SELECT hub_shift_id FROM hub_feed WHERE gone = 0") as $r) if (empty($seen[(int)$r['hub_shift_id']])) $conn->query("UPDATE hub_feed SET gone = 1 WHERE hub_shift_id = " . (int)$r['hub_shift_id']);
    $conn->query("DELETE FROM hub_feed WHERE date < CURDATE() - INTERVAL 7 DAY");
    if ($first || !$fresh) return [count($fresh), 0];

    $users = hubRows($conn, "SELECT id FROM users WHERE notify_gigs = 1 AND anonymized_at IS NULL AND status <> 'frozen'");
    if (!$users || !function_exists('sendPushToUser')) return [count($fresh), 0];
    $msgs = count($fresh) > 3 ? [['Vapaita vuoroja toisissa baareissa', count($fresh) . ' uutta vapaata vuoroa muissa baareissa. Katso Keikat-välilehti ja hae suoraan sovelluksesta.']]
                              : array_map(fn($f) => ['Vapaa vuoro toisessa baarissa', hubFmtShift($f) . '. Hae Keikat-välilehdeltä.'], $fresh);
    $n = 0;
    foreach ($users as $u) foreach ($msgs as [$title, $body]) { sendPushToUser($conn, (int)$u['id'], $title, $body, $vapid); $n++; }
    return [count($fresh), $n];
}

// Päivittää omien työntekijöiden hakemusten tilan ja ilmoittaa päätöksistä. Palauttaa muuttuneiden määrän.
function hubOutgoingPull($conn, array $cfg, array $pub, array $vapid): int {
    if (!hubConfigured($cfg) || empty($pub['feature_hub_feed'])) return 0;
    $local = hubRows($conn, "SELECT id, hub_application_id, user_id, status FROM hub_outgoing");
    if (!$local) return 0;
    [$code, $j] = hubRequest($cfg, 'GET', '/v1/outgoing_applications');
    if ($code !== 200 || !is_array($j['applications'] ?? null)) return 0;
    $byHub = []; foreach ($j['applications'] as $a) $byHub[(int)$a['id']] = $a;
    $changed = 0;
    foreach ($local as $l) {
        $a = $byHub[(int)$l['hub_application_id']] ?? null;
        if ($a === null) { if ($l['status'] === 'pending') { $conn->query("DELETE FROM hub_outgoing WHERE id = " . (int)$l['id']); $changed++; } continue; }   // peruttu tai poistettu keskuksesta
        $stt = in_array($a['status'] ?? '', ['pending', 'accepted', 'declined'], true) ? $a['status'] : 'pending';
        if ($stt === $l['status']) continue;
        $addr = isset($a['address']) ? mb_substr((string)$a['address'], 0, 200) : null;
        $up = $conn->prepare("UPDATE hub_outgoing SET status = ?, address = ?, decided_at = NOW() WHERE id = ?"); $lid = (int)$l['id']; $up->bind_param("ssi", $stt, $addr, $lid); $up->execute();
        $changed++;
        if ($stt === 'pending' || !function_exists('sendPushToUser')) continue;
        $when = date('j.n.', strtotime((string)$a['date'])) . ' ' . hubFmtTime($a['time_start']) . '–' . hubFmtTime($a['time_end']);
        if ($stt === 'accepted') sendPushToUser($conn, (int)$l['user_id'], 'Hakemus toiseen baariin hyväksytty', "Hakemuksesi hyväksyttiin: {$a['pub']}, $when. Baari ottaa sinuun yhteyttä antamillasi yhteystiedoilla.", $vapid);
        else sendPushToUser($conn, (int)$l['user_id'], 'Hakemus toiseen baariin', "Hakemustasi ei tällä kertaa valittu: {$a['pub']}, $when.", $vapid);
    }
    return $changed;
}
