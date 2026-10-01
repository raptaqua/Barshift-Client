<?php
// hubNormalizeUrl: sallitut ja kielletyt keskuksen osoitteet (SSRF-suoja)
require __DIR__ . '/../lib/hub.php';
$cases = ['https://example.com/hub' => 'https://example.com/hub', 'https://example.com/hub/' => 'https://example.com/hub', 'http://127.0.0.1:8080' => 'http://127.0.0.1:8080', 'https://localhost' => 'https://localhost',
    'http://example.com' => null, 'https://10.0.0.5' => null, 'https://192.168.1.2/x' => null, 'https://169.254.169.254' => null, 'https://[::1]' => 'https://[::1]' === 'x' ? null : null,
    'https://example.com?x=1' => null, 'ftp://example.com' => null, 'https://user@example.com' => null, 'javascript:alert(1)' => null];
$bad = 0;
foreach ($cases as $in => $want) { $got = hubNormalizeUrl($in); if ($got !== $want) { echo "FAIL $in -> " . var_export($got, true) . " (odotettiin " . var_export($want, true) . ")\n"; $bad++; } }
echo $bad ? "$bad epäonnistui\n" : "ok: hubNormalizeUrl\n"; exit($bad ? 1 : 0);
