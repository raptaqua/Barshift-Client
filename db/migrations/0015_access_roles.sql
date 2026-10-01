-- Käyttöoikeusroolit: baarikohtaiset roolit ja käyttäjän rooli
ALTER TABLE `pubs` ADD COLUMN `access_roles` text DEFAULT NULL;

ALTER TABLE `users` ADD COLUMN `access_role` varchar(40) DEFAULT NULL;
