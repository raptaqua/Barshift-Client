-- Miehityssäännöt, toistuvat estepäivät ja vuoronvaihdon kohdehenkilö
CREATE TABLE IF NOT EXISTS `staffing_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `dow` tinyint(4) DEFAULT NULL,                    -- 0 = ma ... 6 = su; NULL = joka päivä
  `start` time NOT NULL,
  `end` time NOT NULL,
  `role` varchar(50) DEFAULT NULL,                  -- NULL = mikä tahansa rooli
  `min_staff` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `bar_name` (`bar_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `availability_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bar_name` varchar(100) NOT NULL,
  `dow` tinyint(4) NOT NULL,                        -- 0 = ma ... 6 = su
  `valid_from` date DEFAULT NULL,
  `valid_to` date DEFAULT NULL,
  `note` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `bar_name` (`bar_name`),
  CONSTRAINT `avail_rules_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `shift_trades` ADD COLUMN `target_user_id` int(11) DEFAULT NULL;
