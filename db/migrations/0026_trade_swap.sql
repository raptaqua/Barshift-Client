-- Vuoronvaihto kahden kesken: vastavuoroinen vaihtovuoro
ALTER TABLE `shift_trades` ADD COLUMN `swap_shift_id` int(11) DEFAULT NULL;
