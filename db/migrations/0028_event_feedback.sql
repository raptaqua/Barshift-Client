-- Tapahtumapalaute: pyyntö jälkikäteen ja vastaukset
ALTER TABLE `event_registrations` ADD COLUMN `feedback_hash` char(64) DEFAULT NULL;

ALTER TABLE `event_registrations` ADD COLUMN `feedback_sent_at` datetime DEFAULT NULL;

ALTER TABLE `event_registrations` ADD COLUMN `rating` tinyint(4) DEFAULT NULL;

ALTER TABLE `event_registrations` ADD COLUMN `feedback_text` varchar(500) DEFAULT NULL;

ALTER TABLE `event_registrations` ADD COLUMN `feedback_at` datetime DEFAULT NULL;
