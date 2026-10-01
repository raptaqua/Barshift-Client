-- Baari voi vaatia ylläpitäjiltä kaksivaiheisen tunnistautumisen
ALTER TABLE `pubs` ADD COLUMN `require_2fa` tinyint(1) NOT NULL DEFAULT 0;
