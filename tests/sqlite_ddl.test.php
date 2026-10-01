<?php
// SQLite-käännöksen testit: skeema, uudet migraatiot (ALTER/CREATE/DML), erikoissyntaksit ja tyyppien käyttäytyminen.
require __DIR__ . '/../db/migrate_lib.php';
$fail = 0;
function check(string $name, bool $ok, string $info = ''): void { global $fail; echo ($ok ? '  ok   ' : '  FAIL ') . $name . ($ok ? '' : " $info") . "\n"; if (!$ok) $fail++; }

$file = tempnam(sys_get_temp_dir(), 'bs') . '.sqlite';
$c = new BsSqliteConn($file, 'Europe/Helsinki');
check('yhteys', !$c->connect_error, (string)$c->connect_error);
check('skeema', bsApplySchema($c, __DIR__ . '/../db/schema.sql') === null);
check('skeema uudelleen (idempotentti)', bsApplySchema($c, __DIR__ . '/../db/schema.sql') === null);

// Tuore asennus merkitsee migraatiot ajetuiksi
[$n, $err] = bsRunMigrations($c, __DIR__ . '/../db/migrations', true);
check('migraatiot merkitty', $err === null && $n >= 34, "$n $err");
[$n, $err] = bsRunMigrations($c, __DIR__ . '/../db/migrations', false);
check('ei uusia migraatioita', $err === null && $n === 0, "$n $err");

// Uusi migraatio: käännetään MySQL-syntaksista
$dir = sys_get_temp_dir() . '/bsmig' . getmypid(); @mkdir($dir);
file_put_contents("$dir/0100_test.sql", "-- testi\nALTER TABLE `users` ADD COLUMN `nick` varchar(30) DEFAULT NULL;\nALTER TABLE `users` ADD COLUMN `score` int(11) NOT NULL DEFAULT 5, ADD KEY `idx_nick` (`nick`);\nCREATE TABLE IF NOT EXISTS `extra` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `k` varchar(20) NOT NULL,\n  `v` int(11) NOT NULL DEFAULT 0,\n  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_k` (`k`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\nINSERT INTO `extra` (k, v) VALUES ('a', 1) ON DUPLICATE KEY UPDATE v = VALUES(v);\n");
file_put_contents("$dir/0101_manual.sql", "ALTER TABLE `extra` MODIFY `v` bigint NOT NULL;\n");
file_put_contents("$dir/0101_manual.sqlite.sql", "ALTER TABLE `extra` ADD COLUMN `manual` int(11) DEFAULT 7;\n");
[$n, $err] = bsRunMigrations($c, $dir, false);
check('uudet migraatiot ajettu', $err === null && $n === 2, "$n $err");
$r = $c->query("SELECT nick, score FROM users LIMIT 1"); check('ALTER ADD COLUMN', $r !== false);
$r = $c->query("SELECT manual FROM extra"); check('käsin kirjoitettu .sqlite.sql käytössä', $r !== false && $r->fetch_assoc()['manual'] == 7);
check('migraatiot kirjattu', (int)$c->query("SELECT COUNT(*) c FROM schema_migrations WHERE version LIKE '010%'")->fetch_assoc()['c'] === 2);

// Käyttäytyminen
$c->query("INSERT INTO extra (k, v) VALUES ('b', 1)");
$st = $c->prepare("INSERT INTO extra (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)"); $k = 'b'; $v = 9; $st->bind_param('si', $k, $v);
check('ON DUPLICATE KEY UPDATE', $st->execute() && (int)$c->query("SELECT v FROM extra WHERE k='b'")->fetch_assoc()['v'] === 9);
$st = $c->prepare("INSERT IGNORE INTO extra (k, v) VALUES (?, ?)"); $k = 'b'; $v = 1; $st->bind_param('si', $k, $v); $st->execute();
check('INSERT IGNORE: ohitettu rivi, insert_id 0, affected_rows 0', $c->insert_id === 0 && $st->affected_rows === 0);
$c->query("INSERT INTO extra (k) VALUES ('c')"); check('insert_id', $c->insert_id > 0);
check('merkkikoosta riippumaton vertailu (kuten MySQL)', $c->query("SELECT 1 FROM extra WHERE k = 'A'")->num_rows === 1);
check('ä/ö LIKE ja LOWER', $c->query("SELECT 'ÄITI' LIKE 'äiti' x")->fetch_assoc()['x'] == 1 && $c->query("SELECT LOWER('ÄÖ') x")->fetch_assoc()['x'] === 'äö');
$c->query("UPDATE extra SET v = 3 WHERE k = 'a'");
$a = $c->query("SELECT created_at, updated_at FROM extra WHERE k='a'")->fetch_assoc();
check('DEFAULT-aika (NOW())', preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $a['created_at']) === 1);
check('uniikki-avain estää kaksoiskappaleen', $c->query("INSERT INTO extra (k) VALUES ('a')") === false && $c->errno === 1062);
check('puuttuva taulu -> 1146', $c->query("SELECT * FROM ei_ole") === false && $c->errno === 1146);
check('puuttuva sarake -> 1054', $c->query("SELECT ei_ole FROM extra") === false && $c->errno === 1054);
$q = fn($s) => $c->query($s)->fetch_assoc();
check('DATE_ADD / INTERVAL', $q("SELECT DATE_ADD('2026-01-31', INTERVAL 1 MONTH) x")['x'] === '2026-02-28' && $q("SELECT CURDATE() - INTERVAL 1 DAY x")['x'] === date('Y-m-d', strtotime('-1 day')));
check('DATE_SUB ? -parametri', (function () use ($c) { $s = $c->prepare("SELECT DATE_SUB(?, INTERVAL ? DAY) x"); $d = '2026-03-10'; $n = 3; $s->bind_param('si', $d, $n); $s->execute(); return $s->get_result()->fetch_assoc()['x'] === '2026-03-07'; })());
check('TIME_TO_SEC / MOD (yövuoro)', (float)$q("SELECT MOD(TIME_TO_SEC('02:00:00') - TIME_TO_SEC('18:00:00') + 86400, 86400) / 3600 x")['x'] === 8.0);
check('CONCAT, RIGHT, DATEDIFF', $q("SELECT CONCAT('a', 'b') x")['x'] === 'ab' && $q("SELECT RIGHT('0401234567', 9) x")['x'] === '401234567' && (int)$q("SELECT DATEDIFF('2026-03-10', '2026-03-01') x")['x'] === 9);
check('DELETE alias JOIN', $c->query("DELETE e FROM extra e JOIN users u ON u.id = e.id WHERE e.k = 'zzz'") !== false);
check('SHOW TABLES LIKE', $c->query("SHOW TABLES LIKE 'extra'")->num_rows === 1 && $c->query("SHOW TABLES LIKE 'ei_ole'")->num_rows === 0);
check('GET_LOCK', (int)$q("SELECT GET_LOCK('x', 1) x")['x'] === 1 && $c->query("SELECT RELEASE_LOCK('x')") !== false);
check('SET time_zone vaikuttaa NOW()', ($c->query("SET time_zone = '+00:00'") && substr($q("SELECT NOW() x")['x'], 0, 13) === gmdate('Y-m-d H')));
$c->begin_transaction(); $c->query("INSERT INTO extra (k) VALUES ('tx')"); $c->rollback();
check('transaktio: rollback', $c->query("SELECT 1 FROM extra WHERE k='tx'")->num_rows === 0);
$c->begin_transaction(); $c->query("INSERT INTO extra (k) VALUES ('tx')"); $c->commit();
check('transaktio: commit', $c->query("SELECT 1 FROM extra WHERE k='tx'")->num_rows === 1);
check('vierasavain (ON DELETE SET NULL)', (function () use ($c) {
    $c->query("INSERT INTO users (name, username, password) VALUES ('t', 'fk', 'x')"); $uid = $c->insert_id;
    $c->query("INSERT INTO shifts (userId, date, start, end, role) VALUES ($uid, '2026-01-01', '10:00:00', '12:00:00', 'x')");
    $c->query("DELETE FROM users WHERE id = $uid");
    return $c->query("SELECT userId FROM shifts WHERE role = 'x'")->fetch_assoc()['userId'] === null;
})());
check('ENUM-rajoite', $c->query("INSERT INTO users (name, username, password, role) VALUES ('t', 'e1', 'x', 'bogus')") === false);

@unlink($file); foreach (glob("$dir/*") as $f) unlink($f); @rmdir($dir);
echo $fail ? "\n$fail epäonnistui\n" : "\nkaikki läpi\n";
exit($fail ? 1 : 0);
