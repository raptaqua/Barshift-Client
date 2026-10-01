-- BarShift: päivitys vanhaan tietokantaan (kaikki muutokset alkuperäisen rakenteen jälkeen).
-- Tuo phpMyAdminissa (Tuo-välilehti) tai:  mysql TIETOKANTA < db/upgrade.sql
-- Turvallinen ajaa useita kertoja. Vaatii MariaDB 10.0.2+ (cPanel-palvelimilla yleinen); MySQL:llä käytä: php migrate.php
-- Älä poista tai muuta olemassa olevaa dataa.
SET NAMES utf8mb4;

-- Vuosiloma: aloituspäivä ja työsuhteen tyyppi
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `start_date` date DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `employment_type` enum('regular','casual') NOT NULL DEFAULT 'regular';

-- Julkinen tapahtumakalenteri: tapahtumien kuvaus ja julkisuus (olemassa olevat tapahtumat jäävät sisäisiksi)
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `description` varchar(600) DEFAULT NULL;
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `is_public` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `events` ALTER COLUMN `is_public` SET DEFAULT 1;

-- Baarin julkinen profiili
CREATE TABLE IF NOT EXISTS `pub_profiles` (
  `pub_name` varchar(100) NOT NULL,
  `display_name` varchar(120) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `address` varchar(200) DEFAULT NULL,
  `city` varchar(80) DEFAULT NULL,
  `lat` decimal(9,6) DEFAULT NULL,
  `lng` decimal(9,6) DEFAULT NULL,
  `website` varchar(200) DEFAULT NULL,
  `color` varchar(7) DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`pub_name`),
  KEY `public_city` (`is_public`,`city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Kirjautumisyritysten rajoitus (jos puuttuu)
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `username` varchar(150) NOT NULL,
  `attempted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ip_time` (`ip`,`attempted_at`),
  KEY `user_time` (`username`,`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Baari omana entiteettinään: kirjautumistunnus (slug = users.pub_name, ei muutu), näyttönimi ja baarikohtaiset asetukset
CREATE TABLE IF NOT EXISTS `pubs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(100) NOT NULL,
  `name` varchar(120) NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'Europe/Helsinki',
  `roles` text DEFAULT NULL,                                   -- JSON-lista vuoroissa käytettävistä rooleista
  `min_rest_hours` decimal(4,1) NOT NULL DEFAULT 11.0,         -- vuorojen välinen vähimmäislepo
  `max_week_hours` decimal(5,1) DEFAULT NULL,                  -- viikkotuntien varoitusraja
  `evening_start` tinyint(4) NOT NULL DEFAULT 18,
  `night_end` tinyint(4) NOT NULL DEFAULT 6,
  `bonus_evening` decimal(6,2) NOT NULL DEFAULT 1.33,          -- EUR/h
  `bonus_night` decimal(6,2) NOT NULL DEFAULT 2.25,            -- EUR/h
  `bonus_sat` decimal(6,2) NOT NULL DEFAULT 5.39,              -- EUR/h
  `bonus_sun` decimal(5,2) NOT NULL DEFAULT 2.00,              -- kerroin
  `billing_name` varchar(120) DEFAULT NULL,
  `billing_email` varchar(150) DEFAULT NULL,
  `billing_vat` varchar(30) DEFAULT NULL,
  `billing_address` varchar(250) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Vuorosuunnittelu: luonnos/julkaistu ja vuoropohjat
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `status` enum('draft','published') NOT NULL DEFAULT 'published';

-- Vuoropohjat (nimetty aika + rooli) nopeaan vuorojen luontiin
CREATE TABLE IF NOT EXISTS `shift_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `name` varchar(60) NOT NULL,
  `start` time NOT NULL,
  `end` time NOT NULL,
  `role` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tietosuoja: säilytysaika, anonymisointi, auditloki
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `retention_months` int(11) NOT NULL DEFAULT 60;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `anonymized_at` timestamp NULL DEFAULT NULL;

-- Auditloki admin-toimista (ei sisällä salasanoja eikä viestien sisältöä)
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `action` varchar(40) NOT NULL,
  `target` varchar(120) DEFAULT NULL,
  `detail` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_time` (`pub_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Raportit: työnantajan sivukulut
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `side_cost_pct` decimal(5,2) NOT NULL DEFAULT 0.00;

-- Sähköposti-ilmoitukset
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `email` varchar(150) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `notify_email` tinyint(1) NOT NULL DEFAULT 1;

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

-- Kutsu-/palautuslinkit ja kaksivaiheinen tunnistautuminen
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `totp_enabled` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `totp_secret` varchar(300) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `totp_last_step` bigint(20) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `recovery_codes` text DEFAULT NULL;
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

-- Muistutukset ja leimaushälytykset
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `reminder_hours` tinyint(4) NOT NULL DEFAULT 3;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `clock_alert_minutes` smallint(6) NOT NULL DEFAULT 0;
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `reminded_at` datetime DEFAULT NULL;
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `missed_alerted_at` datetime DEFAULT NULL;
ALTER TABLE `time_entries` ADD COLUMN IF NOT EXISTS `alerted_at` datetime DEFAULT NULL;

-- Yksi tunnus, monta baaria
ALTER TABLE `auth_tokens` MODIFY `kind` enum('invite','reset','link') NOT NULL;

-- Viikkopohjat
CREATE TABLE IF NOT EXISTS `week_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `name` varchar(60) NOT NULL,
  `data` mediumtext NOT NULL,                       -- JSON: [{dow 0=ma..6=su, userId|null, start, end, role}]
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `staffing_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `dow` tinyint(4) DEFAULT NULL,                    -- 0 = ma ... 6 = su; NULL = joka päivä
  `start` time NOT NULL,
  `end` time NOT NULL,
  `role` varchar(50) DEFAULT NULL,                  -- NULL = mikä tahansa rooli
  `min_staff` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `availability_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `pub_name` varchar(100) NOT NULL,
  `dow` tinyint(4) NOT NULL,                        -- 0 = ma ... 6 = su
  `valid_from` date DEFAULT NULL,
  `valid_to` date DEFAULT NULL,
  `note` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `pub_name` (`pub_name`),
  CONSTRAINT `avail_rules_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
ALTER TABLE `shift_trades` ADD COLUMN IF NOT EXISTS `target_user_id` int(11) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `employee_number` varchar(20) DEFAULT NULL;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `pay_code_base` varchar(20) NOT NULL DEFAULT 'PERUS';
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `pay_code_evening` varchar(20) NOT NULL DEFAULT 'ILTA';
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `pay_code_night` varchar(20) NOT NULL DEFAULT 'YO';
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `pay_code_sat` varchar(20) NOT NULL DEFAULT 'LA';
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `pay_code_sun` varchar(20) NOT NULL DEFAULT 'SU';
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `overtime_week_hours` decimal(5,1) NOT NULL DEFAULT 40.0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `weekly_budget` decimal(10,2) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `daily_sales` (
  `pub_name` varchar(100) NOT NULL,
  `date` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`pub_name`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
ALTER TABLE `shopping_list` ADD COLUMN IF NOT EXISTS `assigned_to` int(11) DEFAULT NULL;
ALTER TABLE `shopping_list` ADD COLUMN IF NOT EXISTS `image_path` varchar(255) DEFAULT NULL;
ALTER TABLE `shift_logs` ADD COLUMN IF NOT EXISTS `image_path` varchar(255) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `cert_alert_level` tinyint(4) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `cert_alert_for` date DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `checklists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `items` text NOT NULL,                            -- JSON: [tehtävätekstit]
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
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
  `pub_name` varchar(100) NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `file_path` varchar(255) NOT NULL,                -- suhteellinen polku uploads/docs/ alla; ladataan vain API:n kautta
  `mime` varchar(60) NOT NULL,
  `size` int(11) NOT NULL DEFAULT 0,
  `requires_ack` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
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
  `pub_name` varchar(100) NOT NULL,
  `from_user` int(11) NOT NULL,
  `to_user` int(11) NOT NULL,
  `message` varchar(300) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_created` (`pub_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `surveys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `question` varchar(300) NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
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

ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_tickets` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_bookings` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_capacity` int(11) NOT NULL DEFAULT 30;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_max_party` tinyint(4) NOT NULL DEFAULT 8;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_slot_minutes` smallint(6) NOT NULL DEFAULT 30;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_duration_minutes` smallint(6) NOT NULL DEFAULT 120;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_lead_hours` smallint(6) NOT NULL DEFAULT 2;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_days_ahead` smallint(6) NOT NULL DEFAULT 60;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_auto_confirm` tinyint(1) NOT NULL DEFAULT 1;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `booking_hours` text DEFAULT NULL;
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `registration` enum('none','rsvp','tickets') NOT NULL DEFAULT 'none';
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `capacity` int(11) DEFAULT NULL;
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `ticket_price` decimal(8,2) DEFAULT NULL;
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `ticket_url` varchar(255) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `event_registrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `qty` tinyint(4) NOT NULL DEFAULT 1,
  `status` enum('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  `arrived` tinyint(1) NOT NULL DEFAULT 0,
  `code` varchar(12) NOT NULL,
  `cancel_hash` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reminded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cancel_hash` (`cancel_hash`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `reg_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `party_size` tinyint(4) NOT NULL,
  `starts_at` datetime NOT NULL,
  `duration_min` smallint(6) NOT NULL DEFAULT 120,
  `note` varchar(300) DEFAULT NULL,
  `status` enum('pending','confirmed','declined','cancelled','seated','no_show') NOT NULL DEFAULT 'pending',
  `code` varchar(12) NOT NULL,
  `cancel_hash` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reminded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cancel_hash` (`cancel_hash`),
  KEY `pub_time` (`pub_name`,`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `require_2fa` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `tasks` ADD COLUMN IF NOT EXISTS `kind` varchar(10) NOT NULL DEFAULT 'normal';

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
ALTER TABLE `cash_reports` ADD COLUMN IF NOT EXISTS `photo_path` varchar(120) DEFAULT NULL;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `access_roles` text DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `access_role` varchar(40) DEFAULT NULL;
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `guest_capacity` int(11) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `event_guests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `note` varchar(200) NOT NULL DEFAULT '',
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `guest_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
ALTER TABLE `cash_reports` ADD COLUMN IF NOT EXISTS `expenses` decimal(10,2) DEFAULT NULL;
ALTER TABLE `cash_reports` ADD COLUMN IF NOT EXISTS `tips` decimal(10,2) DEFAULT NULL;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `sales_target_week` decimal(10,2) DEFAULT NULL;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `sales_target_month` decimal(10,2) DEFAULT NULL;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `vat_rate` decimal(4,1) NOT NULL DEFAULT 25.5;

CREATE TABLE IF NOT EXISTS `system_status` (
  `k` varchar(40) NOT NULL,
  `v` varchar(255) NOT NULL DEFAULT '',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `skills` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `name` varchar(60) NOT NULL,
  `for_role` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pub_name` (`pub_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `user_skills` (
  `user_id` int(11) NOT NULL,
  `skill_id` int(11) NOT NULL,
  `valid_until` date DEFAULT NULL,
  PRIMARY KEY (`user_id`,`skill_id`),
  KEY `skill_id` (`skill_id`),
  CONSTRAINT `us_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `us_skill` FOREIGN KEY (`skill_id`) REFERENCES `skills` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_bidding` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_autoschedule` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_reminders` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_payments` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_guests` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `guest_reminder_hours` int(11) NOT NULL DEFAULT 24;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `reminder_sms` tinyint(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `shift_bids` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `shift_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `note` varchar(200) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `shift_user` (`shift_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `bid_shift` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bid_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `guests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
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
  UNIQUE KEY `pub_email` (`pub_name`,`email`),
  KEY `pub_name` (`pub_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sms_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_name` varchar(100) NOT NULL,
  `to_phone` varchar(20) NOT NULL,
  `ok` tinyint(1) NOT NULL DEFAULT 0,
  `error` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pub_month` (`pub_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
ALTER TABLE `event_registrations` MODIFY COLUMN `status` enum('confirmed','cancelled','pending') NOT NULL DEFAULT 'confirmed';
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `paid_cents` int(11) DEFAULT NULL;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `payment_ref` varchar(80) DEFAULT NULL;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `expires_at` datetime DEFAULT NULL;
ALTER TABLE `shift_trades` ADD COLUMN IF NOT EXISTS `swap_shift_id` int(11) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `event_waitlist` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `qty` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `notified_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_email` (`event_id`,`email`),
  CONSTRAINT `wl_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `feedback_hash` char(64) DEFAULT NULL;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `feedback_sent_at` datetime DEFAULT NULL;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `rating` tinyint(4) DEFAULT NULL;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `feedback_text` varchar(500) DEFAULT NULL;
ALTER TABLE `event_registrations` ADD COLUMN IF NOT EXISTS `feedback_at` datetime DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `dev_hash` char(64) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen` datetime NOT NULL DEFAULT current_timestamp(),
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dev` (`dev_hash`),
  KEY `idx_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_hub_events` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `pubs` ADD COLUMN IF NOT EXISTS `feature_hub_gigs` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `hub_gig` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `shifts` ADD COLUMN IF NOT EXISTS `hub_pay` varchar(80) DEFAULT NULL;
CREATE TABLE IF NOT EXISTS `hub_sync` (
  `kind` enum('event','shift') NOT NULL, `local_id` int(11) NOT NULL, `hash` char(40) NOT NULL, `synced_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`kind`,`local_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `hub_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT, `hub_id` int(11) NOT NULL, `shift_id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL, `skills` varchar(300) NOT NULL DEFAULT '', `city` varchar(80) NOT NULL DEFAULT '', `message` varchar(500) DEFAULT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending', `email` varchar(190) DEFAULT NULL, `phone` varchar(40) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(), `decided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_hub` (`hub_id`), KEY `shift_id` (`shift_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `hub_connection` (
  `id` tinyint(4) NOT NULL DEFAULT 1, `url` varchar(300) NOT NULL, `pub_slug` varchar(64) NOT NULL, `private_key_enc` text NOT NULL,
  `hub_name` varchar(120) DEFAULT NULL, `connected_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
