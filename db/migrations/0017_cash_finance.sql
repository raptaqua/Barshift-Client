-- Kassatilityksen kulut ja tipit, myyntitavoitteet ja ALV-kanta kirjanpitoviennille
ALTER TABLE `cash_reports` ADD COLUMN `expenses` decimal(10,2) DEFAULT NULL;

ALTER TABLE `cash_reports` ADD COLUMN `tips` decimal(10,2) DEFAULT NULL;

ALTER TABLE `pubs` ADD COLUMN `sales_target_week` decimal(10,2) DEFAULT NULL;

ALTER TABLE `pubs` ADD COLUMN `sales_target_month` decimal(10,2) DEFAULT NULL;

ALTER TABLE `pubs` ADD COLUMN `vat_rate` decimal(4,1) NOT NULL DEFAULT 25.5;
