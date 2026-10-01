-- Vuoromuistutukset ja "leimaus unohtui" -hälytykset
ALTER TABLE `pubs` ADD COLUMN `reminder_hours` tinyint(4) NOT NULL DEFAULT 3;
ALTER TABLE `pubs` ADD COLUMN `clock_alert_minutes` smallint(6) NOT NULL DEFAULT 0;
ALTER TABLE `shifts` ADD COLUMN `reminded_at` datetime DEFAULT NULL;
ALTER TABLE `shifts` ADD COLUMN `missed_alerted_at` datetime DEFAULT NULL;
ALTER TABLE `time_entries` ADD COLUMN `alerted_at` datetime DEFAULT NULL;
