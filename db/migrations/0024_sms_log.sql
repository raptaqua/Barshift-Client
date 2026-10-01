-- Tekstiviestiloki (kuukausikatto ja seuranta)
CREATE TABLE IF NOT EXISTS `sms_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `to_phone` varchar(20) NOT NULL,
  `ok` tinyint(1) NOT NULL DEFAULT 0,
  `error` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_month` (`bar_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
