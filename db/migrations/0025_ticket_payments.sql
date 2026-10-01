-- Verkkomaksu lippuihin: odottava ilmoittautuminen ja maksutiedot
ALTER TABLE `event_registrations` MODIFY COLUMN `status` enum('confirmed','cancelled','pending') NOT NULL DEFAULT 'confirmed';

ALTER TABLE `event_registrations` ADD COLUMN `paid_cents` int(11) DEFAULT NULL;

ALTER TABLE `event_registrations` ADD COLUMN `payment_ref` varchar(80) DEFAULT NULL;

ALTER TABLE `event_registrations` ADD COLUMN `expires_at` datetime DEFAULT NULL;
