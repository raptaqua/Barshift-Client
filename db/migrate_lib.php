<?php
// Versioidut tietokantamigraatiot.
//  - db/schema.sql = koko nykyinen rakenne tuoreeseen asennukseen (idempotentti, CREATE TABLE IF NOT EXISTS).
//  - db/migrations/NNNN_kuvaus.sql = yksittäinen muutos jo asennettuun kantaan. Ajetaan kerran, aakkosjärjestyksessä,
//    ja kirjataan tauluun schema_migrations. Kun lisäät migraation, päivitä myös schema.sql samaan tilaan.
//  - Tuoreessa asennuksessa migraatiot merkitään ajetuiksi ajamatta niitä (schema.sql sisältää ne jo).

function bsRunSql(mysqli $c, string $sql): ?string {
    if (!$c->multi_query($sql)) return $c->error;
    while (true) {
        if ($r = $c->store_result()) $r->free();
        if (!$c->more_results()) break;
        if (!$c->next_result()) return $c->error;
    }
    return $c->errno ? $c->error : null;
}

// Ajaa migraatiotiedoston lause kerrallaan. Jo olemassa oleva sarake/indeksi/taulu (esim. schema.sql ehti luoda sen uudella
// asennuksella tai osittain päivitetyssä kannassa) ohitetaan, joten migraatiot ovat turvallisia ajaa uudelleen.
function bsRunMigrationFile(mysqli $c, string $sql): ?string {
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(";\n", $sql . "\n"))) as $stmt) {
        $stmt = rtrim($stmt, "; \t\r\n");
        if ($stmt === '') continue;
        if (!$c->query($stmt) && !in_array($c->errno, [1060, 1061, 1050, 1091], true)) return $c->error . ' (' . substr($stmt, 0, 80) . ')';
    }
    return null;
}

function bsMigrationFiles(string $dir): array {
    $f = glob($dir . '/*.sql') ?: [];
    sort($f, SORT_STRING);
    return $f;
}

function bsEnsureMigrationTable(mysqli $c): void {
    $c->query("CREATE TABLE IF NOT EXISTS schema_migrations (
        version varchar(150) NOT NULL PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function bsTableExists(mysqli $c, string $t): bool {
    $r = $c->query("SHOW TABLES LIKE '" . $c->real_escape_string($t) . "'");
    return $r && $r->num_rows > 0;
}

// Ajaa odottavat migraatiot. $markOnly = merkitse ajetuiksi ajamatta (tuore asennus).
// Palauttaa [ajettujen määrä, virheteksti|null]. $log($msg) saa etenemisviestit.
function bsRunMigrations(mysqli $c, string $dir, bool $markOnly = false, ?callable $log = null): array {
    $log = $log ?? function ($m) {};
    bsEnsureMigrationTable($c);
    $done = [];
    $r = $c->query("SELECT version FROM schema_migrations");
    while ($r && ($row = $r->fetch_row())) $done[$row[0]] = true;
    $n = 0;
    foreach (bsMigrationFiles($dir) as $file) {
        $ver = basename($file);
        if (isset($done[$ver])) continue;
        if (!$markOnly) {
            $err = bsRunMigrationFile($c, (string)file_get_contents($file));
            if ($err !== null) return [$n, "Migraatio $ver epäonnistui: $err"];
            $log("OK    migraatio $ver");
        } else {
            $log("merk.  migraatio $ver (tuore asennus)");
        }
        $st = $c->prepare("INSERT INTO schema_migrations (version) VALUES (?)");
        $st->bind_param('s', $ver);
        $st->execute();
        $n++;
    }
    return [$n, null];
}
