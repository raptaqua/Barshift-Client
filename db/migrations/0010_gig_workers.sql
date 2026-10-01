-- Keikkalaisten avoin profiili (opt-in) ja kutsut muista baareista
ALTER TABLE `users` ADD COLUMN `gig_available` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `users` ADD COLUMN `gig_note` varchar(300) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `gig_invites` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `from_pub` varchar(100) NOT NULL,
  `to_user_id` int(11) NOT NULL,
  `shift_id` int(11) DEFAULT NULL,
  `message` varchar(300) DEFAULT NULL,
  `status` enum('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `decided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `to_user_id` (`to_user_id`),
  KEY `from_pub` (`from_pub`,`status`),
  CONSTRAINT `gig_user` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
