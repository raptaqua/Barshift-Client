-- Sähköposti: osoite ja ilmoitusasetus käyttäjille, lähtevän postin jono
ALTER TABLE `users` ADD COLUMN `email` varchar(150) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN `notify_email` tinyint(1) NOT NULL DEFAULT 1;

-- Lähtevän sähköpostin jono (lähetys heti pyynnön jälkeen tai cron.php)
CREATE TABLE IF NOT EXISTS `mail_queue` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `to_email` varchar(150) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `body` mediumtext NOT NULL,
  `attempts` tinyint(4) NOT NULL DEFAULT 0,
  `last_error` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pending` (`sent_at`,`attempts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
