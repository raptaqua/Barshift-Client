<?php
// Stripe Checkout -verkkomaksu tapahtumalippuihin (valinnainen). config.php:
//   'stripe' => ['secret_key' => 'sk_live_…', 'webhook_secret' => 'whsec_…', 'payment_methods' => ['mobilepay'] /* oletus: vain MobilePay */, 'api_base' => 'https://api.stripe.com' /* vain testeihin */]
// Webhook-osoite Stripen hallintapaneeliin: <sovelluksen osoite>/api.php?action=stripe_webhook , tapahtumat: checkout.session.completed ja checkout.session.expired.
// Korttitietoja ei koskaan käsitellä tällä palvelimella: asiakas maksaa Stripen sivulla.

function bsStripeConfigured(array $cfg): bool { $s = $cfg['stripe'] ?? []; return !empty($s['secret_key']) && !empty($s['webhook_secret']); }

// Maksutapa on oletuksena vain MobilePay (ota se käyttöön Stripen hallinnassa). Muuta tarvittaessa: 'payment_methods' => ['mobilepay', 'card']; tyhjä lista [] = Stripen automaattiset tavat.
function bsStripeMethods(array $cfg): array { $m = $cfg['stripe']['payment_methods'] ?? ['mobilepay']; return array_values(array_filter(array_map('strval', (array)$m), fn($x) => preg_match('/^[a-z_]{2,30}$/', $x))); }

// Palauttaa [ok, data|virheteksti]
function bsStripeCreateCheckout(array $cfg, array $params): array {
    $s = $cfg['stripe'];
    $ch = curl_init(rtrim((string)($s['api_base'] ?? 'https://api.stripe.com'), '/') . '/v1/checkout/sessions');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $s['secret_key']], CURLOPT_POSTFIELDS => http_build_query($params)]);
    $resp = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    $j = is_string($resp) ? json_decode($resp, true) : null;
    if ($code >= 200 && $code < 300 && is_array($j) && !empty($j['url']) && !empty($j['id'])) return [true, $j];
    return [false, $err ?: ('HTTP ' . $code . ' ' . ($j['error']['message'] ?? ''))];
}

// Stripe-Signature: t=aikaleima,v1=hmac(sha256, "t.runko"). Toleranssi 5 min (uudelleentoiston esto).
function bsStripeVerify(string $payload, string $header, string $secret, int $tolerance = 300): bool {
    $t = null; $sigs = [];
    foreach (explode(',', $header) as $part) { $kv = explode('=', trim($part), 2); if (count($kv) !== 2) continue; if ($kv[0] === 't') $t = (int)$kv[1]; elseif ($kv[0] === 'v1') $sigs[] = $kv[1]; }
    if (!$t || !$sigs || abs(time() - $t) > $tolerance) return false;
    $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
    foreach ($sigs as $s) if (hash_equals($expected, $s)) return true;
    return false;
}
