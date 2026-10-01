-- Hub: muiden baarien vapaat vuorot (feed) ja omien työntekijöiden hakemukset niihin
ALTER TABLE `users` ADD COLUMN `notify_gigs` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN `feature_hub_feed` tinyint(1) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS `hub_feed` (
  `hub_shift_id` int(11) NOT NULL, `bar_name` varchar(120) NOT NULL, `city` varchar(80) NOT NULL DEFAULT '', `date` date NOT NULL,
  `time_start` time NOT NULL, `time_end` time NOT NULL, `role` varchar(60) DEFAULT NULL, `pay_text` varchar(80) DEFAULT NULL, `note` varchar(300) DEFAULT NULL,
  `first_seen` datetime NOT NULL DEFAULT current_timestamp(), `gone` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`hub_shift_id`), KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `hub_outgoing` (
  `id` int(11) NOT NULL AUTO_INCREMENT, `hub_application_id` int(11) NOT NULL, `hub_shift_id` int(11) NOT NULL, `user_id` int(11) NOT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending', `bar_name` varchar(120) NOT NULL, `city` varchar(80) NOT NULL DEFAULT '', `date` date NOT NULL,
  `time_start` time NOT NULL, `time_end` time NOT NULL, `role` varchar(60) DEFAULT NULL, `address` varchar(200) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(), `decided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_hub_app` (`hub_application_id`), UNIQUE KEY `uq_user_shift` (`user_id`,`hub_shift_id`),
  CONSTRAINT `hub_outgoing_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
