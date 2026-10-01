<?php
// Yhteys BarShift Hub -keskuspalvelimeen (barshift-server). Vain työntö: tämä asennus lähettää keskukseen vain sen, minkä baari on itse
// julkaissut (julkiset tapahtumat, keikkatyönä tarjotut avoimet vuorot) ja hakee omat hakemuksensa. Keskus ei koskaan kutsu tätä asennusta.

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
    $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($res === false) return [0, ['error' => 'Yhteys keskukseen epäonnistui']];
    $j = json_decode((string)$res, true);
    return [$code, is_array($j) ? $j : []];
}

function hubRows($conn, string $sql): array { $r = $conn->query($sql); return $r ? $r->fetch_all(MYSQLI_ASSOC) : []; }
function hubTimeStr(?string $t): ?string { return $t ? substr($t, 0, 5) : null; }

// Synkronoi baarin julkiset tapahtumat ja keikkatyönä tarjotut vuorot. Palauttaa [lähetetyt, virheet].
function hubSync($conn, array $cfg, array $pub): array {
    if (!hubConfigured($cfg)) return [0, 0];
    $slug = $pub['slug']; $sent = 0; $errs = 0;
    $known = [];
    foreach (hubRows($conn, "SELECT kind, local_id, hash FROM hub_sync") as $r) $known[$r['kind']][(int)$r['local_id']] = $r['hash'];
    $push = function (string $kind, int $id, array $payload) use ($conn, $cfg, &$known, &$sent, &$errs) {
        $hash = sha1(json_encode($payload));
        if (($known[$kind][$id] ?? null) === $hash) return;
        $ext = ($kind === 'event' ? 'e' : 's') . $id;
        [$code] = hubRequest($cfg, 'PUT', '/v1/' . ($kind === 'event' ? 'events' : 'shifts') . '/' . $ext, $payload);
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

    // Julkiset tapahtumat (valinnainen)
    $want = [];
    if (!empty($pub['feature_hub_events'])) {
        $st = $conn->prepare("SELECT id, title, date, time_start, time_end, type, description, registration, ticket_price, ticket_url FROM events WHERE pub_name = ? AND is_public = 1 AND date >= CURDATE() ORDER BY date LIMIT 500");
        $st->bind_param("s", $slug); $st->execute();
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
        $st = $conn->prepare("SELECT id, date, start, end, role, hub_pay, hub_gig, userId, status FROM shifts WHERE pub_name = ? AND hub_gig IN (1, 2) AND date >= CURDATE() - INTERVAL 7 DAY ORDER BY date LIMIT 500");
        $st->bind_param("s", $slug); $st->execute();
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
        $chk = $conn->prepare("SELECT id FROM shifts WHERE id = ? AND pub_name = ?"); $sid = (int)$m[1]; $chk->bind_param("is", $sid, $pub['slug']); $chk->execute();
        if (!$chk->get_result()->fetch_assoc()) continue;
        $st = $conn->prepare("INSERT IGNORE INTO hub_applications (hub_id, shift_id, name, skills, city, message, status, email, phone) VALUES (?,?,?,?,?,?,?,?,?)");
        $hid = (int)$a['id']; $nm = mb_substr((string)($a['name'] ?? ''), 0, 120); $sk = mb_substr((string)($a['skills'] ?? ''), 0, 300); $ct = mb_substr((string)($a['city'] ?? ''), 0, 80);
        $msg = isset($a['message']) ? mb_substr((string)$a['message'], 0, 500) : null; $stt = in_array($a['status'] ?? '', ['pending', 'accepted', 'declined'], true) ? $a['status'] : 'pending';
        $em = isset($a['email']) ? mb_substr((string)$a['email'], 0, 190) : null; $ph = isset($a['phone']) ? mb_substr((string)$a['phone'], 0, 40) : null;
        $st->bind_param("iisssssss", $hid, $sid, $nm, $sk, $ct, $msg, $stt, $em, $ph); $st->execute();
        if ($st->affected_rows > 0) { $new++; if (function_exists('pushToPub')) pushToPub($conn, $pub['slug'], 0, 'Uusi keikkahakemus', "$nm hakee keikkavuoroa. Katso Ylläpito → Keikkahakemukset.", $vapid, true); }
    }
    return $new;
}
