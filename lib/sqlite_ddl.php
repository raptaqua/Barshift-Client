<?php
require_once __DIR__ . '/db.php';
// MySQL/MariaDB-skeeman (db/schema.sql, db/migrations/*.sql) käännös SQLiteksi.
// Tuettu: CREATE TABLE (sarakkeet, PRIMARY/UNIQUE/KEY, FOREIGN KEY, ENUM, ON UPDATE CURRENT_TIMESTAMP), CREATE [UNIQUE] INDEX,
// ALTER TABLE ... ADD [COLUMN] / ADD INDEX / ADD UNIQUE / DROP COLUMN / DROP INDEX sekä tavalliset INSERT/UPDATE/DELETE.
// Muu (esim. MODIFY, ADD FOREIGN KEY) vaatii migraation rinnalle käsin kirjoitetun NNNN_nimi.sqlite.sql-tiedoston.

function bsStripSqlComments(string $sql): string {
    $out = ''; $q = '';
    for ($i = 0, $n = strlen($sql); $i < $n; $i++) {
        $c = $sql[$i];
        if ($q !== '') { $out .= $c; if ($c === '\\' && $i + 1 < $n) $out .= $sql[++$i]; elseif ($c === $q) $q = ''; continue; }
        if ($c === "'" || $c === '"' || $c === '`') { $q = $c; $out .= $c; continue; }
        if ($c === '-' && ($sql[$i + 1] ?? '') === '-' && in_array($sql[$i + 2] ?? "\n", [' ', "\t", "\n", "\r"], true)) { while ($i < $n && $sql[$i] !== "\n") $i++; $out .= "\n"; continue; }
        if ($c === '#') { while ($i < $n && $sql[$i] !== "\n") $i++; $out .= "\n"; continue; }
        if ($c === '/' && ($sql[$i + 1] ?? '') === '*') { $e = strpos($sql, '*/', $i + 2); $i = $e === false ? $n : $e + 1; continue; }
        $out .= $c;
    }
    return $out;
}

function bsSqlStatements(string $sql): array {
    return array_values(array_filter(bsSplitTop(bsStripSqlComments($sql), ';'), fn($s) => trim($s) !== ''));
}

function bsQi(string $id): string { return '`' . trim($id, " `\"") . '`'; }

// Yksi sarakemäärittely -> [sqlite-sarake, tiedot]
function bsDdlColumn(string $def): array {
    if (!preg_match('/^`?(\w+)`?\s+(\w+)\s*(\((?:[^()]|\([^()]*\))*\))?\s*(.*)$/s', trim($def), $m)) throw new RuntimeException('Sarakemäärittelyä ei tunnistettu: ' . $def);
    [, $name, $type, $args, $rest] = $m + [3 => '', 4 => ''];
    $type = strtolower($type); $rest = trim($rest);
    $info = ['name' => $name, 'auto' => false, 'onUpdate' => false, 'int' => false];
    $coll = '';
    $check = '';
    if (in_array($type, ['int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint', 'bit', 'bool', 'boolean'], true)) { $sty = 'INTEGER'; $info['int'] = true; }
    elseif (in_array($type, ['decimal', 'numeric', 'float', 'double', 'real'], true)) $sty = 'REAL';
    elseif (in_array($type, ['varchar', 'char', 'tinytext'], true)) { $sty = 'TEXT'; $coll = ' COLLATE NOCASE'; }
    elseif (in_array($type, ['text', 'mediumtext', 'longtext', 'json'], true)) { $sty = 'TEXT'; $coll = ' COLLATE NOCASE'; }
    elseif (in_array($type, ['blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary'], true)) $sty = 'BLOB';
    elseif (in_array($type, ['date', 'time', 'datetime', 'timestamp', 'year'], true)) $sty = 'TEXT';
    elseif ($type === 'enum' || $type === 'set') {
        $sty = 'TEXT'; $coll = ' COLLATE NOCASE';
        if ($type === 'enum') $check = ' CHECK (' . bsQi($name) . ' IN ' . $args . ')';
    } else throw new RuntimeException("Tuntematon sarakkeen tyyppi '$type' ($name)");

    $rest = preg_replace('/\bUNSIGNED\b/i', '', $rest);
    $rest = preg_replace('/\bCHARACTER\s+SET\s+\w+/i', '', $rest);
    $rest = preg_replace('/\bCOLLATE\s+\w+/i', '', $rest);
    $rest = preg_replace("/\\bCOMMENT\\s+'(?:[^'\\\\]|\\\\.|'')*'/i", '', $rest);
    if (preg_match('/\bON\s+UPDATE\s+(?:current_timestamp|now)\s*(?:\(\s*\d*\s*\))?/i', $rest)) { $info['onUpdate'] = true; $rest = preg_replace('/\bON\s+UPDATE\s+(?:current_timestamp|now)\s*(?:\(\s*\d*\s*\))?/i', '', $rest); }
    if (preg_match('/\bAUTO_INCREMENT\b/i', $rest)) { $info['auto'] = true; $rest = preg_replace('/\bAUTO_INCREMENT\b/i', '', $rest); }
    $notNull = preg_match('/\bNOT\s+NULL\b/i', $rest) ? ' NOT NULL' : '';
    $default = '';
    if (preg_match('/\bDEFAULT\s+((?:\'(?:[^\'\\\\]|\\\\.|\'\')*\')|(?:[\w.+\-]+(?:\s*\(\s*\d*\s*\))?))/i', $rest, $dm)) {
        $dv = $dm[1];
        if (preg_match('/^(current_timestamp|now|current_date)\s*(\(\s*\d*\s*\))?$/i', $dv)) $default = ' DEFAULT (NOW())';
        elseif (strcasecmp($dv, 'NULL') === 0) $default = ' DEFAULT NULL';
        else $default = ' DEFAULT ' . $dv;
    }
    $info['sql'] = bsQi($name) . ' ' . $sty . $coll . $notNull . $default . $check;
    $info['type'] = $sty;
    return $info;
}

// CREATE TABLE -> [lauseet]
function bsDdlCreateTable(string $stmt): array {
    if (!preg_match('/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\((.*)\)\s*(?:ENGINE|DEFAULT|CHARSET|COLLATE|AUTO_INCREMENT|ROW_FORMAT|COMMENT)?[^)]*$/is', $stmt, $m)) throw new RuntimeException('CREATE TABLE ei jäsenny: ' . substr($stmt, 0, 80));
    $table = $m[1];
    $cols = []; $pk = []; $fks = []; $extra = []; $infos = [];
    foreach (bsSplitTop($m[2]) as $el) {
        if (preg_match('/^PRIMARY\s+KEY\s*\((.*)\)$/is', $el, $x)) { $pk = array_map(fn($c) => preg_replace('/\(\d+\)$/', '', trim($c, " `")), bsSplitTop($x[1])); continue; }
        if (preg_match('/^(UNIQUE)\s+(?:KEY|INDEX)?\s*`?(\w+)?`?\s*\((.*)\)$/is', $el, $x) || preg_match('/^()(?:KEY|INDEX)\s+`?(\w+)`?\s*\((.*)\)$/is', $el, $x)) {
            $icols = implode(', ', array_map(fn($c) => bsQi(preg_replace('/\(\d+\)$/', '', trim($c, " `"))) , bsSplitTop($x[3])));
            $iname = $table . '__' . ($x[2] !== '' ? $x[2] : 'u' . count($extra));
            $extra[] = 'CREATE ' . (strtoupper($x[1]) === 'UNIQUE' ? 'UNIQUE ' : '') . 'INDEX IF NOT EXISTS ' . bsQi($iname) . ' ON ' . bsQi($table) . ' (' . $icols . ')';
            continue;
        }
        if (preg_match('/^(?:CONSTRAINT\s+`?\w+`?\s+)?FOREIGN\s+KEY\s*\((.*?)\)\s*REFERENCES\s+`?(\w+)`?\s*\((.*?)\)(.*)$/is', $el, $x)) {
            $fk = 'FOREIGN KEY (' . implode(', ', array_map('bsQi', bsSplitTop($x[1]))) . ') REFERENCES ' . bsQi($x[2]) . ' (' . implode(', ', array_map('bsQi', bsSplitTop($x[3]))) . ')';
            if (preg_match('/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i', $x[4], $d)) $fk .= ' ON DELETE ' . strtoupper(preg_replace('/\s+/', ' ', $d[1]));
            if (preg_match('/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i', $x[4], $d)) $fk .= ' ON UPDATE ' . strtoupper(preg_replace('/\s+/', ' ', $d[1]));
            $fks[] = $fk; continue;
        }
        if (preg_match('/^(FULLTEXT|SPATIAL|CHECK)\b/i', $el)) continue;
        $info = bsDdlColumn($el);
        $infos[$info['name']] = $info;
        $cols[$info['name']] = $info['sql'];
    }
    // PRIMARY KEY
    if (count($pk) === 1 && isset($infos[$pk[0]]) && $infos[$pk[0]]['int']) {
        $n = $pk[0];
        // AUTO_INCREMENT: rowid-alias (INTEGER PRIMARY KEY AUTOINCREMENT). Muuten tavallinen sarake (INT), jotta DEFAULT toimii
        $cols[$n] = $infos[$n]['auto']
            ? bsQi($n) . ' INTEGER PRIMARY KEY AUTOINCREMENT' . preg_replace('/^`\w+`\s+INTEGER( NOT NULL)?/', '', $infos[$n]['sql'])
            : preg_replace('/^(`\w+`)\s+INTEGER/', '$1 INT', $infos[$n]['sql']) . ' PRIMARY KEY';
        $pk = [];
    } elseif (count($pk) === 1 && isset($cols[$pk[0]])) {
        $cols[$pk[0]] .= ' PRIMARY KEY';
        $pk = [];
    }
    $body = array_values($cols);
    if ($pk) $body[] = 'PRIMARY KEY (' . implode(', ', array_map('bsQi', $pk)) . ')';
    foreach ($fks as $fk) $body[] = $fk;
    $out = ['CREATE TABLE IF NOT EXISTS ' . bsQi($table) . " (\n  " . implode(",\n  ", $body) . "\n)"];
    foreach ($extra as $e) $out[] = $e;
    foreach ($infos as $i) {
        if ($i['onUpdate']) {
            $c = bsQi($i['name']);
            $out[] = 'CREATE TRIGGER IF NOT EXISTS ' . bsQi($table . '__' . $i['name'] . '_upd') . ' AFTER UPDATE ON ' . bsQi($table) . " FOR EACH ROW WHEN NEW.$c IS OLD.$c BEGIN UPDATE " . bsQi($table) . " SET $c = NOW() WHERE rowid = NEW.rowid; END";
        }
    }
    return $out;
}

// Yksi MySQL-lause -> SQLite-lauseet (tyhjä = ohitetaan)
function bsDdlStatement(string $stmt): array {
    $stmt = trim($stmt);
    if ($stmt === '' || preg_match('/^(SET|USE|LOCK|UNLOCK)\b/i', $stmt)) return [];
    if (preg_match('/^CREATE\s+TABLE\b/i', $stmt)) return bsDdlCreateTable($stmt);
    if (preg_match('/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s+ON\s+`?(\w+)`?\s*\((.*)\)\s*$/is', $stmt, $m)) {
        $cols = implode(', ', array_map(fn($c) => bsQi(preg_replace('/\(\d+\)$/', '', trim($c, " `"))), bsSplitTop($m[4])));
        return ['CREATE ' . ($m[1] ? 'UNIQUE ' : '') . 'INDEX IF NOT EXISTS ' . bsQi($m[3] . '__' . $m[2]) . ' ON ' . bsQi($m[3]) . ' (' . $cols . ')'];
    }
    if (preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+(.*)$/is', $stmt, $m)) {
        $table = $m[1]; $out = [];
        foreach (bsSplitTop($m[2]) as $a) {
            if (preg_match('/^ADD\s+(?:COLUMN\s+)?\(?(?!(?:UNIQUE|INDEX|KEY|PRIMARY|CONSTRAINT|FOREIGN|FULLTEXT)\b)(.*?)\)?$/is', $a, $x) && !preg_match('/^ADD\s+(UNIQUE|INDEX|KEY|PRIMARY|CONSTRAINT|FOREIGN|FULLTEXT)\b/i', $a)) {
                $defs = preg_match('/^ADD\s+\(/i', $a) ? bsSplitTop($x[1]) : [$x[1]];
                foreach ($defs as $d) {
                    $d = preg_replace('/\s+(AFTER|FIRST)\b.*$/is', '', $d);
                    $c = bsDdlColumn($d);
                    $sql = $c['sql'];
                    // SQLite: ADD COLUMN NOT NULL vaatii oletusarvon, eikä DEFAULT (NOW()) ole sallittu
                    if (stripos($sql, 'DEFAULT (NOW())') !== false) $sql = str_replace(' NOT NULL', '', str_replace('DEFAULT (NOW())', 'DEFAULT NULL', $sql));
                    elseif (stripos($sql, ' NOT NULL') !== false && stripos($sql, ' DEFAULT ') === false) $sql = str_replace(' NOT NULL', '', $sql);
                    $out[] = 'ALTER TABLE ' . bsQi($table) . ' ADD COLUMN ' . $sql;
                }
            } elseif (preg_match('/^ADD\s+(UNIQUE)?\s*(?:KEY|INDEX)?\s*`?(\w+)?`?\s*\((.*)\)$/is', $a, $x)) {
                $cols = implode(', ', array_map(fn($c) => bsQi(preg_replace('/\(\d+\)$/', '', trim($c, " `"))), bsSplitTop($x[3])));
                $out[] = 'CREATE ' . (strtoupper($x[1]) === 'UNIQUE' ? 'UNIQUE ' : '') . 'INDEX IF NOT EXISTS ' . bsQi($table . '__' . ($x[2] !== '' ? $x[2] : 'ix' . substr(md5($cols), 0, 6))) . ' ON ' . bsQi($table) . ' (' . $cols . ')';
            } elseif (preg_match('/^DROP\s+(?:COLUMN\s+)?`?(\w+)`?$/i', $a, $x) && !preg_match('/^DROP\s+(INDEX|KEY|FOREIGN|PRIMARY)\b/i', $a)) {
                $out[] = 'ALTER TABLE ' . bsQi($table) . ' DROP COLUMN ' . bsQi($x[1]);
            } elseif (preg_match('/^DROP\s+(?:INDEX|KEY)\s+`?(\w+)`?$/i', $a, $x)) {
                $out[] = 'DROP INDEX IF EXISTS ' . bsQi($table . '__' . $x[1]);
            } elseif (preg_match('/^ADD\s+(?:CONSTRAINT\s+`?\w+`?\s+)?FOREIGN\s+KEY\b/i', $a) || preg_match('/^DROP\s+FOREIGN\s+KEY\b/i', $a)) {
                // vierasavaimet määritellään SQLitessä vain CREATE TABLE -vaiheessa: ohitetaan
            } else {
                throw new RuntimeException('ALTER TABLE -muutosta ei voi kääntää SQLiteksi (' . substr($a, 0, 60) . '): lisää migraation rinnalle .sqlite.sql-versio');
            }
        }
        return $out;
    }
    if (preg_match('/^(DROP\s+TABLE|DROP\s+INDEX)\b/i', $stmt)) return [$stmt];
    if (preg_match('/^(INSERT|UPDATE|DELETE|REPLACE)\b/i', $stmt)) return [$stmt];   // DML käännetään ajon aikana (bsSqliteTranslate)
    throw new RuntimeException('Lausetta ei voi kääntää SQLiteksi: ' . substr($stmt, 0, 80));
}

// Koko tiedosto -> SQLite-lauseet
function bsDdlTranslate(string $mysqlSql): array {
    $out = [];
    foreach (bsSqlStatements($mysqlSql) as $s) foreach (bsDdlStatement($s) as $o) $out[] = $o;
    return $out;
}
