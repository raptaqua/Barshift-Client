<?php
// Odotuslista täyteen menneisiin tapahtumiin: kun paikkoja vapautuu, ilmoitetaan jonon seuraaville (järjestyksessä, niin monelle kuin vapaat paikat riittävät).
// Paikkaa ei pidetä varattuna: ensimmäinen ilmoittautuja saa sen. Ilmoitetut poistuvat jonosta, kun he ilmoittautuvat tai 48 h kuluttua.
require_once __DIR__ . '/notify.php';

function bsWaitlistFree($conn, int $eventId): ?int {   // vapaat paikat tai null, jos paikkamäärää ei ole rajattu
    $q = $conn->prepare("SELECT capacity, (SELECT COALESCE(SUM(qty), 0) FROM event_registrations r WHERE r.event_id = e.id AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > NOW()))) AS used FROM events e WHERE e.id = ?");
    $q->bind_param('i', $eventId); $q->execute(); $r = $q->get_result()->fetch_assoc();
    if (!$r || $r['capacity'] === null) return null;
    return max(0, (int)$r['capacity'] - (int)$r['used']);
}

// Ilmoittaa jonon seuraaville. Palauttaa ilmoitettujen määrän.
function bsWaitlistPromote($conn, array $cfg, int $eventId): int {
    $free = bsWaitlistFree($conn, $eventId); if ($free === null || $free < 1) return 0;
    $ev = $conn->prepare("SELECT e.title, e.date, e.time_start, e.pub_name, p.name AS pname FROM events e LEFT JOIN pubs p ON p.slug = e.pub_name WHERE e.id = ? AND e.date >= CURDATE() AND e.registration <> 'none'");
    $ev->bind_param('i', $eventId); $ev->execute(); $e = $ev->get_result()->fetch_assoc(); if (!$e) return 0;
    $wl = $conn->prepare("SELECT id, name, email, qty FROM event_waitlist WHERE event_id = ? AND notified_at IS NULL ORDER BY id"); $wl->bind_param('i', $eventId); $wl->execute();
    $n = 0; $when = date('j.n.Y', strtotime($e['date'])) . ($e['time_start'] ? ' klo ' . substr($e['time_start'], 0, 5) : '');
    foreach ($wl->get_result()->fetch_all(MYSQLI_ASSOC) as $w) {
        if ((int)$w['qty'] > $free) continue;
        $u = $conn->prepare("UPDATE event_waitlist SET notified_at = NOW() WHERE id = ? AND notified_at IS NULL"); $wid = (int)$w['id']; $u->bind_param('i', $wid); $u->execute(); if ($u->affected_rows < 1) continue;
        bsEnqueueMail($conn, $w['email'], '[' . ($e['pname'] ?: 'BarShift') . '] Paikka vapautui: ' . $e['title'],
            "Hei {$w['name']},\n\ntapahtumaan {$e['title']} ($when) on vapautunut paikkoja, ja olit odotuslistalla.\n\nIlmoittaudu pian: " . bsBaseUrl($cfg) . "/tapahtumat.html\nPaikkaa ei pidetä varattuna, vaan ensimmäinen ilmoittautuja saa sen.\n");
        $free -= (int)$w['qty']; $n++; if ($free < 1) break;
    }
    return $n;
}

// Siivous: ilmoitetut yli 48 h, menneet tapahtumat
function bsWaitlistCleanup($conn): void {
    $conn->query("DELETE FROM event_waitlist WHERE notified_at < NOW() - INTERVAL 48 HOUR");
    $conn->query("DELETE w FROM event_waitlist w JOIN events e ON e.id = w.event_id WHERE e.date < CURDATE()");
}
