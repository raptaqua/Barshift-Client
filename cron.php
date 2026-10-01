<?php
// Ajastettu ylläpito. Ajetaan vain komentoriviltä, esim. cronilla joka 10. minuutti:
//   */10 * * * *  php /polku/barshift/cron.php
// Tekee: vuoromuistutukset, "leimaus unohtui" -hälytykset, lähtevän sähköpostin jonon tyhjennyksen ja
// (kerran vuorokaudessa, klo 03) tietojen säilytysaikojen siivouksen. BARSHIFT_CONFIG voi osoittaa erilliseen configiin.
// Ajo `php cron.php --cleanup` pakottaa siivouksen.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$cfg = require (getenv('BARSHIFT_CONFIG') ?: __DIR__ . '/config.php');
require_once __DIR__ . '/lib/db.php';
$conn = bsConnect($cfg);
if ($conn->connect_error) { fwrite(STDERR, "Yhteys epäonnistui\n"); exit(1); }

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/lib/notify.php';
$vapid_auth = ['VAPID' => ['subject' => $cfg['vapid_subject'], 'publicKey' => $cfg['vapid_public_key'], 'privateKey' => $cfg['vapid_private_key']]];

function out(string $m): void { echo date('Y-m-d H:i:s') . "  $m\n"; }
function del($conn, string $label, string $sql, string $types = '', array $params = []): void {
    $st = $conn->prepare($sql);
    if (!$st) { out("ohita $label (" . $conn->error . ')'); return; }
    if ($types !== '') $st->bind_param($types, ...$params);
    $st->execute();
    out(sprintf('%-34s %d riviä', $label, $st->affected_rows));
}

// ===================== MUISTUTUKSET JA HÄLYTYKSET =====================
function pubTz(array $p): DateTimeZone { try { return new DateTimeZone($p['timezone']); } catch (Throwable $e) { return new DateTimeZone('Europe/Helsinki'); } }
function hm(string $t): string { return substr($t, 0, 5); }
function fetchRows($conn, string $sql, string $types = '', array $params = []): array {
    $st = $conn->prepare($sql); if (!$st) return [];
    if ($types !== '') $st->bind_param($types, ...$params);
    $st->execute();
    return $st->get_result()->fetch_all(MYSQLI_ASSOC);
}
function hasApprovedAbsence($conn, int $uid, string $date): bool {
    return (bool)fetchRows($conn, "SELECT 1 FROM absences WHERE user_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date LIMIT 1", 'is', [$uid, $date]);
}
function notifyAdmins($conn, string $title, string $body, array $vapid): void { pushToPub($conn, 0, $title, $body, $vapid, true); }

$pubRows = fetchRows($conn, "SELECT name, timezone, reminder_hours, clock_alert_minutes FROM pubs ORDER BY id LIMIT 1");
foreach ($pubRows as $p) {
    $tz = pubTz($p); $now = new DateTime('now', $tz);

    // 1) Vuoromuistutus: julkaistu, vielä muistuttamaton vuoro alkaa seuraavan reminder_hours tunnin sisällä
    if ((int)$p['reminder_hours'] > 0) {
        $horizon = (clone $now)->modify('+' . (int)$p['reminder_hours'] . ' hours'); $n = 0;
        $shifts = fetchRows($conn, "SELECT id, userId, date, start, end, role FROM shifts WHERE status = 'published' AND userId IS NOT NULL AND reminded_at IS NULL AND date BETWEEN ? AND ?",
            'ss', [(clone $now)->modify('-1 day')->format('Y-m-d'), $horizon->format('Y-m-d')]);
        foreach ($shifts as $sh) {
            $start = new DateTime($sh['date'] . ' ' . $sh['start'], $tz);
            if ($start < $now || $start > $horizon) continue;   // jo alkanut tai ei vielä muistutusikkunassa
            $mark = $conn->prepare("UPDATE shifts SET reminded_at = NOW() WHERE id = ? AND reminded_at IS NULL"); $mark->bind_param('i', $sh['id']); $mark->execute();
            if ($mark->affected_rows < 1 || hasApprovedAbsence($conn, (int)$sh['userId'], $sh['date'])) continue;
            $day = $start->format('Y-m-d') === $now->format('Y-m-d') ? 'tänään' : 'huomenna';
            sendPushToUser($conn, (int)$sh['userId'], 'Vuoro alkaa pian', "Vuorosi alkaa $day klo " . hm($sh['start']) . '–' . hm($sh['end']) . ($sh['role'] ? " ({$sh['role']})" : '') . '.', $vapid_auth);
            $n++;
        }
        if ($n) out("$n vuoromuistutusta");
    }

    // 2) Leimaushälytykset (vain jos baari on ottanut ne käyttöön)
    $m = (int)$p['clock_alert_minutes'];
    if ($m > 0) {
        // 2a) Ulosleimaus unohtui: avoin leimaus, jonka vuoro päättyi yli $m min sitten (tai ei vuoroa ja leimaus yli 14 h vanha)
        $open = fetchRows($conn, "SELECT e.id, e.user_id, e.clock_in, u.name FROM time_entries e JOIN users u ON u.id = e.user_id WHERE e.clock_out IS NULL AND e.alerted_at IS NULL AND u.anonymized_at IS NULL");
        $late = [];
        foreach ($open as $e) {
            $in = new DateTime($e['clock_in'], $tz); $limit = null;
            foreach (fetchRows($conn, "SELECT date, start, end FROM shifts WHERE userId = ? AND date BETWEEN ? AND ?", 'iss', [$e['user_id'], (clone $in)->modify('-1 day')->format('Y-m-d'), $in->format('Y-m-d')]) as $sh) {
                $s1 = new DateTime($sh['date'] . ' ' . $sh['start'], $tz); $s2 = new DateTime($sh['date'] . ' ' . $sh['end'], $tz);
                if ($s2 <= $s1) $s2->modify('+1 day');
                if ($in >= (clone $s1)->modify('-3 hours') && $in <= $s2) { $limit = (clone $s2)->modify("+$m minutes"); break; }
            }
            $limit = $limit ?: (clone $in)->modify('+14 hours');
            if ($now < $limit) continue;
            $mark = $conn->prepare("UPDATE time_entries SET alerted_at = NOW() WHERE id = ? AND alerted_at IS NULL"); $mark->bind_param('i', $e['id']); $mark->execute();
            if ($mark->affected_rows < 1) continue;
            sendPushToUser($conn, (int)$e['user_id'], 'Unohtuiko leimata ulos?', 'Olet edelleen leimattuna sisään (' . $in->format('j.n. \k\l\o H:i') . '). Leimaa ulos tai pyydä ylläpitäjää korjaamaan aika.', $vapid_auth);
            $late[] = $e['name'] . ' (sisään ' . $in->format('j.n. H:i') . ')';
        }
        if ($late) { notifyAdmins($conn, 'Ulosleimaus puuttuu', implode(', ', $late), $vapid_auth); out("Ulosleimaus puuttuu " . count($late)); }

        // 2b) Sisäänleimaus unohtui: vuoro alkoi yli $m min sitten, eikä leimausta löydy
        $missing = [];
        $shifts = fetchRows($conn, "SELECT s.id, s.userId, s.date, s.start, s.end, u.name FROM shifts s JOIN users u ON u.id = s.userId
            WHERE s.status = 'published' AND s.userId IS NOT NULL AND s.missed_alerted_at IS NULL AND u.anonymized_at IS NULL AND s.date BETWEEN ? AND ?",
            'ss', [(clone $now)->modify('-1 day')->format('Y-m-d'), $now->format('Y-m-d')]);
        foreach ($shifts as $sh) {
            $s1 = new DateTime($sh['date'] . ' ' . $sh['start'], $tz); $s2 = new DateTime($sh['date'] . ' ' . $sh['end'], $tz);
            if ($s2 <= $s1) $s2->modify('+1 day');
            if ($now < (clone $s1)->modify("+$m minutes") || $now > (clone $s2)->modify('+12 hours')) continue;   // ei vielä myöhässä / liian vanha
            $has = fetchRows($conn, "SELECT 1 FROM time_entries WHERE user_id = ? AND clock_in BETWEEN ? AND ? LIMIT 1", 'iss',
                [$sh['userId'], (clone $s1)->modify('-3 hours')->format('Y-m-d H:i:s'), $s2->format('Y-m-d H:i:s')]);
            $mark = $conn->prepare("UPDATE shifts SET missed_alerted_at = NOW() WHERE id = ? AND missed_alerted_at IS NULL"); $mark->bind_param('i', $sh['id']); $mark->execute();
            if ($has || $mark->affected_rows < 1 || hasApprovedAbsence($conn, (int)$sh['userId'], $sh['date'])) continue;
            sendPushToUser($conn, (int)$sh['userId'], 'Leimaus puuttuu', 'Vuorosi alkoi klo ' . hm($sh['start']) . ', mutta et ole leimannut sisään. Leimaa nyt tai ilmoita esteestä ylläpitäjälle.', $vapid_auth);
            $missing[] = $sh['name'] . ' (' . hm($sh['start']) . ')';
        }
        if ($missing) { notifyAdmins($conn, 'Sisäänleimaus puuttuu', implode(', ', $missing), $vapid_auth); out("Sisäänleimaus puuttuu " . count($missing)); }
    }
}

// ===================== LUPIEN (JV-kortti) VANHENEMISMUISTUTUKSET =====================
// 30 pv ja 7 pv ennen vanhenemista sekä vanhenemispäivän jälkeen; kukin kerran (cert_alert_level), uusi vanhenemispäivä nollaa tilan
foreach (fetchRows($conn, "SELECT u.id, u.name, u.expiry_jv, u.cert_alert_level, u.cert_alert_for, p.timezone FROM users u CROSS JOIN pubs p
        WHERE u.expiry_jv IS NOT NULL AND u.anonymized_at IS NULL") as $u) {
    $tz = new DateTimeZone($u['timezone'] ?: 'Europe/Helsinki'); $today = new DateTime('today', $tz); $exp = new DateTime($u['expiry_jv'], $tz);
    $days = (int)$today->diff($exp)->format('%r%a'); $level = (int)$u['cert_alert_level'];
    if ($u['cert_alert_for'] !== $u['expiry_jv']) $level = 0;
    $new = $days < 0 ? 3 : ($days <= 7 ? 2 : ($days <= 30 ? 1 : 0));
    if ($new <= $level) { if ($u['cert_alert_for'] !== $u['expiry_jv']) { $r = $conn->prepare("UPDATE users SET cert_alert_level = ?, cert_alert_for = ? WHERE id = ?"); $r->bind_param('isi', $level, $u['expiry_jv'], $u['id']); $r->execute(); } continue; }
    $when = $new === 3 ? 'on vanhentunut ' . $exp->format('j.n.Y') : "vanhenee {$exp->format('j.n.Y')} ($days pv)";
    sendPushToUser($conn, (int)$u['id'], 'JV-kortti ' . ($new === 3 ? 'vanhentunut' : 'vanhenee pian'), "JV-korttisi $when. Uusi kortti ajoissa ja ilmoita uusi päivämäärä ylläpidolle.", $vapid_auth);
    notifyAdmins($conn, 'Lupa vanhenemassa', "{$u['name']}: JV-kortti $when", $vapid_auth);
    $r = $conn->prepare("UPDATE users SET cert_alert_level = ?, cert_alert_for = ? WHERE id = ?"); $r->bind_param('isi', $new, $u['expiry_jv'], $u['id']); $r->execute();
    out("Lupamuistutus: {$u['name']} ($when)");
}

// Maksamattomat lippuvaraukset vapautuvat, kun maksuaika umpeutuu
$conn->query("UPDATE event_registrations SET status = 'cancelled', expires_at = NULL WHERE status = 'pending' AND expires_at < NOW()");

// Keskuspalvelin (BarShift Hub): julkiset tapahtumat ja keikkavuorot ulos, hakemukset sisään (vain jos config['hub'] on asetettu ja baari on ottanut ominaisuuden käyttöön)
require_once __DIR__ . '/lib/hub.php'; hubLoadConfig($conn, $cfg);
if (hubConfigured($cfg)) {
    foreach (fetchRows($conn, "SELECT feature_hub_events, feature_hub_gigs, feature_hub_feed FROM pubs ORDER BY id LIMIT 1") as $hp) {
        [$sent, $errs] = hubSync($conn, $cfg, $hp); $newApps = hubPullApplications($conn, $cfg, $hp, $vapid_auth);
        [$feedNew, $feedSent] = hubFeedPull($conn, $cfg, $hp, $vapid_auth); $outCh = hubOutgoingPull($conn, $cfg, $hp, $vapid_auth);
        if ($sent || $errs || $newApps || $feedNew || $outCh) out("hub: lähetetty $sent, virheitä $errs, uusia hakemuksia $newApps, uusia vapaita vuoroja $feedNew (ilmoituksia $feedSent), hakemusten muutoksia $outCh");
        if ($errs) { $st = $conn->prepare("INSERT INTO system_status (k, v) VALUES ('hub_last_error', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)"); $v = date('c'); if ($st) { $st->bind_param('s', $v); $st->execute(); } }
    }
}

// Tapahtumapalaute: tapahtuman jälkeisenä päivänä (3 pv sisällä, baarin aikavyöhykkeellä) sähköpostilla pyyntö niille, jotka olivat ilmoittautuneet (jos saapumisia on merkitty, vain saapuneille)
foreach (fetchRows($conn, "SELECT name, timezone FROM pubs WHERE feature_reminders = 1 ORDER BY id LIMIT 1") as $fp) {
    $todayLocal = (new DateTime('now', pubTz($fp)))->format('Y-m-d');
    foreach (fetchRows($conn, "SELECT r.id, r.name, r.email, e.title, e.date FROM event_registrations r JOIN events e ON e.id = r.event_id
            WHERE r.status = 'confirmed' AND r.feedback_sent_at IS NULL AND e.date < ? AND e.date >= DATE_SUB(?, INTERVAL 3 DAY)
              AND (r.arrived = 1 OR NOT EXISTS (SELECT 1 FROM event_registrations r2 WHERE r2.event_id = r.event_id AND r2.arrived = 1)) LIMIT 200", 'ss', [$todayLocal, $todayLocal]) as $f) {
        $tok = bin2hex(random_bytes(24)); $h = hash('sha256', $tok);
        $u = $conn->prepare("UPDATE event_registrations SET feedback_hash = ?, feedback_sent_at = NOW() WHERE id = ? AND feedback_sent_at IS NULL"); $fid = (int)$f['id']; $u->bind_param('si', $h, $fid); $u->execute(); if ($u->affected_rows < 1) continue;
        bsEnqueueMail($conn, $f['email'], '[' . $fp['name'] . '] Kiitos käynnistä – kerro mitä pidit: ' . $f['title'], "Hei {$f['name']},\n\nkiitos, että olit mukana: {$f['title']} (" . date('j.n.Y', strtotime($f['date'])) . ").\nKerro lyhyesti, millainen ilta oli (kestää alle minuutin): " . bsBaseUrl($cfg) . "/varaus.html#feedback=$tok\n");
    }
}

// Odotuslistat: vapautuneet paikat (vanhenevat maksuvaraukset ym.) ilmoitetaan jonolle; vanhat merkinnät siivotaan
require_once __DIR__ . '/lib/waitlist.php';
foreach (fetchRows($conn, "SELECT DISTINCT event_id FROM event_waitlist WHERE notified_at IS NULL") as $w) { $k = bsWaitlistPromote($conn, $cfg, (int)$w['event_id']); if ($k) out("Odotuslista: $k ilmoitusta (tapahtuma #{$w['event_id']})"); }
bsWaitlistCleanup($conn);

// ===================== VARAUSTEN JA ILMOITTAUTUMISTEN MUISTUTUKSET (valinnainen: pubs.feature_reminders) =====================
// Muistutus lähtee guest_reminder_hours tuntia ennen; sähköposti, ja jos baari on ottanut SMS:n käyttöön, myös tekstiviesti (vain varaukset, joissa on puhelin).
require_once __DIR__ . '/lib/sms.php';
if (($t = $conn->query("SHOW TABLES LIKE 'bookings'")) && $t->num_rows > 0) {
    foreach (fetchRows($conn, "SELECT b.id, b.name, b.email, b.phone, b.party_size, b.starts_at, p.name AS pname, p.reminder_sms FROM bookings b CROSS JOIN pubs p
            WHERE p.feature_reminders = 1 AND b.status = 'confirmed' AND (b.email IS NOT NULL OR (p.reminder_sms = 1 AND b.phone IS NOT NULL)) AND b.reminded_at IS NULL AND b.starts_at > NOW() AND b.starts_at <= DATE_ADD(NOW(), INTERVAL p.guest_reminder_hours HOUR)") as $b) {
        $r = $conn->prepare("UPDATE bookings SET reminded_at = NOW() WHERE id = ? AND reminded_at IS NULL"); $r->bind_param('i', $b['id']); $r->execute(); if ($r->affected_rows < 1) continue;
        $when = date('j.n.Y \k\l\o H:i', strtotime($b['starts_at']));
        if ($b['email']) bsEnqueueMail($conn, $b['email'], '[' . $b['pname'] . '] Muistutus pöytävarauksesta', "Hei {$b['name']},\n\nmuistutus varauksestasi: $when, {$b['party_size']} henkilöä.\nJos et pääse, peru varaus vahvistusviestin linkistä.\n");
        if ((int)$b['reminder_sms'] === 1 && $b['phone'] && bsSmsConfigured($cfg)) {
            [$ok, $err] = bsSendSms($conn, $cfg, $b['phone'], "{$b['pname']}: muistutus pöytävarauksesta $when ({$b['party_size']} hlö). Jos et pääse, ilmoita meille.");
            out('SMS-muistutus ' . ($ok ? 'lähetetty' : 'epäonnistui: ' . $err) . " ({$b['name']})");
        }
    }
    foreach (fetchRows($conn, "SELECT r.id, r.name, r.email, r.qty, e.title, e.date, e.time_start, p.name AS pname FROM event_registrations r JOIN events e ON e.id = r.event_id CROSS JOIN pubs p
            WHERE p.feature_reminders = 1 AND r.status = 'confirmed' AND r.reminded_at IS NULL AND CONCAT(e.date, ' ', COALESCE(e.time_start, '18:00:00')) > NOW() AND CONCAT(e.date, ' ', COALESCE(e.time_start, '18:00:00')) <= DATE_ADD(NOW(), INTERVAL p.guest_reminder_hours HOUR)") as $r0) {
        $r = $conn->prepare("UPDATE event_registrations SET reminded_at = NOW() WHERE id = ? AND reminded_at IS NULL"); $r->bind_param('i', $r0['id']); $r->execute(); if ($r->affected_rows < 1) continue;
        bsEnqueueMail($conn, $r0['email'], '[' . $r0['pname'] . '] Muistutus: ' . $r0['title'], "Hei {$r0['name']},\n\nmuistutus tulevasta tapahtumasta: {$r0['title']}, " . date('j.n.Y', strtotime($r0['date'])) . ($r0['time_start'] ? ' klo ' . substr($r0['time_start'], 0, 5) : '') . " ({$r0['qty']} henkilöä).\n");
    }
}

// ===================== LÄHTEVÄ SÄHKÖPOSTI =====================
$sent = bsFlushMailQueue($conn, $cfg, 100);
if ($sent) out("Sähköposteja lähetetty: $sent");
if (bsMailConfigured($cfg)) {
    $failed = fetchRows($conn, "SELECT COUNT(*) c FROM mail_queue WHERE sent_at IS NULL AND attempts >= 5");
    if (!empty($failed[0]['c'])) out('VAROITUS: ' . $failed[0]['c'] . ' sähköpostia epäonnistui pysyvästi (mail_queue.last_error)');
}

// ===================== SIIVOUS (kerran vuorokaudessa tai --cleanup) =====================
if (in_array('--cleanup', $argv ?? [], true) || (int)date('G') === 3 && (int)date('i') < 10) {
    del($conn, 'lähetetty posti > 30 pv', "DELETE FROM mail_queue WHERE created_at < NOW() - INTERVAL 30 DAY");
    if (($t = $conn->query("SHOW TABLES LIKE 'bookings'")) && $t->num_rows > 0) {
        del($conn, 'varaukset > 12 kk', "DELETE FROM bookings WHERE starts_at < NOW() - INTERVAL 12 MONTH");
        del($conn, 'ilmoittautumiset > 12 kk', "DELETE r FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.date < CURDATE() - INTERVAL 12 MONTH");
    }
    if (($t = $conn->query("SHOW TABLES LIKE 'guests'")) && $t->num_rows > 0) {
        del($conn, 'vieraskortisto > 24 kk ilman käyntejä', "DELETE g FROM guests g WHERE g.updated_at < NOW() - INTERVAL 24 MONTH AND NOT EXISTS (SELECT 1 FROM bookings b WHERE g.email IS NOT NULL AND LOWER(b.email) = LOWER(g.email) AND b.starts_at > NOW() - INTERVAL 24 MONTH)");
    }
    del($conn, 'vanhat kutsulinkit', "DELETE FROM auth_tokens WHERE expires_at < NOW() - INTERVAL 7 DAY");
    // --- Yleiset, baarista riippumattomat säilytysajat ---
    del($conn, 'tekstiviestiloki > 12 kk', "DELETE FROM sms_log WHERE created_at < NOW() - INTERVAL 12 MONTH");
    del($conn, 'keikkahakemukset > 12 kk', "DELETE FROM hub_applications WHERE created_at < NOW() - INTERVAL 12 MONTH");
    del($conn, 'omat keikkahakemukset > 3 kk', "DELETE FROM hub_outgoing WHERE date < CURDATE() - INTERVAL 3 MONTH");
    del($conn, 'laiterekisteri > 90 pv', "DELETE FROM user_sessions WHERE last_seen < NOW() - INTERVAL 90 DAY");
    del($conn, 'kirjautumisyritykset > 30 pv', "DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL 30 DAY");
    del($conn, 'auditloki > 24 kk', "DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL 24 MONTH");
    
    // --- Baarikohtainen säilytysaika (pubs.retention_months) ---
    $pubs = $conn->query("SELECT retention_months FROM pubs ORDER BY id LIMIT 1");
    while ($pubs && ($p = $pubs->fetch_assoc())) {
        $m = max(24, (int)$p['retention_months']);
        out("Säilytysaika $m kk");
        del($conn, '  leimaukset', "DELETE FROM time_entries WHERE clock_in < NOW() - INTERVAL $m MONTH");
        del($conn, '  vuorot', "DELETE FROM shifts WHERE date < CURDATE() - INTERVAL $m MONTH");
        del($conn, '  vuorokirja', "DELETE FROM shift_logs WHERE created_at < NOW() - INTERVAL $m MONTH");
        del($conn, '  yksityisviestit', "DELETE FROM private_messages WHERE created_at < NOW() - INTERVAL $m MONTH");
        del($conn, '  poissaolot', "DELETE FROM absences WHERE end_date < CURDATE() - INTERVAL $m MONTH");
        del($conn, '  saatavuus > 6 kk', "DELETE FROM availability WHERE date < CURDATE() - INTERVAL 6 MONTH");
        del($conn, '  rutiinikuittaukset > 12 kk', "DELETE FROM task_completions WHERE date < CURDATE() - INTERVAL 12 MONTH");
    }
}
foreach (['cron_last_run' => date('c')] as $k => $v) { $st = $conn->prepare("INSERT INTO system_status (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)"); if ($st) { $st->bind_param('ss', $k, $v); $st->execute(); } }
out('Valmis');
