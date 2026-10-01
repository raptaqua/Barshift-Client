-- Tapahtumailmoittautuminen/liput ja pöytävaraukset (baarikohtaisesti aktivoitavat)
ALTER TABLE `pubs` ADD COLUMN `feature_tickets` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `feature_bookings` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `booking_capacity` int(11) NOT NULL DEFAULT 30;

ALTER TABLE `pubs` ADD COLUMN `booking_max_party` tinyint(4) NOT NULL DEFAULT 8;

ALTER TABLE `pubs` ADD COLUMN `booking_slot_minutes` smallint(6) NOT NULL DEFAULT 30;

ALTER TABLE `pubs` ADD COLUMN `booking_duration_minutes` smallint(6) NOT NULL DEFAULT 120;

ALTER TABLE `pubs` ADD COLUMN `booking_lead_hours` smallint(6) NOT NULL DEFAULT 2;

ALTER TABLE `pubs` ADD COLUMN `booking_days_ahead` smallint(6) NOT NULL DEFAULT 60;

ALTER TABLE `pubs` ADD COLUMN `booking_auto_confirm` tinyint(1) NOT NULL DEFAULT 1;

ALTER TABLE `pubs` ADD COLUMN `booking_hours` text DEFAULT NULL;

ALTER TABLE `events` ADD COLUMN `registration` enum('none','rsvp','tickets') NOT NULL DEFAULT 'none';

ALTER TABLE `events` ADD COLUMN `capacity` int(11) DEFAULT NULL;

ALTER TABLE `events` ADD COLUMN `ticket_price` decimal(8,2) DEFAULT NULL;

ALTER TABLE `events` ADD COLUMN `ticket_url` varchar(255) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `event_registrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `qty` tinyint(4) NOT NULL DEFAULT 1,
  `status` enum('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  `arrived` tinyint(1) NOT NULL DEFAULT 0,
  `code` varchar(12) NOT NULL,
  `cancel_hash` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reminded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cancel_hash` (`cancel_hash`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `reg_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `party_size` tinyint(4) NOT NULL,
  `starts_at` datetime NOT NULL,
  `duration_min` smallint(6) NOT NULL DEFAULT 120,
  `note` varchar(300) DEFAULT NULL,
  `status` enum('pending','confirmed','declined','cancelled','seated','no_show') NOT NULL DEFAULT 'pending',
  `code` varchar(12) NOT NULL,
  `cancel_hash` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reminded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cancel_hash` (`cancel_hash`),
  KEY `pub_time` (`pub_name`,`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
