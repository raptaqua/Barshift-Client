-- Viikkopohjat: koko viikon vuorot mallina, jonka voi syöttää valittuun viikkoon
CREATE TABLE IF NOT EXISTS `week_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `name` varchar(60) NOT NULL,
  `data` mediumtext NOT NULL,                       -- JSON: [{dow 0=ma..6=su, userId|null, start, end, role}]
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `bar_name` (`bar_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
