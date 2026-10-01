-- Tuntien kuukausivahvistus ja hyväksyntä
CREATE TABLE IF NOT EXISTS `hour_confirmations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `user_id` int(11) NOT NULL,
  `month` char(7) NOT NULL,
  `hours` decimal(7,2) NOT NULL DEFAULT 0.00,
  `status` varchar(12) NOT NULL DEFAULT 'confirmed',
  `note` varchar(500) NOT NULL DEFAULT '',
  `confirmed_at` datetime DEFAULT NULL,
  `decided_by` int(11) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `admin_note` varchar(300) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_month` (`user_id`,`month`),
  KEY `pub_month` (`pub_name`,`month`),
  CONSTRAINT `hc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
