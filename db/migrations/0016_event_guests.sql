-- Tapahtuman sisäinen vieraslista (vain baarin henkilökunnalle)
ALTER TABLE `events` ADD COLUMN `guest_capacity` int(11) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `event_guests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `note` varchar(200) NOT NULL DEFAULT '',
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `guest_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
