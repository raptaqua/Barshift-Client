-- Palkkalajit ja työntekijänumero, työaikapankki (ylityöraja), viikkobudjetti ja päivämyynti
ALTER TABLE `users` ADD COLUMN `employee_number` varchar(20) DEFAULT NULL;

ALTER TABLE `pubs` ADD COLUMN `pay_code_base` varchar(20) NOT NULL DEFAULT 'PERUS';

ALTER TABLE `pubs` ADD COLUMN `pay_code_evening` varchar(20) NOT NULL DEFAULT 'ILTA';

ALTER TABLE `pubs` ADD COLUMN `pay_code_night` varchar(20) NOT NULL DEFAULT 'YO';

ALTER TABLE `pubs` ADD COLUMN `pay_code_sat` varchar(20) NOT NULL DEFAULT 'LA';

ALTER TABLE `pubs` ADD COLUMN `pay_code_sun` varchar(20) NOT NULL DEFAULT 'SU';

ALTER TABLE `pubs` ADD COLUMN `overtime_week_hours` decimal(5,1) NOT NULL DEFAULT 40.0;

ALTER TABLE `pubs` ADD COLUMN `weekly_budget` decimal(10,2) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `daily_sales` (
  `pub_name` varchar(100) NOT NULL,
  `date` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`pub_name`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
