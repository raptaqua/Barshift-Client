-- Baarikohtaiset valinnaiset ominaisuudet: vuorohaku, automaattinen suunnittelu, vieraiden muistutukset, maksut, vieraskortisto
ALTER TABLE `pubs` ADD COLUMN `feature_bidding` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `feature_autoschedule` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `feature_reminders` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `feature_payments` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `feature_guests` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `pubs` ADD COLUMN `guest_reminder_hours` int(11) NOT NULL DEFAULT 24;

ALTER TABLE `pubs` ADD COLUMN `reminder_sms` tinyint(1) NOT NULL DEFAULT 0;

-- Aiemmin vieraiden muistutukset olivat aina päällä: säilytetään ne baareille, joilla varaukset tai liput ovat käytössä
UPDATE `pubs` SET `feature_reminders` = 1 WHERE `feature_bookings` = 1 OR `feature_tickets` = 1;
