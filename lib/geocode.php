<?php
// Osoite -> koordinaatit (OpenStreetMapin Nominatim oletuksena; vaihdettavissa asetuksella geocoder_url).
/**
 * Osoite -> koordinaatit OpenStreetMapin Nominatim-palvelusta (oletus). Osoite vaihdettavissa configissa
 * ('geocoder_url', esim. oma Nominatim/Photon-yhteensopiva palvelu). Käyttöehdot: max 1 haku/s, tunnistettava
 * User-Agent, ei massahakuja -> haut serialisoidaan lukkotiedostolla ja vain admin voi käynnistää niitä.
 */
function geocodeAddress(array $cfg, string $query): ?array {
    $query = trim($query);
    if ($query === '' || !function_exists('curl_init')) return null;
    $base = $cfg['geocoder_url'] ?? 'https://nominatim.openstreetmap.org/search';
    $params = ['q' => $query, 'format' => 'jsonv2', 'limit' => 1];
    if (!empty($cfg['geocode_countries'])) $params['countrycodes'] = (string)$cfg['geocode_countries'];
    $contact = preg_replace('/^mailto:/', '', (string)($cfg['vapid_subject'] ?? ''));

    $lock = @fopen(sys_get_temp_dir() . '/barshift_geocode.lock', 'c+');
    if ($lock) {
        flock($lock, LOCK_EX);
        $last = (float)stream_get_contents($lock);
        $wait = 1.2 - (microtime(true) - $last);
        if ($wait > 0 && $wait < 3) usleep((int)($wait * 1000000));
    }
    $ch = curl_init($base . '?' . http_build_query($params));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'BarShift/1.0 (' . ($contact ?: 'https://github.com/raptaqua/barshift') . ')',
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: fi,en;q=0.8']]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($lock) { ftruncate($lock, 0); rewind($lock); fwrite($lock, (string)microtime(true)); flock($lock, LOCK_UN); fclose($lock); }

    if ($body === false || $code !== 200) { error_log("BarShift geocode: HTTP $code"); return null; }
    $rows = json_decode($body, true);
    if (!is_array($rows) || empty($rows[0]['lat']) || empty($rows[0]['lon'])) return null;
    $lat = (float)$rows[0]['lat']; $lng = (float)$rows[0]['lon'];
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) return null;
    return ['lat' => round($lat, 6), 'lng' => round($lng, 6), 'label' => mb_substr((string)($rows[0]['display_name'] ?? ''), 0, 200)];
}

