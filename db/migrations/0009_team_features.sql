-- Perehdytyslistat, dokumentit, kiitokset, nimettömät kyselyt, puutelistan/vuorokirjan kuvat ja vastuuhenkilö, lupamuistutukset
ALTER TABLE `shopping_list` ADD COLUMN `assigned_to` int(11) DEFAULT NULL;

ALTER TABLE `shopping_list` ADD COLUMN `image_path` varchar(255) DEFAULT NULL;

ALTER TABLE `shift_logs` ADD COLUMN `image_path` varchar(255) DEFAULT NULL;

ALTER TABLE `users` ADD COLUMN `cert_alert_level` tinyint(4) NOT NULL DEFAULT 0;

ALTER TABLE `users` ADD COLUMN `cert_alert_for` date DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `checklists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `items` text NOT NULL,                            -- JSON: [tehtävätekstit]
  PRIMARY KEY (`id`),
  KEY `bar_name` (`bar_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `checklist_progress` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `checklist_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `done` text NOT NULL,                             -- JSON: tehtyjen kohtien indeksit
  `assigned_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_list` (`user_id`,`checklist_id`),
  KEY `checklist_id` (`checklist_id`),
  CONSTRAINT `cp_list` FOREIGN KEY (`checklist_id`) REFERENCES `checklists` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `file_path` varchar(255) NOT NULL,                -- suhteellinen polku uploads/docs/ alla; ladataan vain API:n kautta
  `mime` varchar(60) NOT NULL,
  `size` int(11) NOT NULL DEFAULT 0,
  `requires_ack` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `bar_name` (`bar_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `document_acks` (
  `document_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `acked_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`document_id`,`user_id`),
  CONSTRAINT `da_doc` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `da_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `kudos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `from_user` int(11) NOT NULL,
  `to_user` int(11) NOT NULL,
  `message` varchar(300) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_created` (`bar_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `surveys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bar_name` varchar(100) NOT NULL,
  `question` varchar(300) NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `bar_name` (`bar_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `survey_answers` (             -- ei käyttäjätunnusta: vastaukset ovat nimettömiä
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `survey_id` int(11) NOT NULL,
  `rating` tinyint(4) DEFAULT NULL,
  `comment` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `survey_id` (`survey_id`),
  CONSTRAINT `sa_survey` FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `survey_done` (
  `survey_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  PRIMARY KEY (`survey_id`,`user_id`),
  CONSTRAINT `sd_survey` FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sd_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
