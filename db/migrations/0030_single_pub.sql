-- Yhden baarin asennus: poistetaan baarien väliset ominaisuudet (keikkakutsut, työvoimapörssi, yhdistetyt tunnukset, superadmin)
DROP TABLE IF EXISTS `gig_invites`;
DROP TABLE IF EXISTS `job_listing_approvals`;
DROP TABLE IF EXISTS `job_listings`;
ALTER TABLE `users` DROP COLUMN IF EXISTS `account_key`;
ALTER TABLE `users` DROP COLUMN IF EXISTS `gig_available`;
ALTER TABLE `users` DROP COLUMN IF EXISTS `gig_note`;
DELETE FROM `users` WHERE `role` = 'superadmin';
ALTER TABLE `users` MODIFY `role` enum('admin','employee') NOT NULL DEFAULT 'employee';
