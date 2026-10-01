<?php
// Ilmoitukset: web push + sähköposti varakanavana. Käytössä sekä api.php:ssä että cron.php:ssä.
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

require_once __DIR__ . '/mailer.php';

// Sovelluksen perusosoite linkkeihin: config 'base_url' tai (web-pyynnössä) pyynnön isäntä
function bsBaseUrl(array $cfg): string {
    if (!empty($cfg['base_url'])) return rtrim((string)$cfg['base_url'], '/');
    if (PHP_SAPI === 'cli' || empty($_SERVER['HTTP_HOST'])) return '';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = preg_replace('/[^A-Za-z0-9.\-:\[\]]/', '', (string)$_SERVER['HTTP_HOST']);
    return ($https ? 'https' : 'http') . '://' . $host . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
}

// ---- Postijono: viestit jonoon, lähetys heti pyynnön jälkeen tai cronissa ----
function bsEnqueueMail($conn, string $to, string $subject, string $body): void {
    static $registered = false;
    global $cfg;
    if (!bsMailConfigured($cfg)) return;
    $st = $conn->prepare("INSERT INTO mail_queue (to_email, subject, body) VALUES (?, ?, ?)");
    if (!$st) return;   // taulua ei ole (päivittämätön kanta): ei kaadeta varsinaista toimintoa
    $st->bind_param("sss", $to, $subject, $body);
    $st->execute();
    if (!$registered && PHP_SAPI !== 'cli') {
        $registered = true;
        register_shutdown_function(function () use ($conn, $cfg) {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();   // käyttäjä ei odota postin lähetystä
            bsFlushMailQueue($conn, $cfg, 5);
        });
    }
}

function bsFlushMailQueue($conn, array $cfg, int $limit = 5): int {
    $r = @$conn->query("SELECT id, to_email, subject, body FROM mail_queue WHERE sent_at IS NULL AND attempts < 5 ORDER BY id LIMIT " . (int)$limit);
    if (!$r) return 0;
    $sent = 0;
    foreach ($r->fetch_all(MYSQLI_ASSOC) as $m) {
        $err = bsSendMail($cfg, $m['to_email'], $m['subject'], $m['body']);
        if ($err === null) { $conn->query("UPDATE mail_queue SET sent_at = NOW(), attempts = attempts + 1, last_error = NULL WHERE id = " . (int)$m['id']); $sent++; }
        else {
            $st = $conn->prepare("UPDATE mail_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?");
            $e = mb_substr($err, 0, 200); $id = (int)$m['id']; $st->bind_param("si", $e, $id); $st->execute();
            error_log('BarShift mail: ' . $err);
        }
    }
    return $sent;
}

// ---- Push ----
// Palauttaa onnistuneiden push-toimitusten määrän. Jos yhtään ei onnistunut, lähetetään sähköposti (kun osoite on ja käyttäjä sallii).
// Ilmoituksen napautus avaa sovelluksen oikeaan näkymään (vain tunnetut näkymät)
function pushViewFor(string $title): string {
    $t = mb_strtolower($title);
    if (str_contains($t, 'viesti')) return 'messages';
    if (str_contains($t, 'poissaolo')) return 'absences';
    if (str_contains($t, 'tapahtum')) return 'events';
    return 'dashboard';
}
function sendPushToUser($conn, $userId, $title, $body, $auth): int {
    $delivered = 0;
    try {
        if (class_exists('\Minishlink\WebPush\WebPush')) {
            $stmt = $conn->prepare("SELECT * FROM push_subscriptions WHERE user_id = ?");
            if ($stmt) {
                $stmt->bind_param("i", $userId);
                $stmt->execute();
                $subs = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                if ($subs) {
                    $webPush = new WebPush($auth);
                    foreach ($subs as $sub) {
                        $subscription = Subscription::create(['endpoint' => $sub['endpoint'], 'keys' => ['p256dh' => $sub['p256dh'], 'auth' => $sub['auth']]]);
                        $webPush->sendOneNotification($subscription, json_encode(['title' => $title, 'body' => $body, 'url' => '/', 'view' => pushViewFor((string)$title)]));
                    }
                    foreach ($webPush->flush() as $report) {
                        if ($report->isSuccess()) { $delivered++; continue; }
                        if ($report->isSubscriptionExpired()) {
                            $endpoint = $report->getRequest()->getUri()->__toString();
                            $delStmt = $conn->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
                            if ($delStmt) { $delStmt->bind_param("s", $endpoint); $delStmt->execute(); }
                        }
                    }
                }
            }
        }
    } catch (\Throwable $e) { error_log('BarShift push: ' . $e->getMessage()); }
    if ($delivered === 0) bsEmailFallback($conn, (int)$userId, (string)$title, (string)$body);
    return $delivered;
}

function bsEmailFallback($conn, int $userId, string $title, string $body): void {
    global $cfg;
    if (!bsMailConfigured($cfg)) return;
    $st = $conn->prepare("SELECT email, name FROM users WHERE id = ? AND notify_email = 1 AND email IS NOT NULL AND email <> '' AND anonymized_at IS NULL");
    if (!$st) return;
    $st->bind_param("i", $userId); $st->execute();
    $u = $st->get_result()->fetch_assoc();
    if (!$u) return;
    $url = bsBaseUrl($cfg);
    bsEnqueueMail($conn, $u['email'], '[BarShift] ' . $title, "Hei " . $u['name'] . ",\n\n" . $body . "\n\n" . ($url ? "Avaa BarShift: $url/\n\n" : '')
        . "Saat tämän viestin sähköpostina, koska et ole ottanut push-ilmoituksia käyttöön. Voit muuttaa asetusta Oma profiili -sivulla.");
}

function pushToPub($conn, string $pub, $exceptId, $title, $body, $auth, $onlyAdmins = false) {
    $sql = "SELECT id FROM users WHERE pub_name = ? AND id != ? AND anonymized_at IS NULL" . ($onlyAdmins ? " AND role = 'admin'" : "");
    $stmt = $conn->prepare($sql);
    if (!$stmt) return;
    $ex = (int)$exceptId;
    $stmt->bind_param("si", $pub, $ex);
    $stmt->execute();
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $u) sendPushToUser($conn, $u['id'], $title, $body, $auth);
}
