-- Vieraskortisto (valinnainen ominaisuus)
CREATE TABLE IF NOT EXISTS `guests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `vip` tinyint(1) NOT NULL DEFAULT 0,
  `allergies` varchar(200) NOT NULL DEFAULT '',
  `notes` varchar(600) NOT NULL DEFAULT '',
  `tags` varchar(200) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `pub_email` (`bar_name`,`email`),
  KEY `bar_name` (`bar_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
