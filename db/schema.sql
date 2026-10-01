-- BarShift Pro: tietokannan rakenne (ei dataa).
-- Tuo:  mysql -u ROOT -p TIETOKANTA < db/schema.sql
-- Sovelluksen tietokantakäyttäjälle riittää SELECT, INSERT, UPDATE, DELETE.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,                 -- vain password_hash()-arvo
  `role` enum('admin','employee') NOT NULL DEFAULT 'employee',
  `color` varchar(7) DEFAULT NULL,
  `initials` varchar(5) DEFAULT NULL,
  `phone` varchar(20) DEFAULT '',
  `hourly_wage` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `ical_token` varchar(64) DEFAULT NULL,
  `target_hours` int(11) NOT NULL DEFAULT 0,
  `expiry_jv` date DEFAULT NULL,
  `start_date` date DEFAULT NULL,                    -- työsuhteen alkamispäivä (vuosiloman kertymä)
  `employment_type` enum('regular','casual') NOT NULL DEFAULT 'regular',  -- vakituinen / keikkalainen
  `anonymized_at` timestamp NULL DEFAULT NULL,       -- GDPR: tunnus anonymisoitu
  `email` varchar(150) DEFAULT NULL,                 -- ilmoitusten varakanava, kutsut ja salasanan palautus
  `notify_email` tinyint(1) NOT NULL DEFAULT 1,      -- saako ilmoitukset sähköpostina, kun pushia ei ole käytössä
  `notify_gigs` tinyint(1) NOT NULL DEFAULT 0,       -- ilmoitus muiden baarien vapaista vuoroista (keskuspalvelin)
  `has_hygiene` int(11) NOT NULL DEFAULT 0,
  `has_alcohol` int(11) NOT NULL DEFAULT 0,
  `totp_enabled` tinyint(1) NOT NULL DEFAULT 0,      -- kaksivaiheinen tunnistautuminen (TOTP)
  `totp_secret` varchar(300) DEFAULT NULL,           -- salattu (message_key)
  `totp_last_step` bigint(20) NOT NULL DEFAULT 0,    -- viimeksi käytetty aika-askel (koodin uudelleenkäytön esto)
  `recovery_codes` text DEFAULT NULL,                -- JSON: palautuskoodien sha256-tiivisteet
  `employee_number` varchar(20) DEFAULT NULL,
  `cert_alert_level` tinyint(4) NOT NULL DEFAULT 0,
  `cert_alert_for` date DEFAULT NULL,
  `access_role` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`),
  UNIQUE KEY `ical_token` (`ical_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shifts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) DEFAULT NULL,                    -- NULL = avoin vuoro
  `date` date DEFAULT NULL,
  `start` time DEFAULT NULL,
  `end` time DEFAULT NULL,
  `role` varchar(50) DEFAULT NULL,
  `original_userId` int(11) DEFAULT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'published',   -- luonnos näkyy vain adminille
  `reminded_at` datetime DEFAULT NULL,               -- muistutus lähetetty
  `missed_alerted_at` datetime DEFAULT NULL,         -- "leimaus unohtui" -hälytys lähetetty
  `hub_gig` tinyint(1) NOT NULL DEFAULT 0,           -- 1 = tarjolla keikkatyöläisille keskuksessa, 2 = täytetty keskuksen kautta
  `hub_pay` varchar(80) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `userId` (`userId`),
  KEY `idx_date` (`date`),
  CONSTRAINT `shifts_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Vuoropohjat (nimetty aika + rooli) nopeaan vuorojen luontiin
CREATE TABLE IF NOT EXISTS `shift_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `start` time NOT NULL,
  `end` time NOT NULL,
  `role` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Viikkopohjat (koko viikon vuorot mallina)
CREATE TABLE IF NOT EXISTS `week_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `data` mediumtext NOT NULL,                       -- JSON: [{dow 0=ma..6=su, userId|null, start, end, role}]
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `absences` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` enum('sick','vacation','other') NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `description` mediumtext DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `absences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `availability` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `status` varchar(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_date` (`user_id`,`date`),
  CONSTRAINT `availability_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `date` date NOT NULL,
  `type` varchar(50) DEFAULT NULL,
  `time` time DEFAULT '18:00:00',
  `time_start` time DEFAULT NULL,
  `time_end` time DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `description` varchar(600) DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 1,       -- näkyykö julkisessa tapahtumakalenterissa (kun baarin profiili on julkinen)
  `registration` enum('none','rsvp','tickets') NOT NULL DEFAULT 'none',
  `capacity` int(11) DEFAULT NULL,
  `ticket_price` decimal(8,2) DEFAULT NULL,
  `ticket_url` varchar(255) DEFAULT NULL,
  `guest_capacity` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Baarin julkinen profiili (tapahtumakalenteri ja kartta). Ei näy ennen kuin is_public = 1.
CREATE TABLE IF NOT EXISTS `pub_profiles` (
  `id` tinyint(4) NOT NULL DEFAULT 1,
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
  PRIMARY KEY (`id`),
  KEY `public_city` (`is_public`,`city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Baari (yksi rivi): näyttönimi ja baarikohtaiset asetukset
CREATE TABLE IF NOT EXISTS `pubs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
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
  `retention_months` int(11) NOT NULL DEFAULT 60,               -- työaika- ja vuorotietojen säilytys (kk)
  `side_cost_pct` decimal(5,2) NOT NULL DEFAULT 0.00,          -- työnantajan sivukulut (%), raporttien kustannuslaskentaan
  `reminder_hours` tinyint(4) NOT NULL DEFAULT 3,              -- vuoromuistutus x tuntia ennen alkua (0 = pois)
  `clock_alert_minutes` smallint(6) NOT NULL DEFAULT 0,        -- hälytys, kun leimaus puuttuu x min vuoron alusta/lopusta (0 = pois)
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `pay_code_base` varchar(20) NOT NULL DEFAULT 'PERUS',
  `pay_code_evening` varchar(20) NOT NULL DEFAULT 'ILTA',
  `pay_code_night` varchar(20) NOT NULL DEFAULT 'YO',
  `pay_code_sat` varchar(20) NOT NULL DEFAULT 'LA',
  `pay_code_sun` varchar(20) NOT NULL DEFAULT 'SU',
  `overtime_week_hours` decimal(5,1) NOT NULL DEFAULT 40.0,
  `weekly_budget` decimal(10,2) DEFAULT NULL,
  `feature_tickets` tinyint(1) NOT NULL DEFAULT 0,
  `feature_bookings` tinyint(1) NOT NULL DEFAULT 0,
  `booking_capacity` int(11) NOT NULL DEFAULT 30,
  `booking_max_party` tinyint(4) NOT NULL DEFAULT 8,
  `booking_slot_minutes` smallint(6) NOT NULL DEFAULT 30,
  `booking_duration_minutes` smallint(6) NOT NULL DEFAULT 120,
  `booking_lead_hours` smallint(6) NOT NULL DEFAULT 2,
  `booking_days_ahead` smallint(6) NOT NULL DEFAULT 60,
  `booking_auto_confirm` tinyint(1) NOT NULL DEFAULT 1,
  `booking_hours` text DEFAULT NULL,
  `require_2fa` tinyint(1) NOT NULL DEFAULT 0,
  `access_roles` text DEFAULT NULL,
  `sales_target_week` decimal(10,2) DEFAULT NULL,
  `sales_target_month` decimal(10,2) DEFAULT NULL,
  `vat_rate` decimal(4,1) NOT NULL DEFAULT 25.5,
  `feature_bidding` tinyint(1) NOT NULL DEFAULT 0,
  `feature_autoschedule` tinyint(1) NOT NULL DEFAULT 0,
  `feature_reminders` tinyint(1) NOT NULL DEFAULT 0,
  `feature_payments` tinyint(1) NOT NULL DEFAULT 0,
  `feature_guests` tinyint(1) NOT NULL DEFAULT 0,
  `guest_reminder_hours` int(11) NOT NULL DEFAULT 24,
  `reminder_sms` tinyint(1) NOT NULL DEFAULT 0,
  `feature_hub_events` tinyint(1) NOT NULL DEFAULT 0,
  `feature_hub_gigs` tinyint(1) NOT NULL DEFAULT 0,
  `feature_hub_feed` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Auditloki admin-toimista (ei sisällä salasanoja eikä viestien sisältöä)
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `action` varchar(40) NOT NULL,
  `target` varchar(120) DEFAULT NULL,
  `detail` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Kutsu- ja salasananvaihtolinkit (kertakäyttöiset; kantaan vain tunnisteen sha256)
CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `kind` enum('invite','reset','link') NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `auth_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

CREATE TABLE IF NOT EXISTS `notices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `message` mediumtext NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_trades` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `offered_shift_id` int(11) NOT NULL,
  `offered_by_id` int(11) NOT NULL,
  `requested_by_id` int(11) DEFAULT NULL,
  `status` enum('open','pending','accepted','rejected') NOT NULL DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `target_user_id` int(11) DEFAULT NULL,
  `swap_shift_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `offered_by_id` (`offered_by_id`),
  KEY `offered_shift_id` (`offered_shift_id`),
  CONSTRAINT `trades_offered_by` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `trades_shift` FOREIGN KEY (`offered_shift_id`) REFERENCES `shifts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `time_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `clock_in` datetime NOT NULL,
  `clock_out` datetime DEFAULT NULL,
  `alerted_at` datetime DEFAULT NULL,               -- "ulosleimaus unohtui" -hälytys lähetetty
  PRIMARY KEY (`id`),
  KEY `idx_clock` (`clock_in`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `time_entries_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(255) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `kind` varchar(10) NOT NULL DEFAULT 'normal',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `task_completions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `task_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_date_task` (`date`,`task_id`),
  KEY `task_id` (`task_id`),
  CONSTRAINT `completions_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `image_path` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shopping_list` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `added_by` int(11) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `assigned_to` int(11) DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;



-- Viestit tallennetaan salattuna (sovelluskerroksessa), ei selkotekstinä.
CREATE TABLE IF NOT EXISTS `private_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pair` (`sender_id`,`receiver_id`),
  CONSTRAINT `pm_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pm_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `endpoint` (`endpoint`(255)),
  CONSTRAINT `push_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Kirjautumisyritysten rajoitus (brute force -suoja)
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `username` varchar(150) NOT NULL,
  `attempted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ip_time` (`ip`,`attempted_at`),
  KEY `user_time` (`username`,`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `staffing_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dow` tinyint(4) DEFAULT NULL,                    -- 0 = ma ... 6 = su; NULL = joka päivä
  `start` time NOT NULL,
  `end` time NOT NULL,
  `role` varchar(50) DEFAULT NULL,                  -- NULL = mikä tahansa rooli
  `min_staff` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `availability_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `dow` tinyint(4) NOT NULL,                        -- 0 = ma ... 6 = su
  `valid_from` date DEFAULT NULL,
  `valid_to` date DEFAULT NULL,
  `note` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `avail_rules_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `daily_sales` (
  `date` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `checklists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `items` text NOT NULL,                            -- JSON: [tehtävätekstit]
  PRIMARY KEY (`id`)
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
  `title` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `file_path` varchar(255) NOT NULL,                -- suhteellinen polku uploads/docs/ alla; ladataan vain API:n kautta
  `mime` varchar(60) NOT NULL,
  `size` int(11) NOT NULL DEFAULT 0,
  `requires_ack` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
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
  `from_user` int(11) NOT NULL,
  `to_user` int(11) NOT NULL,
  `message` varchar(300) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `surveys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` varchar(300) NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
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


CREATE TABLE IF NOT EXISTS `event_registrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `qty` tinyint(4) NOT NULL DEFAULT 1,
  `status` enum('confirmed','cancelled','pending') NOT NULL DEFAULT 'confirmed',   -- pending = odottaa maksua (Stripe)
  `arrived` tinyint(1) NOT NULL DEFAULT 0,
  `code` varchar(12) NOT NULL,
  `cancel_hash` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reminded_at` datetime DEFAULT NULL,
  `paid_cents` int(11) DEFAULT NULL,
  `payment_ref` varchar(80) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `feedback_hash` char(64) DEFAULT NULL,
  `feedback_sent_at` datetime DEFAULT NULL,
  `rating` tinyint(4) DEFAULT NULL,
  `feedback_text` varchar(500) DEFAULT NULL,
  `feedback_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cancel_hash` (`cancel_hash`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `reg_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
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
  KEY `idx_starts` (`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cash_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `sales_total` decimal(10,2) NOT NULL,
  `card_total` decimal(10,2) DEFAULT NULL,
  `counted_cash` decimal(10,2) DEFAULT NULL,
  `float_amount` decimal(10,2) DEFAULT NULL,
  `note` varchar(500) NOT NULL DEFAULT '',
  `user_id` int(11) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `photo_path` varchar(120) DEFAULT NULL,
  `expenses` decimal(10,2) DEFAULT NULL,
  `tips` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

CREATE TABLE IF NOT EXISTS `system_status` (
  `k` varchar(40) NOT NULL,
  `v` varchar(255) NOT NULL DEFAULT '',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `skills` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `for_role` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
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
  KEY `idx_month` (`month`),
  CONSTRAINT `hc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  UNIQUE KEY `uq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sms_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `to_phone` varchar(20) NOT NULL,
  `ok` tinyint(1) NOT NULL DEFAULT 0,
  `error` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

CREATE TABLE IF NOT EXISTS `hub_sync` (
  `kind` enum('event','shift','profile') NOT NULL, `local_id` int(11) NOT NULL, `hash` char(40) NOT NULL, `synced_at` datetime NOT NULL DEFAULT current_timestamp(),
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

CREATE TABLE IF NOT EXISTS `hub_feed` (
  `hub_shift_id` int(11) NOT NULL, `bar_name` varchar(120) NOT NULL, `city` varchar(80) NOT NULL DEFAULT '', `date` date NOT NULL,
  `time_start` time NOT NULL, `time_end` time NOT NULL, `role` varchar(60) DEFAULT NULL, `pay_text` varchar(80) DEFAULT NULL, `note` varchar(300) DEFAULT NULL,
  `first_seen` datetime NOT NULL DEFAULT current_timestamp(), `gone` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`hub_shift_id`), KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `hub_outgoing` (
  `id` int(11) NOT NULL AUTO_INCREMENT, `hub_application_id` int(11) NOT NULL, `hub_shift_id` int(11) NOT NULL, `user_id` int(11) NOT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending', `bar_name` varchar(120) NOT NULL, `city` varchar(80) NOT NULL DEFAULT '', `date` date NOT NULL,
  `time_start` time NOT NULL, `time_end` time NOT NULL, `role` varchar(60) DEFAULT NULL, `address` varchar(200) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(), `decided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_hub_app` (`hub_application_id`), UNIQUE KEY `uq_user_shift` (`user_id`,`hub_shift_id`),
  CONSTRAINT `hub_outgoing_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
