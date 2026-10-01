<?php
// Tekstiviestit Twilion REST-rajapinnalla (valinnainen). config.php:
//   'sms' => ['account_sid' => 'ACxxxxxxxx', 'auth_token' => '…', 'from' => '+358401234567' /* tai Twilion lähettäjänimi */,
//             'default_country_code' => '358', 'monthly_cap' => 300 /* viestiä / baari / kk */, 'api_base' => 'https://api.twilio.com' ],
// Viestejä lähetetään vain baareille, jotka ovat ottaneet muistutukset ja tekstiviestit käyttöön (Hallinta → Baari).

function bsSmsConfigured(array $cfg): bool { $s = $cfg['sms'] ?? []; return !empty($s['account_sid']) && !empty($s['auth_token']) && !empty($s['from']); }

// "040 123 4567" -> "+358401234567"; kansainvälinen +-muoto säilyy. Virheellinen -> null
function bsNormalizePhone(string $raw, string $cc = '358'): ?string {
    $raw = trim($raw); $plus = strpos($raw, '+') === 0 || strpos($raw, '00') === 0;
    $d = preg_replace('/\D+/', '', $raw);
    if (strpos($raw, '00') === 0) $d = substr($d, 2);
    if (!$plus) { if (strpos($d, '0') === 0) $d = $cc . substr($d, 1); else return null; }
    return strlen($d) >= 8 && strlen($d) <= 15 ? '+' . $d : null;
}

// Palauttaa [ok, virhe]. Kuukausikatto estää odottamattomat kulut.
function bsSendSms($conn, array $cfg, string $phone, string $body): array {
    if (!bsSmsConfigured($cfg)) return [false, 'SMS ei ole määritetty'];
    $s = $cfg['sms']; $to = bsNormalizePhone($phone, (string)($s['default_country_code'] ?? '358'));
    if ($to === null) return [false, 'Virheellinen puhelinnumero'];
    $cap = (int)($s['monthly_cap'] ?? 300);
    $q = $conn->prepare("SELECT COUNT(*) c FROM sms_log WHERE ok = 1 AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
    $q->execute(); $n = (int)$q->get_result()->fetch_assoc()['c'];
    if ($n >= $cap) return [false, 'Kuukausikatto täynnä (' . $cap . ')'];
    $url = rtrim((string)($s['api_base'] ?? 'https://api.twilio.com'), '/') . '/2010-04-01/Accounts/' . rawurlencode($s['account_sid']) . '/Messages.json';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_USERPWD => $s['account_sid'] . ':' . $s['auth_token'],
        CURLOPT_POSTFIELDS => http_build_query(['To' => $to, 'From' => $s['from'], 'Body' => mb_substr($body, 0, 320)])]);
    $resp = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    $ok = $resp !== false && $code >= 200 && $code < 300;
    $msg = $ok ? null : mb_substr($err ?: ('HTTP ' . $code . ' ' . (string)$resp), 0, 190);
    $ins = $conn->prepare("INSERT INTO sms_log (to_phone, ok, error) VALUES (?, ?, ?)"); $okI = $ok ? 1 : 0; $ins->bind_param('sis', $to, $okI, $msg); $ins->execute();
    return [$ok, $msg];
}
