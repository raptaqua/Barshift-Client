-- Keskuspalveluyhteys tallennetaan kantaan (liitetään hallintapaneelista); yksityinen avain salattuna (message_key)
CREATE TABLE IF NOT EXISTS `hub_connection` (
  `id` tinyint(4) NOT NULL DEFAULT 1, `url` varchar(300) NOT NULL, `pub_slug` varchar(64) NOT NULL, `private_key_enc` text NOT NULL,
  `hub_name` varchar(120) DEFAULT NULL, `connected_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
