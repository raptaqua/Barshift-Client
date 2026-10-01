-- Yksi henkilö, monta baaria: saman henkilön käyttäjärivit (yksi per baari) jakavat account_key-arvon
ALTER TABLE `users` ADD COLUMN `account_key` varchar(32) DEFAULT NULL;
ALTER TABLE `users` ADD KEY `account_key` (`account_key`);
ALTER TABLE `auth_tokens` MODIFY `kind` enum('invite','reset','link') NOT NULL;
