-- BarShift Pro: DEMO-data (demobaari), ajalle -30 ... +30 päivää tästä päivästä.
-- Päivämäärät lasketaan ajohetkestä (CURDATE()), joten data näyttää aina tuoreelta.
--
-- VAROITUS: vain kehitys-/esittelykäyttöön. Kaikilla demobaarin käyttäjillä on sama
-- julkinen salasana (ks. README). ÄLÄ AJA TUOTANTOTIETOKANTAAN.
-- Tuo schema.sql ensin:  mysql TIETOKANTA < db/schema.sql && mysql TIETOKANTA < db/seed_demo.sql
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM `job_listing_approvals` WHERE `pub_name` = 'demobaari';
DELETE FROM `job_listings` WHERE `from_pub` = 'demobaari';
DELETE FROM `task_completions` WHERE `pub_name` = 'demobaari';
DELETE FROM `tasks` WHERE `pub_name` = 'demobaari';
DELETE FROM `user_skills` WHERE `skill_id` IN (SELECT id FROM `skills` WHERE `pub_name` = 'demobaari');
DELETE FROM `skills` WHERE `pub_name` = 'demobaari';
DELETE FROM `event_guests` WHERE `event_id` IN (SELECT id FROM `events` WHERE `pub_name` = 'demobaari');
DELETE FROM `hour_confirmations` WHERE `pub_name` = 'demobaari';
DELETE FROM `cash_reports` WHERE `pub_name` = 'demobaari';
DELETE FROM `daily_sales` WHERE `pub_name` = 'demobaari';
DELETE FROM `shift_trades` WHERE `offered_by_id` IN (SELECT id FROM users WHERE pub_name = 'demobaari');
DELETE FROM `shifts` WHERE `pub_name` = 'demobaari';
DELETE FROM `absences` WHERE `user_id` IN (SELECT id FROM users WHERE pub_name = 'demobaari');
DELETE FROM `time_entries` WHERE `pub_name` = 'demobaari';
DELETE FROM `availability` WHERE `pub_name` = 'demobaari';
DELETE FROM `events` WHERE `pub_name` IN ('demobaari','demo-satama','demo-kellari');
DELETE FROM `pubs` WHERE `slug` IN ('demobaari','demo-satama','demo-kellari');
DELETE FROM `pub_profiles` WHERE `pub_name` IN ('demobaari','demo-satama','demo-kellari');
DELETE FROM `notices` WHERE `pub_name` = 'demobaari';
DELETE FROM `shift_logs` WHERE `pub_name` = 'demobaari';
DELETE FROM `shopping_list` WHERE `pub_name` = 'demobaari';
DELETE FROM `users` WHERE `pub_name` = 'demobaari';

INSERT INTO `users` (`id`,`name`,`username`,`password`,`role`,`color`,`pub_name`,`phone`,`hourly_wage`,`status`,`target_hours`,`expiry_jv`,`has_hygiene`,`has_alcohol`,`start_date`,`employment_type`) VALUES
(9001,'Demo Admin','admin','$2y$12$9QBwHRXY3ukZFf1G7ydjV.FlG8MvoLEGYoejRWq5QIAjVuNGQNbIa','admin','#E14D2A','demobaari','040 555 0101',15.0,'active',0,NULL,1,1,DATE_ADD(CURDATE(), INTERVAL -1800 DAY),'regular'),
(9002,'Mikko Mäkinen','mikko','$2y$12$9QBwHRXY3ukZFf1G7ydjV.FlG8MvoLEGYoejRWq5QIAjVuNGQNbIa','employee','#3B82F6','demobaari','040 555 0102',12.0,'active',120,NULL,1,1,DATE_ADD(CURDATE(), INTERVAL -1100 DAY),'regular'),
(9003,'Sari Salo','sari','$2y$12$9QBwHRXY3ukZFf1G7ydjV.FlG8MvoLEGYoejRWq5QIAjVuNGQNbIa','employee','#10B981','demobaari','040 555 0103',11.5,'active',100,NULL,0,1,DATE_ADD(CURDATE(), INTERVAL -300 DAY),'regular'),
(9004,'Jere Järvinen','jere','$2y$12$9QBwHRXY3ukZFf1G7ydjV.FlG8MvoLEGYoejRWq5QIAjVuNGQNbIa','employee','#F59E0B','demobaari','040 555 0104',13.0,'active',80,DATE_ADD(CURDATE(), INTERVAL 25 DAY),0,0,DATE_ADD(CURDATE(), INTERVAL -75 DAY),'regular'),
(9005,'Laura Laine','laura','$2y$12$9QBwHRXY3ukZFf1G7ydjV.FlG8MvoLEGYoejRWq5QIAjVuNGQNbIa','employee','#8B5CF6','demobaari','040 555 0105',14.5,'active',140,NULL,1,1,DATE_ADD(CURDATE(), INTERVAL -700 DAY),'regular'),
(9006,'Teemu Toivonen','teemu','$2y$12$9QBwHRXY3ukZFf1G7ydjV.FlG8MvoLEGYoejRWq5QIAjVuNGQNbIa','employee','#EF4444','demobaari','040 555 0106',10.5,'active',60,NULL,0,0,DATE_ADD(CURDATE(), INTERVAL -240 DAY),'casual');

INSERT INTO `shifts` (`id`,`userId`,`date`,`start`,`end`,`role`,`pub_name`) VALUES
(90001,9005,DATE_ADD(CURDATE(), INTERVAL -28 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90002,9003,DATE_ADD(CURDATE(), INTERVAL -28 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90003,9005,DATE_ADD(CURDATE(), INTERVAL -27 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90004,9003,DATE_ADD(CURDATE(), INTERVAL -27 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90005,9002,DATE_ADD(CURDATE(), INTERVAL -26 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90006,9003,DATE_ADD(CURDATE(), INTERVAL -26 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90007,9006,DATE_ADD(CURDATE(), INTERVAL -26 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90008,9004,DATE_ADD(CURDATE(), INTERVAL -26 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90009,9002,DATE_ADD(CURDATE(), INTERVAL -25 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90010,9003,DATE_ADD(CURDATE(), INTERVAL -25 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90011,9006,DATE_ADD(CURDATE(), INTERVAL -25 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90012,9004,DATE_ADD(CURDATE(), INTERVAL -25 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90013,9005,DATE_ADD(CURDATE(), INTERVAL -24 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90014,9003,DATE_ADD(CURDATE(), INTERVAL -24 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90015,9002,DATE_ADD(CURDATE(), INTERVAL -21 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90016,9003,DATE_ADD(CURDATE(), INTERVAL -21 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90017,9005,DATE_ADD(CURDATE(), INTERVAL -20 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90018,9003,DATE_ADD(CURDATE(), INTERVAL -20 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90019,9002,DATE_ADD(CURDATE(), INTERVAL -19 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90020,9003,DATE_ADD(CURDATE(), INTERVAL -19 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90021,9006,DATE_ADD(CURDATE(), INTERVAL -19 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90022,9004,DATE_ADD(CURDATE(), INTERVAL -19 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90023,9002,DATE_ADD(CURDATE(), INTERVAL -18 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90024,9003,DATE_ADD(CURDATE(), INTERVAL -18 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90025,9006,DATE_ADD(CURDATE(), INTERVAL -18 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90026,9004,DATE_ADD(CURDATE(), INTERVAL -18 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90027,9005,DATE_ADD(CURDATE(), INTERVAL -17 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90028,9006,DATE_ADD(CURDATE(), INTERVAL -17 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90029,9002,DATE_ADD(CURDATE(), INTERVAL -14 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90030,9003,DATE_ADD(CURDATE(), INTERVAL -14 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90031,9005,DATE_ADD(CURDATE(), INTERVAL -13 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90032,9003,DATE_ADD(CURDATE(), INTERVAL -13 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90033,9002,DATE_ADD(CURDATE(), INTERVAL -12 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90034,9003,DATE_ADD(CURDATE(), INTERVAL -12 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90035,9006,DATE_ADD(CURDATE(), INTERVAL -12 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90036,9004,DATE_ADD(CURDATE(), INTERVAL -12 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90037,9002,DATE_ADD(CURDATE(), INTERVAL -11 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90038,9003,DATE_ADD(CURDATE(), INTERVAL -11 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90039,9006,DATE_ADD(CURDATE(), INTERVAL -11 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90040,9004,DATE_ADD(CURDATE(), INTERVAL -11 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90041,9005,DATE_ADD(CURDATE(), INTERVAL -10 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90042,9006,DATE_ADD(CURDATE(), INTERVAL -10 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90043,9005,DATE_ADD(CURDATE(), INTERVAL -7 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90044,9006,DATE_ADD(CURDATE(), INTERVAL -7 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90045,9005,DATE_ADD(CURDATE(), INTERVAL -6 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90046,9006,DATE_ADD(CURDATE(), INTERVAL -6 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90047,9002,DATE_ADD(CURDATE(), INTERVAL -5 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90048,9003,DATE_ADD(CURDATE(), INTERVAL -5 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90049,9006,DATE_ADD(CURDATE(), INTERVAL -5 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90050,9004,DATE_ADD(CURDATE(), INTERVAL -5 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90051,9005,DATE_ADD(CURDATE(), INTERVAL -4 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90052,9006,DATE_ADD(CURDATE(), INTERVAL -4 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90053,9003,DATE_ADD(CURDATE(), INTERVAL -4 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90054,9004,DATE_ADD(CURDATE(), INTERVAL -4 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90055,9005,DATE_ADD(CURDATE(), INTERVAL -3 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90056,9003,DATE_ADD(CURDATE(), INTERVAL -3 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90057,9002,DATE_ADD(CURDATE(), INTERVAL 0 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90058,9006,DATE_ADD(CURDATE(), INTERVAL 0 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90059,9002,DATE_ADD(CURDATE(), INTERVAL 1 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90060,9006,DATE_ADD(CURDATE(), INTERVAL 1 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90061,9002,DATE_ADD(CURDATE(), INTERVAL 2 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90062,9006,DATE_ADD(CURDATE(), INTERVAL 2 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90063,9003,DATE_ADD(CURDATE(), INTERVAL 2 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90064,9004,DATE_ADD(CURDATE(), INTERVAL 2 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90065,9002,DATE_ADD(CURDATE(), INTERVAL 3 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90066,9006,DATE_ADD(CURDATE(), INTERVAL 3 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90067,9003,DATE_ADD(CURDATE(), INTERVAL 3 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90068,NULL,DATE_ADD(CURDATE(), INTERVAL 3 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90069,9002,DATE_ADD(CURDATE(), INTERVAL 4 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90070,9006,DATE_ADD(CURDATE(), INTERVAL 4 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90071,NULL,DATE_ADD(CURDATE(), INTERVAL 7 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90072,9006,DATE_ADD(CURDATE(), INTERVAL 7 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90073,9005,DATE_ADD(CURDATE(), INTERVAL 8 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90074,9006,DATE_ADD(CURDATE(), INTERVAL 8 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90075,NULL,DATE_ADD(CURDATE(), INTERVAL 9 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90076,9006,DATE_ADD(CURDATE(), INTERVAL 9 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90077,9003,DATE_ADD(CURDATE(), INTERVAL 9 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90078,9004,DATE_ADD(CURDATE(), INTERVAL 9 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90079,9002,DATE_ADD(CURDATE(), INTERVAL 10 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90080,9006,DATE_ADD(CURDATE(), INTERVAL 10 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90081,NULL,DATE_ADD(CURDATE(), INTERVAL 10 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90082,9004,DATE_ADD(CURDATE(), INTERVAL 10 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90083,9005,DATE_ADD(CURDATE(), INTERVAL 11 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90084,9006,DATE_ADD(CURDATE(), INTERVAL 11 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90085,9005,DATE_ADD(CURDATE(), INTERVAL 14 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90086,9006,DATE_ADD(CURDATE(), INTERVAL 14 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90087,9005,DATE_ADD(CURDATE(), INTERVAL 15 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90088,NULL,DATE_ADD(CURDATE(), INTERVAL 15 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90089,9002,DATE_ADD(CURDATE(), INTERVAL 16 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90090,NULL,DATE_ADD(CURDATE(), INTERVAL 16 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90091,9006,DATE_ADD(CURDATE(), INTERVAL 16 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90092,9004,DATE_ADD(CURDATE(), INTERVAL 16 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90093,9005,DATE_ADD(CURDATE(), INTERVAL 17 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90094,9006,DATE_ADD(CURDATE(), INTERVAL 17 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90095,9003,DATE_ADD(CURDATE(), INTERVAL 17 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90096,9004,DATE_ADD(CURDATE(), INTERVAL 17 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90097,9005,DATE_ADD(CURDATE(), INTERVAL 18 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90098,NULL,DATE_ADD(CURDATE(), INTERVAL 18 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90099,9002,DATE_ADD(CURDATE(), INTERVAL 21 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90100,9006,DATE_ADD(CURDATE(), INTERVAL 21 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90101,9005,DATE_ADD(CURDATE(), INTERVAL 22 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90102,NULL,DATE_ADD(CURDATE(), INTERVAL 22 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90103,9002,DATE_ADD(CURDATE(), INTERVAL 23 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90104,9006,DATE_ADD(CURDATE(), INTERVAL 23 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90105,9003,DATE_ADD(CURDATE(), INTERVAL 23 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90106,9004,DATE_ADD(CURDATE(), INTERVAL 23 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari'),
(90107,9005,DATE_ADD(CURDATE(), INTERVAL 24 DAY),'15:00:00','03:00:00','Baarimestari','demobaari'),
(90108,9006,DATE_ADD(CURDATE(), INTERVAL 24 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90109,9003,DATE_ADD(CURDATE(), INTERVAL 24 DAY),'18:00:00','04:00:00','Tarjoilija','demobaari'),
(90110,9004,DATE_ADD(CURDATE(), INTERVAL 24 DAY),'21:00:00','04:00:00','Järjestyksenvalvoja','demobaari'),
(90111,NULL,DATE_ADD(CURDATE(), INTERVAL 25 DAY),'14:00:00','22:00:00','Baarimestari','demobaari'),
(90112,9003,DATE_ADD(CURDATE(), INTERVAL 25 DAY),'15:00:00','21:00:00','Tarjoilija','demobaari'),
(90113,9005,DATE_ADD(CURDATE(), INTERVAL 28 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90114,9003,DATE_ADD(CURDATE(), INTERVAL 28 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90115,9002,DATE_ADD(CURDATE(), INTERVAL 29 DAY),'16:00:00','00:00:00','Baarimestari','demobaari'),
(90116,9006,DATE_ADD(CURDATE(), INTERVAL 29 DAY),'17:00:00','23:00:00','Tarjoilija','demobaari'),
(90117,9002,DATE_ADD(CURDATE(), INTERVAL 30 DAY),'16:00:00','02:00:00','Baarimestari','demobaari'),
(90118,9006,DATE_ADD(CURDATE(), INTERVAL 30 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90119,9003,DATE_ADD(CURDATE(), INTERVAL 30 DAY),'18:00:00','03:00:00','Tarjoilija','demobaari'),
(90120,9004,DATE_ADD(CURDATE(), INTERVAL 30 DAY),'21:00:00','03:00:00','Järjestyksenvalvoja','demobaari');

INSERT INTO `time_entries` (`id`,`user_id`,`pub_name`,`clock_in`,`clock_out`) VALUES
(1,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -28 DAY), '15:59:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -27 DAY), '00:06:00')),
(2,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -28 DAY), '17:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -28 DAY), '23:12:00')),
(3,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -27 DAY), '16:04:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -26 DAY), '00:15:00')),
(4,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -27 DAY), '17:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -27 DAY), '23:14:00')),
(5,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -26 DAY), '16:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '02:20:00')),
(6,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -26 DAY), '18:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '03:21:00')),
(7,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -26 DAY), '18:06:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '03:18:00')),
(8,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -26 DAY), '21:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '03:01:00')),
(9,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '15:09:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '03:06:00')),
(10,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '17:54:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '03:55:00')),
(11,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '18:02:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '04:10:00')),
(12,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -25 DAY), '21:02:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '04:01:00')),
(13,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '14:05:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '22:09:00')),
(14,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '15:05:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -24 DAY), '21:25:00')),
(15,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -21 DAY), '16:05:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -20 DAY), '-1:57:00')),
(16,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -21 DAY), '17:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -21 DAY), '22:58:00')),
(17,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -20 DAY), '16:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -19 DAY), '00:10:00')),
(18,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -20 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -20 DAY), '23:05:00')),
(19,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -19 DAY), '16:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '02:10:00')),
(20,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -19 DAY), '17:54:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '03:10:00')),
(21,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -19 DAY), '18:05:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '03:20:00')),
(22,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -19 DAY), '20:56:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '03:21:00')),
(23,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '14:57:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '03:24:00')),
(24,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '18:06:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '04:20:00')),
(25,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '18:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '04:10:00')),
(26,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -18 DAY), '20:59:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '04:08:00')),
(27,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '14:04:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '21:57:00')),
(28,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '15:06:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -17 DAY), '21:09:00')),
(29,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -14 DAY), '16:06:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -13 DAY), '00:18:00')),
(30,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -14 DAY), '16:56:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -14 DAY), '23:18:00')),
(31,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -13 DAY), '15:59:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -12 DAY), '00:00:00')),
(32,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -13 DAY), '16:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -13 DAY), '22:55:00')),
(33,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -12 DAY), '15:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '02:13:00')),
(34,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -12 DAY), '18:08:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '03:20:00')),
(35,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -12 DAY), '17:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '03:14:00')),
(36,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -12 DAY), '21:09:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '03:16:00')),
(37,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '15:05:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '02:59:00')),
(38,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '17:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '03:55:00')),
(39,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '17:54:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '04:20:00')),
(40,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -11 DAY), '20:57:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '04:11:00')),
(41,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '13:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '22:08:00')),
(42,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '15:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '21:21:00')),
(43,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -7 DAY), '16:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '-1:55:00')),
(44,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -7 DAY), '17:02:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -7 DAY), '23:01:00')),
(45,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '16:03:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '00:11:00')),
(46,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '17:01:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '23:19:00')),
(47,9002,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '16:04:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '02:03:00')),
(48,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '18:07:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '03:21:00')),
(49,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '17:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '02:56:00')),
(50,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '21:05:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '03:23:00')),
(51,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '15:08:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '03:16:00')),
(52,9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '18:07:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '04:21:00')),
(53,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '17:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '04:12:00')),
(54,9004,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '20:58:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '04:11:00')),
(55,9005,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '13:54:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '22:22:00')),
(56,9003,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '15:08:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '21:19:00'));

INSERT INTO `events` (`title`,`date`,`type`,`time`,`time_start`,`time_end`,`pub_name`,`description`,`is_public`) VALUES
('🎯 Darts-kisat',DATE_ADD(CURDATE(), INTERVAL -27 DAY),'sports','16:00:00','16:00:00','23:00:00','demobaari','Avoimet kisat, ilmoittautuminen paikan päällä.',1),
('🎵 Live: Paikallinen bändi',DATE_ADD(CURDATE(), INTERVAL -20 DAY),'music','21:00:00','21:00:00','01:00:00','demobaari','Rokkia ja covereita. Vapaa pääsy.',1),
('🍺 Olutmaistelu',DATE_ADD(CURDATE(), INTERVAL -13 DAY),'theme','17:00:00','17:00:00','21:00:00','demobaari','Viisi pienpanimo-olutta ja pikku purtavaa.',1),
('🎤 Karaokeilta',DATE_ADD(CURDATE(), INTERVAL -6 DAY),'music','20:00:00','20:00:00','01:00:00','demobaari','Laulu raikaa! Valikoimassa yli 10 000 kappaletta.',1),
('🎵 DJ Allu',DATE_ADD(CURDATE(), INTERVAL 2 DAY),'music','22:00:00','22:00:00','03:30:00','demobaari','Klubimusiikkia aamuun asti. Ikäraja 18 v.',1),
('🧠 Tietovisa',DATE_ADD(CURDATE(), INTERVAL 5 DAY),'quiz','19:00:00','19:00:00','22:00:00','demobaari','Joukkueet 2–5 henkeä. Voittajalle kunniaa ja tuopit.',1),
('⚽ Jalkapallon MM-karsinta valkokankaalla',DATE_ADD(CURDATE(), INTERVAL 9 DAY),'sports','20:00:00','20:00:00','23:00:00','demobaari','Iso screen ja tunnelmaa. Ruokatarjoukset ottelun ajan.',1),
('🎵 Akustinen ilta',DATE_ADD(CURDATE(), INTERVAL 16 DAY),'music','20:00:00','20:00:00','00:00:00','demobaari','Rauhallinen ilta akustisen musiikin parissa.',1),
('🎉 Halloween-bileet',DATE_ADD(CURDATE(), INTERVAL 24 DAY),'theme','21:00:00','21:00:00','03:00:00','demobaari','Naamiaisasu tuo tarjouksen. Parhaat asut palkitaan!',1),
('🎤 Stand up -ilta',DATE_ADD(CURDATE(), INTERVAL 30 DAY),'other','20:00:00','20:00:00','23:00:00','demobaari','Kolme koomikkoa ja juontaja. Liput ovelta.',1);

-- Baarit omina entiteetteinään (asetukset, palkkalisät)
INSERT INTO `pubs` (`slug`,`name`,`roles`,`billing_name`,`billing_email`) VALUES
('demobaari','Demobaari','["Baarimestari","Järjestyksenvalvoja","Tarjoilija","Vuoropäällikkö"]','Demobaari Oy','laskutus@demobaari.example'),
('demo-satama','Satamabaari (demo)',NULL,NULL,NULL),
('demo-kellari','Kellari (demo)',NULL,NULL,NULL);

-- Julkiset profiilit: demobaari + kaksi kuvitteellista esimerkkibaaria julkista tapahtumakalenteria varten
INSERT INTO `pub_profiles` (`pub_name`,`display_name`,`description`,`address`,`city`,`lat`,`lng`,`website`,`color`,`is_public`) VALUES
('demobaari','Demobaari','Tunnelmallinen esimerkkibaari keskustassa. Elävää musiikkia ja visoja viikoittain.','Esimerkkikatu 1','Helsinki',60.169900,24.938400,'https://example.com/demobaari','#E14D2A',1),
('demo-satama','Satamabaari (demo)','Kuvitteellinen satamabaari jokivarressa. Terassi ja live-musiikkia.','Satamakatu 12','Turku',60.449700,22.274000,'https://example.com/satama','#0D9488',1),
('demo-kellari','Kellari (demo)','Kuvitteellinen kellaribaari: pubivisat ja urheilut isolta ruudulta.','Kellarikatu 5','Tampere',61.497800,23.761000,NULL,'#3B82F6',1);

INSERT INTO `events` (`title`,`date`,`type`,`time`,`time_start`,`time_end`,`pub_name`,`description`,`is_public`) VALUES
('🎵 Jazz-ilta jokivarressa',DATE_ADD(CURDATE(), INTERVAL 1 DAY),'music','19:00:00','19:00:00','23:00:00','demo-satama','Kolmen hengen jazz-yhtye terassilla.',1),
('🍻 Oktoberfest',DATE_ADD(CURDATE(), INTERVAL 4 DAY),'theme','17:00:00','17:00:00','01:00:00','demo-satama','Olutta ja makkaraa, saksalaista tunnelmaa.',1),
('🎸 Rockiltama',DATE_ADD(CURDATE(), INTERVAL 8 DAY),'music','21:00:00','21:00:00','02:00:00','demo-satama','Kolme paikallista bändiä samalla lipulla.',1),
('🧠 Pubivisa',DATE_ADD(CURDATE(), INTERVAL 15 DAY),'quiz','19:00:00','19:00:00','21:30:00','demo-satama','Kysymyksiä musiikista, elokuvista ja urheilusta.',1),
('🎤 Karaokekilpailu',DATE_ADD(CURDATE(), INTERVAL 22 DAY),'music','20:00:00','20:00:00','01:00:00','demo-satama','Voittaja saa 100 euron lahjakortin.',1),
('🎵 Kesän päätösjuhla',DATE_ADD(CURDATE(), INTERVAL -10 DAY),'music','20:00:00','20:00:00','02:00:00','demo-satama','Kiitos kesästä!',1),
('⚽ Liigaottelu isolta ruudulta',DATE_ADD(CURDATE(), INTERVAL 0 DAY),'sports','18:00:00','18:00:00','22:00:00','demo-kellari','Ottelun ajan tuoppitarjous.',1),
('🧠 Suuri tietovisa',DATE_ADD(CURDATE(), INTERVAL 3 DAY),'quiz','19:30:00','19:30:00','22:30:00','demo-kellari','Joukkueille, max 5 hlö. Ilmoittautuminen ovella.',1),
('🎯 Darts-turnaus',DATE_ADD(CURDATE(), INTERVAL 6 DAY),'sports','17:00:00','17:00:00','22:00:00','demo-kellari','Avoin turnaus kaikkien tasojen pelaajille.',1),
('🎵 DJ-ilta',DATE_ADD(CURDATE(), INTERVAL 10 DAY),'music','22:00:00','22:00:00','04:00:00','demo-kellari','Tanssittava setti aamuun.',1),
('🎉 Bilebingo',DATE_ADD(CURDATE(), INTERVAL 17 DAY),'theme','20:00:00','20:00:00','23:00:00','demo-kellari','Palkintoina lahjakortteja.',1),
('⚽ Derby-ilta',DATE_ADD(CURDATE(), INTERVAL 26 DAY),'sports','19:00:00','19:00:00','22:00:00','demo-kellari','Suuren ottelun tunnelmaa.',1);

INSERT INTO `absences` (`user_id`,`type`,`start_date`,`end_date`,`description`,`status`) VALUES
(9003,'sick',DATE_ADD(CURDATE(), INTERVAL -12 DAY),DATE_ADD(CURDATE(), INTERVAL -10 DAY),'Kuumetta ja flunssaa','approved'),
(9002,'vacation',DATE_ADD(CURDATE(), INTERVAL 14 DAY),DATE_ADD(CURDATE(), INTERVAL 20 DAY),'Lomamatka','pending'),
(9006,'other',DATE_ADD(CURDATE(), INTERVAL 7 DAY),DATE_ADD(CURDATE(), INTERVAL 8 DAY),'Serkun häät','pending'),
(9005,'vacation',DATE_ADD(CURDATE(), INTERVAL -25 DAY),DATE_ADD(CURDATE(), INTERVAL -22 DAY),'Pidennetty viikonloppu','approved'),
(9004,'other',DATE_ADD(CURDATE(), INTERVAL 3 DAY),DATE_ADD(CURDATE(), INTERVAL 3 DAY),'Hammaslääkäri','rejected'),
(9002,'vacation',DATE_ADD(CURDATE(), INTERVAL -70 DAY),DATE_ADD(CURDATE(), INTERVAL -64 DAY),'Kesäloma','approved'),
(9001,'vacation',DATE_ADD(CURDATE(), INTERVAL -95 DAY),DATE_ADD(CURDATE(), INTERVAL -90 DAY),'Mökkiviikko','approved'),
(9005,'vacation',DATE_ADD(CURDATE(), INTERVAL -140 DAY),DATE_ADD(CURDATE(), INTERVAL -134 DAY),'Matka','approved'),
(9003,'vacation',DATE_ADD(CURDATE(), INTERVAL 21 DAY),DATE_ADD(CURDATE(), INTERVAL 27 DAY),'Syysloma','pending');

INSERT INTO `time_entries` (`user_id`,`pub_name`,`clock_in`,`clock_out`) VALUES
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -237 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -237 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -234 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -234 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -230 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -230 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -227 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -227 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -223 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -223 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -220 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -220 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -209 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -209 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -202 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -202 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -195 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -195 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -178 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -178 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -175 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -175 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -171 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -171 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -168 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -168 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -164 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -164 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -161 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -161 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -148 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -148 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -145 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -145 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -141 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -141 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -138 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -138 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -134 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -134 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -131 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -131 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -117 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -117 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -114 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -114 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -110 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -110 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -107 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -107 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -103 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -103 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -100 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -100 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -87 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -87 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -84 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -84 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -80 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -80 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -77 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -77 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -73 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -73 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -70 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -70 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -56 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -56 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -53 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -53 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -49 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -49 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -46 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -46 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -42 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -42 DAY), '23:30:00')),
(9006,'demobaari',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -39 DAY), '17:00:00'),TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -39 DAY), '23:30:00'));

INSERT INTO `shift_trades` (`offered_shift_id`,`offered_by_id`,`requested_by_id`,`status`,`created_at`) VALUES
(90072,9006,NULL,'open',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -1 DAY), '12:00:00')),
(90077,9003,9002,'pending',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -2 DAY), '18:30:00')),
(90004,9003,9002,'accepted',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -29 DAY), '10:15:00'));

INSERT INTO `notices` (`pub_name`,`message`,`created_at`) VALUES
('demobaari','Tervetuloa BarShiftin demoon! Tämä on esimerkkidataa.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -29 DAY), '09:00:00')),
('demobaari','Muistakaa tarkistaa uudet ruokalistat pöydistä ennen vuoron alkua.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -15 DAY), '14:20:00')),
('demobaari','Lomatoiveet seuraavalle kuulle pitää jättää järjestelmään viikon sisällä.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '10:05:00')),
('demobaari','Uusi kassajärjestelmä otetaan käyttöön ensi viikolla, koulutus ennen vuoroa.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -1 DAY), '16:45:00'));

INSERT INTO `tasks` (`id`,`pub_name`,`label`,`sort_order`,`kind`) VALUES
(9001,'demobaari','Hanojen pesu ja puhdistus',0,'normal'),
(9002,'demobaari','Terassin kalusteiden asettelu',1,'normal'),
(9003,'demobaari','Kylmäkaappien täyttö (limut & oluet)',2,'normal'),
(9004,'demobaari','Musiikin ja valojen tarkistus',3,'normal'),
(9005,'demobaari','Kassatilitys ja raportointi',4,'cash'),
(9006,'demobaari','Wc-tilojen tarkistus',5,'normal'),
(9007,'demobaari','Loppusiivous',6,'normal');

INSERT INTO `task_completions` (`pub_name`,`date`,`task_id`) VALUES
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -28 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -27 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -26 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -26 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -26 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -26 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -26 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -26 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -25 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -24 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -24 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -24 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -24 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -21 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -20 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -19 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -19 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -19 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -19 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -18 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -17 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -14 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -14 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -14 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -14 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -14 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -13 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -13 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -13 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -13 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -13 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -13 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -12 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -12 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -12 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -12 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -12 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -12 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -11 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -11 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -11 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -11 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -11 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -11 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -10 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -10 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -10 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -10 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -10 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -10 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -7 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -6 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -5 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -4 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -4 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -4 DAY),9004),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -4 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -4 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -4 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -3 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -3 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -3 DAY),9003),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -3 DAY),9005),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -3 DAY),9006),
('demobaari',DATE_ADD(CURDATE(), INTERVAL -3 DAY),9007),
('demobaari',DATE_ADD(CURDATE(), INTERVAL 0 DAY),9001),
('demobaari',DATE_ADD(CURDATE(), INTERVAL 0 DAY),9002),
('demobaari',DATE_ADD(CURDATE(), INTERVAL 0 DAY),9003);

INSERT INTO `shift_logs` (`pub_name`,`user_id`,`message`,`created_at`) VALUES
('demobaari',9005,'Rauhallinen ilta, kassa täsmäsi.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -28 DAY), '23:30:00')),
('demobaari',9002,'Yksi rikkoutunut tuoli viety varastoon.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -21 DAY), '23:30:00')),
('demobaari',9004,'Ovella oli jonoa klo 23–24, ei häiriöitä.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -14 DAY), '23:30:00')),
('demobaari',9003,'Oluthana 2 vuotaa hieman, huolto kutsuttava.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -9 DAY), '23:30:00')),
('demobaari',9005,'Livebändin ilta täynnä, limuja loppui kesken.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '23:30:00')),
('demobaari',9002,'Kylmiö toimii taas normaalisti.',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -1 DAY), '23:30:00'));

INSERT INTO `shopping_list` (`pub_name`,`added_by`,`item_name`,`status`,`created_at`) VALUES
('demobaari',9003,'Pillit ja lautasliinat','pending',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '12:00:00')),
('demobaari',9002,'Sitruunoita ja limeä','pending',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '12:00:00')),
('demobaari',9005,'Jäätä 20 kg','pending',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '12:00:00')),
('demobaari',9002,'Kahvipavut','completed',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -10 DAY), '12:00:00')),
('demobaari',9006,'Siivousaineet','completed',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -8 DAY), '12:00:00'));

INSERT IGNORE INTO `availability` (`user_id`,`pub_name`,`date`,`status`) VALUES
(9002,'demobaari',DATE_ADD(CURDATE(), INTERVAL 2 DAY),'unavailable'),
(9002,'demobaari',DATE_ADD(CURDATE(), INTERVAL 27 DAY),'unavailable'),
(9002,'demobaari',DATE_ADD(CURDATE(), INTERVAL 5 DAY),'available'),
(9002,'demobaari',DATE_ADD(CURDATE(), INTERVAL 1 DAY),'available'),
(9002,'demobaari',DATE_ADD(CURDATE(), INTERVAL 3 DAY),'available'),
(9002,'demobaari',DATE_ADD(CURDATE(), INTERVAL 21 DAY),'unavailable'),
(9003,'demobaari',DATE_ADD(CURDATE(), INTERVAL 28 DAY),'unavailable'),
(9003,'demobaari',DATE_ADD(CURDATE(), INTERVAL 17 DAY),'available'),
(9003,'demobaari',DATE_ADD(CURDATE(), INTERVAL 22 DAY),'unavailable'),
(9003,'demobaari',DATE_ADD(CURDATE(), INTERVAL 10 DAY),'available'),
(9003,'demobaari',DATE_ADD(CURDATE(), INTERVAL 20 DAY),'available'),
(9003,'demobaari',DATE_ADD(CURDATE(), INTERVAL 8 DAY),'unavailable'),
(9004,'demobaari',DATE_ADD(CURDATE(), INTERVAL 15 DAY),'unavailable'),
(9004,'demobaari',DATE_ADD(CURDATE(), INTERVAL 1 DAY),'available'),
(9004,'demobaari',DATE_ADD(CURDATE(), INTERVAL 9 DAY),'available'),
(9004,'demobaari',DATE_ADD(CURDATE(), INTERVAL 12 DAY),'unavailable'),
(9004,'demobaari',DATE_ADD(CURDATE(), INTERVAL 11 DAY),'available'),
(9004,'demobaari',DATE_ADD(CURDATE(), INTERVAL 18 DAY),'unavailable'),
(9005,'demobaari',DATE_ADD(CURDATE(), INTERVAL 6 DAY),'unavailable'),
(9005,'demobaari',DATE_ADD(CURDATE(), INTERVAL 1 DAY),'available'),
(9005,'demobaari',DATE_ADD(CURDATE(), INTERVAL 11 DAY),'available'),
(9005,'demobaari',DATE_ADD(CURDATE(), INTERVAL 13 DAY),'available'),
(9005,'demobaari',DATE_ADD(CURDATE(), INTERVAL 3 DAY),'available'),
(9005,'demobaari',DATE_ADD(CURDATE(), INTERVAL 16 DAY),'unavailable'),
(9006,'demobaari',DATE_ADD(CURDATE(), INTERVAL 27 DAY),'unavailable'),
(9006,'demobaari',DATE_ADD(CURDATE(), INTERVAL 3 DAY),'available'),
(9006,'demobaari',DATE_ADD(CURDATE(), INTERVAL 5 DAY),'unavailable'),
(9006,'demobaari',DATE_ADD(CURDATE(), INTERVAL 13 DAY),'unavailable'),
(9006,'demobaari',DATE_ADD(CURDATE(), INTERVAL 19 DAY),'available'),
(9006,'demobaari',DATE_ADD(CURDATE(), INTERVAL 2 DAY),'available');

INSERT INTO `job_listings` (`id`,`from_pub`,`created_by`,`message`,`contact`,`status`,`created_at`,`expires_at`) VALUES
(9000,'demobaari',9001,'Tarvitaan lisäkäsiä perjantaille, baarimestari tai tarjoilija.','demo@example.com','open',TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '15:00:00'),DATE_ADD(CURDATE(), INTERVAL 10 DAY));

-- Kassatilitykset ~14 kuukaudelta (ma suljettu): myynti kasvaa, pe-la vahvimmat, kesä ja joulu nousevat; kassaerot harvinaisia
INSERT INTO `cash_reports` (`pub_name`,`date`,`sales_total`,`card_total`,`counted_cash`,`float_amount`,`note`,`user_id`)
SELECT 'demobaari', d, sales, card, ROUND(200 + sales - card + IF(MOD(n,11)=0, -5 - MOD(n,7)*3, IF(MOD(n,17)=0, 4, 0)), 2), 200.00,
       IF(MOD(n,11)=0, 'Pieni kassavajaus', IF(MOD(n,29)=0, 'Yksityistilaisuus illalla', '')), IF(MOD(n,3)=0, 9002, IF(MOD(n,3)=1, 9003, 9001))
FROM (
  SELECT n, d, ROUND(base * wk * season * growth, 2) AS sales, ROUND(base * wk * season * growth * (0.62 + MOD(n,5)*0.02), 2) AS card
  FROM (
    SELECT n, DATE_ADD(CURDATE(), INTERVAL -n DAY) AS d, 1100 AS base,
      ELT(WEEKDAY(DATE_ADD(CURDATE(), INTERVAL -n DAY)) + 1, 0, 0.55, 0.7, 0.95, 1.6, 2.0, 1.1) AS wk,
      1 + 0.12 * SIN((MONTH(DATE_ADD(CURDATE(), INTERVAL -n DAY)) - 3) / 12 * 6.2832) + IF(MONTH(DATE_ADD(CURDATE(), INTERVAL -n DAY)) = 12, 0.15, 0) + (MOD(n * 7, 13) - 6) / 100 AS season,
      1 + (420 - n) / 420 * -0.18 AS growth
    FROM (SELECT a.N + b.N * 10 + c.N * 100 AS n FROM
      (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
      (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
      (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) c) nums
    WHERE n BETWEEN 1 AND 420
  ) x WHERE wk > 0
) y;
INSERT INTO `daily_sales` (`pub_name`,`date`,`amount`) SELECT `pub_name`,`date`,`sales_total` FROM `cash_reports` WHERE `pub_name` = 'demobaari';
INSERT IGNORE INTO `task_completions` (`pub_name`,`date`,`task_id`) SELECT 'demobaari', `date`, 9005 FROM `cash_reports` WHERE `pub_name` = 'demobaari' AND `date` >= DATE_ADD(CURDATE(), INTERVAL -7 DAY);

-- Sisäinen vieraslista: viskimaistelu, 25 paikkaa
INSERT INTO `events` (`title`,`date`,`type`,`time`,`time_start`,`time_end`,`pub_name`,`description`,`is_public`,`guest_capacity`) VALUES
('🥃 Viskimaistelu (ennakkoilmoittautuneet)',DATE_ADD(CURDATE(), INTERVAL 9 DAY),'theme','18:00:00','18:00:00','21:30:00','demobaari','Seitsemän viskiä, rajattu osallistujamäärä. Nimet kirjataan sisäiseen vieraslistaan.',0,25);
SET @wt = LAST_INSERT_ID();
INSERT INTO `event_guests` (`event_id`,`name`,`note`,`added_by`) VALUES
(@wt,'Pekka Partanen','',9002),(@wt,'Anna ja Jussi Korhonen','2 henkeä',9003),(@wt,'Sirpa Laakso','Ei alkuruokaa (allergia)',9003),(@wt,'Timo Nieminen','',9001),(@wt,'Hanna Mäkelä','Syntymäpäivälahja',9005),(@wt,'Olli Virtanen','',9002);

-- Osaamismatriisi
INSERT INTO `skills` (`id`,`pub_name`,`name`,`for_role`) VALUES
(9001,'demobaari','Ovikortti','Järjestyksenvalvoja'),(9002,'demobaari','Anniskelu','Baarimestari'),(9003,'demobaari','Kahvikone',NULL),(9004,'demobaari','Kassa',NULL);
INSERT INTO `user_skills` (`user_id`,`skill_id`,`valid_until`) VALUES
(9004,9001,DATE_ADD(CURDATE(), INTERVAL 25 DAY)),(9002,9002,NULL),(9005,9002,NULL),(9001,9002,NULL),
(9002,9003,NULL),(9003,9003,NULL),(9005,9003,NULL),(9001,9004,NULL),(9002,9004,NULL),(9003,9004,NULL),(9005,9004,NULL);

SET FOREIGN_KEY_CHECKS = 1;
