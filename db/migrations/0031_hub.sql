-- Yhteys BarShift Hub -keskuspalvelimeen (valinnainen, baarikohtainen)
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_hub_events` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_hub_gigs` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `hub_gig` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `hub_pay` varchar(80) DEFAULT NULL;
CREATE TABLE IF NOT EXISTS `hub_sync` (
  `kind` enum('event','shift') NOT NULL, `local_id` int(11) NOT NULL, `hash` char(40) NOT NULL, `synced_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`kind`,`local_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `hub_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT, `hub_id` int(11) NOT NULL, `shift_id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL, `skills` varchar(300) NOT NULL DEFAULT '', `city` varchar(80) NOT NULL DEFAULT '', `message` varchar(500) DEFAULT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending', `email` varchar(190) DEFAULT NULL, `phone` varchar(40) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(), `decided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_hub` (`hub_id`), KEY `shift_id` (`shift_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
