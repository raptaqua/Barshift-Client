-- Järjestelmän tila: cronin ja varmuuskopion viimeisin onnistunut ajo
CREATE TABLE IF NOT EXISTS `system_status` (
  `k` varchar(40) NOT NULL,
  `v` varchar(255) NOT NULL DEFAULT '',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
