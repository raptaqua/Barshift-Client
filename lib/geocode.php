<?php
// Osoite -> koordinaatit (OpenStreetMapin Nominatim oletuksena; vaihdettavissa asetuksella geocoder_url).
/**
 * Osoite -> koordinaatit OpenStreetMapin Nominatim-palvelusta (oletus). Osoite vaihdettavissa configissa
 * ('geocoder_url', esim. oma Nominatim/Photon-yhteensopiva palvelu). Käyttöehdot: max 1 haku/s, tunnistettava
 * User-Agent, ei massahakuja -> haut serialisoidaan lukkotiedostolla ja vain admin voi käynnistää niitä.
 */
// Viimeisin virheen syy (näytetään ylläpitäjälle): 'ei_curl', 'verkko: ...', 'http_403', 'ei_tulosta'
function geocodeLastError(?string $set = null): string { static $e = ''; if ($set !== null) $e = $set; return $e; }

function geocodeFetch(string $url, string $ua): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_USERAGENT => $ua,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: fi,en;q=0.8']]);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return [$body, $code, $err];
}

function geocodeAddress(array $cfg, string $query): ?array {
    $query = trim($query); geocodeLastError('');
    if ($query === '') return null;
    if (!function_exists('curl_init')) { geocodeLastError('ei_curl: PHP:n curl-laajennus puuttuu palvelimelta'); return null; }
    $custom = !empty($cfg['geocoder_url']);
    $contact = preg_replace('/^mailto:/', '', (string)($cfg['vapid_subject'] ?? ''));
    $ua = 'BarShift/1.0 (' . ($contact ?: 'https://github.com/raptaqua/barshift') . ')';
    $lock = @fopen(sys_get_temp_dir() . '/barshift_geocode.lock', 'c+');
    if ($lock) {
        flock($lock, LOCK_EX);
        $last = (float)stream_get_contents($lock);
        $wait = 1.2 - (microtime(true) - $last);
        if ($wait > 0 && $wait < 3) usleep((int)($wait * 1000000));
    }
    $result = null; $errors = [];
    // 1) Nominatim (tai config 'geocoder_url') 2) varalla Photon (vain jos omaa palvelua ei ole asetettu)
    $params = ['q' => $query, 'format' => 'jsonv2', 'limit' => 1];
    if (!empty($cfg['geocode_countries'])) $params['countrycodes'] = (string)$cfg['geocode_countries'];
    [$body, $code, $err] = geocodeFetch(($cfg['geocoder_url'] ?? 'https://nominatim.openstreetmap.org/search') . '?' . http_build_query($params), $ua);
    if ($body !== false && $code === 200) {
        $rows = json_decode($body, true);
        if (is_array($rows) && !empty($rows[0]['lat']) && !empty($rows[0]['lon'])) $result = [(float)$rows[0]['lat'], (float)$rows[0]['lon'], (string)($rows[0]['display_name'] ?? '')];
        elseif (is_array($rows)) $errors[] = 'ei_tulosta';
        else $errors[] = 'virheellinen vastaus';
    } else $errors[] = $body === false ? 'verkko: ' . ($err ?: 'ei yhteyttä') : 'http_' . $code;
    if (!$result && !$custom && !in_array('ei_tulosta', $errors, true)) {
        [$body, $code, $err] = geocodeFetch('https://photon.komoot.io/api/?' . http_build_query(['q' => $query, 'limit' => 1]), $ua);
        if ($body !== false && $code === 200) {
            $j = json_decode($body, true); $c = $j['features'][0]['geometry']['coordinates'] ?? null;
            if (is_array($c) && count($c) === 2) { $p = $j['features'][0]['properties'] ?? []; $result = [(float)$c[1], (float)$c[0], implode(', ', array_filter([$p['name'] ?? '', $p['street'] ?? '', $p['city'] ?? '']))]; }
            else $errors[] = 'photon: ei tulosta';
        } else $errors[] = 'photon ' . ($body === false ? 'verkko: ' . ($err ?: 'ei yhteyttä') : 'http_' . $code);
    }
    if ($lock) { ftruncate($lock, 0); rewind($lock); fwrite($lock, (string)microtime(true)); flock($lock, LOCK_UN); fclose($lock); }
    if (!$result) { geocodeLastError(implode('; ', $errors)); error_log('BarShift geocode: ' . geocodeLastError()); return null; }
    [$lat, $lng, $label] = $result;
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) { geocodeLastError('virheelliset koordinaatit'); return null; }
    return ['lat' => round($lat, 6), 'lng' => round($lng, 6), 'label' => mb_substr($label, 0, 200)];
}
