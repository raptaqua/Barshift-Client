<?php
// Löytää PHP-koodista kutsutut funktiot, joita ei ole määritelty (eikä ole PHP:n omia): estää "kadonnut funktio" -virheet, jotka näkyvät vasta ajossa.
$files = array_merge(['api.php', 'cron.php', 'migrate.php', 'install.php'], glob('lib/*.php'), glob('db/*.php'), glob('tools/*.php'));
$defined = array_fill_keys(array_map('strtolower', get_defined_functions()['internal']), true);
$calls = []; foreach (['fastcgi_finish_request', 'apache_request_headers'] as $sapi) $defined[$sapi] = true;   // vain tietyissä SAPI:issa, kutsut suojattu function_exists():llä
foreach ($files as $f) {
    if (!is_file($f)) continue;
    $tokens = token_get_all(file_get_contents($f));
    for ($i = 0, $n = count($tokens); $i < $n; $i++) {
        $t = $tokens[$i];
        if (is_array($t) && $t[0] === T_FUNCTION) {   // function nimi( ...   (ei nimettömiä)
            for ($j = $i + 1; $j < $n && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE; $j++);
            if ($j < $n && $tokens[$j] === '&') for ($j++; $j < $n && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE; $j++);
            if ($j < $n && is_array($tokens[$j]) && $tokens[$j][0] === T_STRING) $defined[strtolower($tokens[$j][1])] = true;
        }
    }
}
foreach ($files as $f) {
    if (!is_file($f)) continue;
    $tokens = array_values(array_filter(token_get_all(file_get_contents($f)), fn($t) => !is_array($t) || !in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)));
    for ($i = 1, $n = count($tokens); $i < $n - 1; $i++) {
        if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_STRING || $tokens[$i + 1] !== '(') continue;
        $prev = $tokens[$i - 1];
        if (is_array($prev) && in_array($prev[0], [T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_FUNCTION, T_NEW, T_NULLSAFE_OBJECT_OPERATOR], true)) continue;
        if ($prev === '&' && is_array($tokens[$i - 2] ?? null) && $tokens[$i - 2][0] === T_FUNCTION) continue;
        $name = strtolower($tokens[$i][1]);
        if (!isset($defined[$name])) $calls[$name][] = $f . ':' . $tokens[$i][2];
    }
}
if ($calls) { foreach ($calls as $n => $where) echo "FAIL: määrittelemätön funktio $n() – " . implode(', ', array_slice(array_unique($where), 0, 3)) . "\n"; exit(1); }
echo "ok: kaikki kutsutut PHP-funktiot on määritelty\n";
