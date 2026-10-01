-- Kassatilitys: rutiinin tyyppi ja päivän kassaraportit
ALTER TABLE `tasks` ADD COLUMN `kind` varchar(10) NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS `cash_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `date` date NOT NULL,
  `sales_total` decimal(10,2) NOT NULL,
  `card_total` decimal(10,2) DEFAULT NULL,
  `counted_cash` decimal(10,2) DEFAULT NULL,
  `float_amount` decimal(10,2) DEFAULT NULL,
  `note` varchar(500) NOT NULL DEFAULT '',
  `user_id` int(11) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `pub_date` (`pub_name`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
