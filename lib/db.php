<?php
// Tietokantayhteys: SQLite (oletus, ei palvelinta) tai MariaDB/MySQL.
//
// Koodi on kirjoitettu mysqli-rajapinnalle. SQLite-tuki toteutetaan yhteensopivuuskerroksella (BsSqliteConn,
// BsSqliteStmt, BsSqliteResult), joka tarjoaa saman rajapinnan (prepare, bind_param, execute, get_result, query,
// insert_id, affected_rows, ...) ja kääntää MySQL-kohtaiset SQL-rakenteet lennossa (ks. bsSqliteTranslate).
//
// config.php:
//   'db_driver' => 'sqlite', 'db_file' => '/polku/data/barshift.sqlite'      (oletus, jos db_host puuttuu)
//   'db_driver' => 'mysql',  'db_host' => ..., 'db_name' => ..., 'db_user' => ..., 'db_pass' => ...

function bsDbDriver(array $cfg): string {
    $d = strtolower((string)($cfg['db_driver'] ?? ''));
    if ($d === 'sqlite' || $d === 'mysql') return $d;
    return isset($cfg['db_host']) ? 'mysql' : 'sqlite';
}

function bsDbFile(array $cfg): string {
    $f = (string)($cfg['db_file'] ?? 'data/barshift.sqlite');
    return preg_match('#^(/|[A-Za-z]:[\\\\/])#', $f) ? $f : dirname(__DIR__) . '/' . $f;   // suhteellinen polku = sovelluksen juuresta
}

// Avaa yhteyden. Virhe: $conn->connect_error on asetettu (kuten mysqli:ssä).
function bsConnect(array $cfg) {
    if (bsDbDriver($cfg) === 'sqlite') {
        $c = new BsSqliteConn(bsDbFile($cfg), (string)($cfg['timezone'] ?? ''));
        return $c;
    }
    mysqli_report(MYSQLI_REPORT_OFF);
    $c = @new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
    if (!$c->connect_error) $c->set_charset('utf8mb4');
    return $c;
}

// Puuttuvien PHP-laajennusten kuvaus (tyhjä = kunnossa)
function bsDbMissingExtension(array $cfg): ?string {
    if (bsDbDriver($cfg) === 'sqlite') return extension_loaded('pdo_sqlite') ? null : 'PHP:n pdo_sqlite-laajennus puuttuu';
    return extension_loaded('mysqli') ? null : 'PHP:n mysqli-laajennus puuttuu';
}

// Jakaa tekstin ylätason pilkuilla (sulut ja lainausmerkit huomioiden)
function bsSplitTop(string $s, string $sep = ','): array {
    $out = []; $depth = 0; $q = ''; $buf = '';
    for ($i = 0, $n = strlen($s); $i < $n; $i++) {
        $c = $s[$i];
        if ($q !== '') { $buf .= $c; if ($c === '\\' && $i + 1 < $n) { $buf .= $s[++$i]; } elseif ($c === $q) { $q = ''; } continue; }
        if ($c === "'" || $c === '"' || $c === '`') { $q = $c; $buf .= $c; continue; }
        if ($c === '(') $depth++;
        if ($c === ')') $depth--;
        if ($c === $sep && $depth === 0) { $out[] = trim($buf); $buf = ''; continue; }
        $buf .= $c;
    }
    if (trim($buf) !== '') $out[] = trim($buf);
    return $out;
}

function bsIsSqlite($conn): bool { return $conn instanceof BsSqliteConn; }

// ---------------------------------------------------------------------------------------------------------------

class BsSqliteResult implements IteratorAggregate, Countable {
    public int $num_rows = 0;
    private array $rows;
    private int $pos = 0;
    public function __construct(array $rows) { $this->rows = $rows; $this->num_rows = count($rows); }
    public function fetch_assoc(): ?array { return $this->rows[$this->pos++] ?? null; }
    public function fetch_row(): ?array { $r = $this->rows[$this->pos++] ?? null; return $r === null ? null : array_values($r); }
    public function fetch_array(int $mode = 3): ?array {
        $r = $this->rows[$this->pos++] ?? null;
        if ($r === null) return null;
        return $mode === 1 ? $r : ($mode === 2 ? array_values($r) : $r + array_values($r));
    }
    public function fetch_all(int $mode = 2): array {
        $rest = array_slice($this->rows, $this->pos);
        $this->pos = count($this->rows);
        if ($mode === 1) return $rest;
        if ($mode === 2) return array_map('array_values', $rest);
        return array_map(fn($r) => $r + array_values($r), $rest);
    }
    public function free(): void {}
    public function close(): void {}
    public function count(): int { return $this->num_rows; }
    public function getIterator(): Iterator { return new ArrayIterator($this->rows); }
}

class BsSqliteStmt {
    public int $affected_rows = 0;
    public int $num_rows = 0;
    public int $errno = 0;
    public string $error = '';
    public int $insert_id = 0;
    private BsSqliteConn $conn;
    private PDOStatement $st;
    private string $sql;
    private string $types = '';
    private array $refs = [];
    private array $rows = [];
    private bool $hasResult = false;

    public function __construct(BsSqliteConn $conn, PDOStatement $st, string $sql) { $this->conn = $conn; $this->st = $st; $this->sql = $sql; }

    public function bind_param(string $types, &...$vars): bool {
        $this->types = $types;
        $this->refs = [];
        foreach ($vars as $i => &$v) $this->refs[$i] = &$v;   // viittaukset: arvo luetaan vasta execute():ssa (kuten mysqli)
        return true;
    }

    public function execute(?array $params = null): bool {
        $this->errno = 0; $this->error = '';
        try {
            $this->st->closeCursor();
            if ($params === null) {
                foreach ($this->refs as $i => $v) {
                    $t = $this->types[$i] ?? 's';
                    if ($v === null) { $this->st->bindValue($i + 1, null, PDO::PARAM_NULL); }
                    elseif ($t === 'i') { $this->st->bindValue($i + 1, (int)$v, PDO::PARAM_INT); }
                    elseif ($t === 'd') { $this->st->bindValue($i + 1, (float)$v); }
                    elseif ($t === 'b') { $this->st->bindValue($i + 1, (string)$v, PDO::PARAM_LOB); }
                    else { $this->st->bindValue($i + 1, (string)$v); }
                }
                $this->st->execute();
            } else {
                $this->st->execute($params);
            }
        } catch (PDOException $e) {
            $this->conn->noteError($e, $this);
            return false;
        }
        if ($this->st->columnCount() > 0) {
            $this->rows = $this->st->fetchAll(PDO::FETCH_ASSOC);
            $this->st->closeCursor();
            $this->hasResult = true;
            $this->num_rows = count($this->rows);
            $this->affected_rows = -1;
        } else {
            $this->rows = []; $this->hasResult = false; $this->num_rows = 0;
            $this->affected_rows = $this->st->rowCount();
            $this->st->closeCursor();
            if (preg_match('/^\s*(INSERT|REPLACE)\b/i', $this->sql)) {
                $this->conn->insert_id = $this->affected_rows > 0 ? (int)$this->conn->pdo->lastInsertId() : 0;
                $this->insert_id = $this->conn->insert_id;
            }
        }
        $this->conn->affected_rows = $this->affected_rows;
        return true;
    }

    public function get_result() { return new BsSqliteResult($this->hasResult ? $this->rows : []); }
    public function store_result(): bool { return true; }
    public function free_result(): void {}
    public function close(): bool { return true; }
}

class BsSqliteConn {
    public ?string $connect_error = null;
    public int $connect_errno = 0;
    public int $errno = 0;
    public string $error = '';
    public int $insert_id = 0;
    public int $affected_rows = 0;
    public ?PDO $pdo = null;
    public DateTimeZone $tz;
    private array $conflictCache = [];
    public bool $inTx = false;
    public string $file;

    public function __construct(string $file, string $tzName = '') {
        $this->file = $file;
        try { $this->tz = new DateTimeZone($tzName !== '' ? $tzName : date_default_timezone_get()); }
        catch (Exception $e) { $this->tz = new DateTimeZone('UTC'); }
        try {
            $dir = dirname($file);
            if (!is_dir($dir)) @mkdir($dir, 0750, true);
            $this->pdo = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10]);
            $this->pdo->exec('PRAGMA busy_timeout = 8000');
            $this->pdo->exec('PRAGMA foreign_keys = ON');
            try { $this->pdo->exec('PRAGMA journal_mode = WAL'); } catch (PDOException $e) {}
            $this->pdo->exec('PRAGMA synchronous = NORMAL');
            $this->registerFunctions();
        } catch (Throwable $e) {
            $this->connect_error = $e->getMessage();
            $this->connect_errno = 2002;
        }
    }

    // ---- mysqli-yhteensopiva rajapinta ----
    public function set_charset(string $cs): bool { return true; }
    public function close(): bool { return true; }
    public function real_escape_string(string $s): string { return str_replace("'", "''", $s); }
    public function begin_transaction(): bool {
        try { $this->pdo->exec('BEGIN IMMEDIATE'); $this->inTx = true; return true; }
        catch (PDOException $e) { $this->noteError($e); return false; }
    }
    public function commit(): bool { return $this->endTx('COMMIT'); }
    public function rollback(): bool { return $this->endTx('ROLLBACK'); }
    private function endTx(string $cmd): bool {
        if (!$this->inTx) return true;
        try { $this->pdo->exec($cmd); $this->inTx = false; return true; }
        catch (PDOException $e) { $this->noteError($e); return false; }
    }

    public function prepare(string $sql) {
        $this->errno = 0; $this->error = '';
        $special = $this->special($sql);
        if ($special !== null) $sql = $special;
        try {
            $st = $this->pdo->prepare(bsSqliteTranslate($sql, $this));
            return new BsSqliteStmt($this, $st, $sql);
        } catch (PDOException $e) { $this->noteError($e); return false; }
    }

    public function query(string $sql) {
        $this->errno = 0; $this->error = '';
        if (preg_match('/^\s*SET\s+time_zone\s*=\s*\'?([+\-0-9:A-Za-z\/_]+)\'?\s*$/i', $sql, $m)) {
            try { $this->tz = new DateTimeZone($m[1]); } catch (Exception $e) {}
            return true;
        }
        if (preg_match('/^\s*SET\s+(NAMES|FOREIGN_KEY_CHECKS|SQL_MODE|SESSION|autocommit)\b/i', $sql)) {
            if (preg_match('/^\s*SET\s+FOREIGN_KEY_CHECKS\s*=\s*(\d)/i', $sql, $m)) { try { $this->pdo->exec('PRAGMA foreign_keys = ' . ($m[1] ? 'ON' : 'OFF')); } catch (PDOException $e) {} }
            return true;
        }
        $st = $this->prepare($sql);
        if (!$st || !$st->execute()) {
            if ($st) { $this->errno = $st->errno; $this->error = $st->error; }
            return false;
        }
        if ($st->num_rows > 0 || $st->affected_rows === -1) return $st->get_result();
        return true;
    }

    // Useita lauseita (schema, migraatiot)
    public function exec_script(string $sql): ?string {
        try { $this->pdo->exec($sql); return null; }
        catch (PDOException $e) { $this->noteError($e); return $e->getMessage(); }
    }

    private function special(string $sql): ?string {
        if (preg_match('/^\s*SHOW\s+TABLES\s+LIKE\s+(\'[^\']*\')\s*$/i', $sql, $m)) {
            return "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE " . $m[1];
        }
        return null;
    }

    // MySQL-virhekoodit niille, joita sovellus tunnistaa (ks. dbError, bsRunMigrationFile)
    public function noteError(PDOException $e, ?BsSqliteStmt $st = null): void {
        $msg = $e->getMessage();
        $code = 1064;
        if (stripos($msg, 'no such column') !== false || stripos($msg, 'has no column named') !== false) $code = 1054;
        elseif (stripos($msg, 'no such table') !== false) $code = 1146;
        elseif (stripos($msg, 'duplicate column name') !== false) $code = 1060;
        elseif (stripos($msg, 'already exists') !== false) $code = stripos($msg, 'index') !== false ? 1061 : 1050;
        elseif (stripos($msg, 'UNIQUE constraint') !== false || stripos($msg, 'PRIMARY KEY') !== false) $code = 1062;
        elseif (stripos($msg, 'FOREIGN KEY') !== false) $code = 1452;
        elseif (stripos($msg, 'NOT NULL') !== false) $code = 1048;
        elseif (stripos($msg, 'locked') !== false || stripos($msg, 'busy') !== false) $code = 1205;
        $this->errno = $code; $this->error = $msg;
        if ($st) { $st->errno = $code; $st->error = $msg; }
    }

    // Konfliktikohde ON DUPLICATE KEY -käännöstä varten: taulun uniikki-indeksi, jonka sarakkeet kaikki ovat INSERT-listassa
    public function conflictTarget(string $table, array $cols): ?string {
        $key = $table . '|' . implode(',', $cols);
        if (array_key_exists($key, $this->conflictCache)) return $this->conflictCache[$key];
        $found = null;
        try {
            $lc = array_map('strtolower', $cols);
            $pk = []; $defaults = [];
            foreach ($this->pdo->query('PRAGMA table_info(`' . str_replace('`', '', $table) . '`)')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                if ((int)$r['pk'] > 0) $pk[(int)$r['pk']] = $r['name'];
                if ($r['dflt_value'] !== null) $defaults[strtolower($r['name'])] = true;
            }
            ksort($pk);
            $cands = $pk ? [array_values($pk)] : [];
            foreach ($this->pdo->query('PRAGMA index_list(`' . str_replace('`', '', $table) . '`)')->fetchAll(PDO::FETCH_ASSOC) as $ix) {
                if (!(int)$ix['unique']) continue;
                $names = array_map(fn($r) => $r['name'], $this->pdo->query('PRAGMA index_info(' . $this->pdo->quote($ix['name']) . ')')->fetchAll(PDO::FETCH_ASSOC));
                if ($names) $cands[] = $names;
            }
            // Avain voi puuttua INSERT-listasta, jos sarakkeella on oletusarvo (esim. yhden rivin taulun id DEFAULT 1)
            foreach ($cands as $names) {
                if (!array_diff(array_map('strtolower', $names), array_merge($lc, array_keys($defaults)))) { $found = '(' . implode(', ', array_map(fn($n) => '`' . $n . '`', $names)) . ')'; break; }
            }
        } catch (PDOException $e) {}
        return $this->conflictCache[$key] = $found;
    }

    public function now(): string { return (new DateTime('now', $this->tz))->format('Y-m-d H:i:s'); }

    private function registerFunctions(): void {
        $conn = $this;
        $def = function (string $name, callable $fn, int $n = -1) {
            if (method_exists($this->pdo, 'createFunction')) $this->pdo->createFunction($name, $fn, $n);
            else $this->pdo->sqliteCreateFunction($name, $fn, $n);
        };
        $def('NOW', fn() => $conn->now(), 0);
        $def('CURDATE', fn() => substr($conn->now(), 0, 10), 0);
        $def('BS_DATEADD', fn($base, $n, $unit) => bsSqliteDateAdd($base, $n, (string)$unit), 3);
        $def('TIMESTAMP', function ($d, $t = null) {
            if ($d === null) return null;
            $d = (string)$d;
            if ($t === null) return $d;
            $neg = ($t[0] ?? '') === '-'; $p = explode(':', ltrim((string)$t, '-'));
            $sec = ((int)($p[0] ?? 0)) * 3600 + ((int)($p[1] ?? 0)) * 60 + (int)($p[2] ?? 0);
            try { $x = new DateTime(strlen($d) > 10 ? $d : $d . ' 00:00:00'); } catch (Exception $e) { return null; }
            $x->modify(($neg ? '-' : '+') . $sec . ' seconds');
            return $x->format('Y-m-d H:i:s');
        }, -1);
        $def('SIN', fn($x) => $x === null ? null : sin((float)$x), 1);
        $def('ELT', function ($n, ...$a) { $n = (int)$n; return ($n >= 1 && $n <= count($a)) ? $a[$n - 1] : null; });
        $def('WEEKDAY', fn($d) => $d === null ? null : ((int)date_create(substr((string)$d, 0, 10))->format('N')) - 1, 1);
        $def('DAYOFWEEK', fn($d) => $d === null ? null : ((int)date_create(substr((string)$d, 0, 10))->format('w')) + 1, 1);
        $def('MONTH', fn($d) => $d === null ? null : (int)substr((string)$d, 5, 2), 1);
        $def('YEAR', fn($d) => $d === null ? null : (int)substr((string)$d, 0, 4), 1);
        $def('DAY', fn($d) => $d === null ? null : (int)substr((string)$d, 8, 2), 1);
        $def('TIME_TO_SEC', function ($t) {
            if ($t === null || $t === '') return null;
            $neg = $t[0] === '-'; $p = explode(':', ltrim((string)$t, '-'));
            $s = ((int)($p[0] ?? 0)) * 3600 + ((int)($p[1] ?? 0)) * 60 + (float)($p[2] ?? 0);
            return (float)($neg ? -$s : $s);
        }, 1);
        $def('MOD', function ($a, $b) {
            if ($a === null || $b === null || (float)$b == 0.0) return null;
            return (is_int($a) && is_int($b)) ? $a % $b : fmod((float)$a, (float)$b);
        }, 2);
        $def('DATEDIFF', function ($a, $b) {
            if ($a === null || $b === null) return null;
            $x = date_create(substr((string)$a, 0, 10)); $y = date_create(substr((string)$b, 0, 10));
            return ($x && $y) ? (int)round(($x->getTimestamp() - $y->getTimestamp()) / 86400) : null;
        }, 2);
        $def('CONCAT', function (...$a) { foreach ($a as $v) if ($v === null) return null; return implode('', array_map('strval', $a)); });
        $def('RIGHT', fn($s, $n) => $s === null ? null : mb_substr((string)$s, -max(0, (int)$n)), 2);
        $def('LEFT', fn($s, $n) => $s === null ? null : mb_substr((string)$s, 0, max(0, (int)$n)), 2);
        $def('REGEXP_REPLACE', fn($s, $p, $r) => $s === null ? null : preg_replace('/' . str_replace('/', '\/', (string)$p) . '/u', (string)$r, (string)$s), 3);
        $def('REGEXP', fn($p, $s) => $s === null ? null : (int)preg_match('/' . str_replace('/', '\/', (string)$p) . '/iu', (string)$s), 2);
        $def('DATE_FORMAT', 'bsSqliteDateFormat', 2);
        $def('GREATEST', function (...$a) { $a = array_filter($a, fn($v) => $v !== null); return $a ? max($a) : null; });
        $def('LEAST', function (...$a) { $a = array_filter($a, fn($v) => $v !== null); return $a ? min($a) : null; });
        $def('IF', fn($c, $a, $b) => $c ? $a : $b, 3);
        $def('LOWER', fn($s) => $s === null ? null : mb_strtolower((string)$s), 1);
        $def('UPPER', fn($s) => $s === null ? null : mb_strtoupper((string)$s), 1);
        $likeFn = function ($pat, $s, $esc = '\\') {
            if ($pat === null || $s === null) return null;
            $re = '';
            $pat = (string)$pat;
            for ($i = 0, $n = mb_strlen($pat); $i < $n; $i++) {
                $ch = mb_substr($pat, $i, 1);
                if ($ch === $esc && $i + 1 < $n) { $re .= preg_quote(mb_substr($pat, ++$i, 1), '/'); }
                elseif ($ch === '%') $re .= '.*';
                elseif ($ch === '_') $re .= '.';
                else $re .= preg_quote($ch, '/');
            }
            return (int)preg_match('/^' . $re . '$/isu', (string)$s);
        };
        $def('LIKE', $likeFn, 2);
        $def('LIKE', $likeFn, 3);
        $locks = [];
        $def('GET_LOCK', function ($name, $timeout) use (&$locks, $conn) {
            $f = sys_get_temp_dir() . '/bs_lock_' . substr(hash('sha256', $conn->file . '|' . $name), 0, 24);
            $h = @fopen($f, 'c');
            if (!$h) return 1;
            $deadline = microtime(true) + max(0, (int)$timeout);
            while (!flock($h, LOCK_EX | LOCK_NB)) {
                if (microtime(true) >= $deadline) { fclose($h); return 0; }
                usleep(50000);
            }
            $locks[$name] = $h;
            return 1;
        }, 2);
        $def('RELEASE_LOCK', function ($name) use (&$locks) {
            if (isset($locks[$name])) { flock($locks[$name], LOCK_UN); fclose($locks[$name]); unset($locks[$name]); return 1; }
            return null;
        }, 1);
    }
}

function bsSqliteDateAdd($base, $n, string $unit): ?string {
    if ($base === null || $n === null) return null;
    $base = (string)$base;
    $hasTime = strlen($base) > 10;
    try { $d = new DateTime($base); } catch (Exception $e) { return null; }
    $n = (int)$n; $unit = strtoupper($unit);
    if ($unit === 'MONTH' || $unit === 'YEAR') {
        $months = $unit === 'YEAR' ? $n * 12 : $n;
        $y = (int)$d->format('Y'); $m = (int)$d->format('n') - 1 + $months; $day = (int)$d->format('j');
        $y += intdiv($m - ($m < 0 ? 11 : 0), 12); $m = (($m % 12) + 12) % 12 + 1;
        $day = min($day, (int)cal_days_in_month(CAL_GREGORIAN, $m, $y));
        $d->setDate($y, $m, $day);
    } else {
        $mult = ['SECOND' => 1, 'MINUTE' => 60, 'HOUR' => 3600, 'DAY' => 86400, 'WEEK' => 604800][$unit] ?? 0;
        $d->modify(($n * $mult >= 0 ? '+' : '') . ($n * $mult) . ' seconds');
    }
    return $d->format($hasTime ? 'Y-m-d H:i:s' : 'Y-m-d');
}

function bsSqliteDateFormat($d, $fmt): ?string {
    if ($d === null) return null;
    try { $t = new DateTime((string)$d); } catch (Exception $e) { return null; }
    $map = ['%Y' => 'Y', '%y' => 'y', '%m' => 'm', '%c' => 'n', '%d' => 'd', '%e' => 'j', '%H' => 'H', '%i' => 'i', '%s' => 's', '%S' => 's', '%T' => 'H:i:s', '%M' => 'F', '%b' => 'M', '%a' => 'D', '%W' => 'l', '%%' => '\%'];
    $out = '';
    for ($i = 0, $n = strlen((string)$fmt); $i < $n; $i++) {
        $two = substr((string)$fmt, $i, 2);
        if (isset($map[$two])) { $out .= $t->format($map[$two] === '\%' ? '\%' : $map[$two]); $i++; }
        else $out .= (string)$fmt[$i];
    }
    return $out;
}

// MySQL-lauseen kääntö SQLiteksi. Kattaa sovelluksen käyttämät rakenteet; tuntemattomat jäävät ennalleen
// (SQLite antaa niistä syntaksivirheen, jonka testit paljastavat).
function bsSqliteTranslate(string $sql, BsSqliteConn $conn): string {
    $s = $sql;
    if (stripos($s, 'INSERT IGNORE') !== false) $s = preg_replace('/\bINSERT\s+IGNORE\b/i', 'INSERT OR IGNORE', $s);

    // INTERVAL: NOW() - INTERVAL 15 MINUTE, CURDATE() + INTERVAL ? DAY, DATE_ADD(x, INTERVAL n UNIT), DATE_SUB(...)
    if (stripos($s, 'INTERVAL') !== false) {
        $unit = '(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)S?';
        // DATE_ADD(x, INTERVAL n UNIT) / DATE_SUB(...): n voi olla mikä tahansa lauseke
        $guard = 0;
        while ($guard++ < 200 && preg_match('/\bDATE_(ADD|SUB)\s*\(/i', $s, $m, PREG_OFFSET_CAPTURE)) {
            $start = $m[0][1]; $open = $start + strlen($m[0][0]) - 1; $depth = 0; $end = null;
            for ($i = $open, $n = strlen($s); $i < $n; $i++) {
                if ($s[$i] === '(') $depth++;
                elseif ($s[$i] === ')' && --$depth === 0) { $end = $i; break; }
            }
            $parts = $end === null ? [] : bsSplitTop(substr($s, $open + 1, $end - $open - 1));
            if (count($parts) !== 2 || !preg_match('/^INTERVAL\s+(.+?)\s+' . $unit . '$/is', $parts[1], $x)) break;
            $n = strtoupper($m[1][0]) === 'SUB' ? '-(' . $x[1] . ')' : '(' . $x[1] . ')';
            $s = substr($s, 0, $start) . "BS_DATEADD({$parts[0]}, $n, '" . strtoupper($x[2]) . "')" . substr($s, $end + 1);
        }
        $s = preg_replace_callback('/(NOW\(\)|CURDATE\(\))\s*([+\-])\s*INTERVAL\s+(\?|\d+|\w+)\s+' . $unit . '\b/i', function ($m) {
            $n = $m[2] === '-' ? '-(' . $m[3] . ')' : $m[3];
            return "BS_DATEADD({$m[1]}, $n, '" . strtoupper($m[4]) . "')";
        }, $s);
    }

    // ON DUPLICATE KEY UPDATE a = VALUES(a) -> ON CONFLICT (...) DO UPDATE SET a = excluded.a
    if (($p = stripos($s, 'ON DUPLICATE KEY UPDATE')) !== false) {
        $head = substr($s, 0, $p); $tail = substr($s, $p + strlen('ON DUPLICATE KEY UPDATE'));
        $tail = preg_replace('/\bVALUES\(\s*`?(\w+)`?\s*\)/i', 'excluded.`$1`', $tail);
        $target = '';
        if (preg_match('/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+`?(\w+)`?\s*\(([^)]*)\)/i', $head, $m)) {
            $cols = array_map(fn($c) => trim($c, " `\t\r\n"), explode(',', $m[2]));
            $t = $conn->conflictTarget($m[1], $cols);
            if ($t !== null) $target = ' ' . $t;
        }
        // INSERT ... SELECT vaatii WHERE-ehdon jäsennyksen selventämiseksi
        if (preg_match('/\bSELECT\b/i', $head) && !preg_match('/\bWHERE\b[^)]*$/i', $head)) $head = rtrim($head) . ' WHERE 1 ';
        $s = $head . 'ON CONFLICT' . $target . ' DO UPDATE SET' . $tail;
    }

    // DELETE x FROM t x JOIN ... -> DELETE FROM t WHERE rowid IN (SELECT x.rowid FROM t x JOIN ...)
    if (preg_match('/^\s*DELETE\s+(\w+)\s+FROM\s+`?(\w+)`?\s+(?:AS\s+)?\1\b(.*)$/is', $s, $m)) {
        $s = "DELETE FROM {$m[2]} WHERE rowid IN (SELECT {$m[1]}.rowid FROM {$m[2]} {$m[1]}{$m[3]})";
    }

    $s = preg_replace('/\s+FOR\s+UPDATE\s*$/i', '', $s);
    return $s;
}
