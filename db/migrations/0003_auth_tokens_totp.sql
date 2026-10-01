-- Kutsu-/palautuslinkit ja kaksivaiheinen tunnistautuminen (TOTP)
ALTER TABLE `users` ADD COLUMN `totp_enabled` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `totp_secret` varchar(300) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN `totp_last_step` bigint(20) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `recovery_codes` text DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `kind` enum('invite','reset') NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `auth_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
