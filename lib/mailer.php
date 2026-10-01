<?php
// Sähköpostin lähetys: SMTP (config 'smtp') tai PHP:n mail() (config 'mail_from'). Ei ulkoisia riippuvuuksia.
//
// config.php:
//   'mail_from' => 'BarShift <noreply@esimerkki.fi>',            // pakollinen, jotta posteja lähetetään
//   'smtp' => ['host' => 'smtp.esimerkki.fi', 'port' => 587, 'secure' => 'tls',   // 'tls' (STARTTLS), 'ssl' tai ''
//              'user' => 'käyttäjä', 'pass' => 'salasana'],                      // valinnainen; ilman sitä käytetään mail()

function bsMailConfigured(array $cfg): bool { return !empty($cfg['mail_from']) && bsParseAddress((string)$cfg['mail_from']) !== null; }

// "Nimi <osoite@x.fi>" tai "osoite@x.fi" -> [nimi, osoite] tai null
function bsParseAddress(string $s): ?array {
    $s = trim(str_replace(["\r", "\n"], '', $s));
    if (preg_match('/^(.*)<([^<>]+)>$/', $s, $m)) { $name = trim($m[1], " \t\""); $addr = trim($m[2]); }
    else { $name = ''; $addr = $s; }
    return filter_var($addr, FILTER_VALIDATE_EMAIL) ? [$name, $addr] : null;
}

function bsMimeHeader(string $s): string {   // RFC 2047, turvallinen otsikkokenttä (ei rivinvaihtoja)
    $s = str_replace(["\r", "\n"], ' ', $s);
    return preg_match('/^[\x20-\x7E]*$/', $s) ? $s : '=?UTF-8?B?' . base64_encode($s) . '?=';
}

function bsBuildMessage(array $from, string $to, string $subject, string $body): string {
    $fromHdr = ($from[0] !== '' ? bsMimeHeader($from[0]) . ' ' : '') . '<' . $from[1] . '>';
    $domain = substr(strrchr($from[1], '@'), 1) ?: 'localhost';
    $h = [
        'Date: ' . date('r'),
        'From: ' . $fromHdr,
        'To: <' . $to . '>',
        'Subject: ' . bsMimeHeader($subject),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'Auto-Submitted: auto-generated',
    ];
    return implode("\r\n", $h) . "\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
}

// Lähettää yhden viestin. Palauttaa null onnistuessa, muuten virheilmoituksen.
function bsSendMail(array $cfg, string $to, string $subject, string $body): ?string {
    if (!bsMailConfigured($cfg)) return 'Sähköpostia ei ole määritetty (mail_from puuttuu configista)';
    $to = trim(str_replace(["\r", "\n"], '', $to));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return 'Virheellinen vastaanottajan osoite';
    $from = bsParseAddress((string)$cfg['mail_from']);
    $msg = bsBuildMessage($from, $to, $subject, $body);
    if (!empty($cfg['smtp']['host'])) return bsSmtpSend($cfg['smtp'], $from[1], $to, $msg);
    // mail(): otsikot annetaan erikseen, joten poimitaan ne viestistä
    [$headers, $payload] = explode("\r\n\r\n", $msg, 2);
    $hdrs = array_filter(explode("\r\n", $headers), fn($l) => !preg_match('/^(To|Subject):/i', $l));
    $ok = @mail($to, bsMimeHeader($subject), $payload, implode("\r\n", $hdrs));
    return $ok ? null : 'mail() epäonnistui';
}

function bsSmtpRead($fp): array {   // [koodi, teksti]; lukee monirivisen vastauksen
    $text = ''; $code = 0;
    while (($line = fgets($fp, 1024)) !== false) {
        $text .= $line; $code = (int)substr($line, 0, 3);
        if (strlen($line) < 4 || $line[3] !== '-') break;
    }
    return [$code, $text];
}
function bsSmtpCmd($fp, string $cmd, array $ok): ?string {
    if ($cmd !== '') fwrite($fp, $cmd . "\r\n");
    [$code, $text] = bsSmtpRead($fp);
    return in_array($code, $ok, true) ? null : 'SMTP: ' . trim($text ?: 'ei vastausta');
}

function bsSmtpSend(array $smtp, string $fromAddr, string $to, string $message): ?string {
    $secure = $smtp['secure'] ?? 'tls'; $port = (int)($smtp['port'] ?? ($secure === 'ssl' ? 465 : 587));
    $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . $smtp['host'] . ':' . $port, $en, $es, 15);
    if (!$fp) return 'SMTP-yhteys epäonnistui';
    stream_set_timeout($fp, 15);
    $ehlo = 'EHLO ' . (preg_replace('/[^A-Za-z0-9.\-]/', '', $_SERVER['SERVER_NAME'] ?? gethostname() ?: 'localhost') ?: 'localhost');
    try {
        if ($e = bsSmtpCmd($fp, '', [220])) return $e;
        if ($e = bsSmtpCmd($fp, $ehlo, [250])) return $e;
        if ($secure === 'tls') {
            if ($e = bsSmtpCmd($fp, 'STARTTLS', [220])) return $e;
            if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) return 'SMTP: TLS-yhteys epäonnistui';
            if ($e = bsSmtpCmd($fp, $ehlo, [250])) return $e;
        }
        if (!empty($smtp['user'])) {
            if ($e = bsSmtpCmd($fp, 'AUTH LOGIN', [334])) return $e;
            if ($e = bsSmtpCmd($fp, base64_encode((string)$smtp['user']), [334])) return $e;
            if ($e = bsSmtpCmd($fp, base64_encode((string)($smtp['pass'] ?? '')), [235])) return 'SMTP: tunnistautuminen epäonnistui';
        }
        if ($e = bsSmtpCmd($fp, 'MAIL FROM:<' . $fromAddr . '>', [250])) return $e;
        if ($e = bsSmtpCmd($fp, 'RCPT TO:<' . $to . '>', [250, 251])) return $e;
        if ($e = bsSmtpCmd($fp, 'DATA', [354])) return $e;
        $data = preg_replace('/^\./m', '..', str_replace(["\r\n", "\r"], "\n", $message));   // dot-stuffing
        fwrite($fp, str_replace("\n", "\r\n", $data) . "\r\n.\r\n");
        [$code, $text] = bsSmtpRead($fp);
        if ($code !== 250) return 'SMTP: ' . trim($text);
        @bsSmtpCmd($fp, 'QUIT', [221]);
        return null;
    } finally { @fclose($fp); }
}
