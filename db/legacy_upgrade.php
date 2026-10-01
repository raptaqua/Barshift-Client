<?php
// Päivityslauseet vanhoille tietokannoille (ennen schema.sql:ää luodut kannat).
// Virheet ("column exists" jne.) ohitetaan: lauseet ovat idempotentteja tarkoituksella.
return [
    "ALTER TABLE shifts MODIFY userId INT NULL",
    "ALTER TABLE shifts ADD COLUMN pub_name VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE shifts ADD COLUMN original_userId INT NULL",
    "ALTER TABLE shifts ADD COLUMN status ENUM('draft','published') NOT NULL DEFAULT 'published'",
    "ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMP NULL DEFAULT NULL",
    "ALTER TABLE pubs ADD COLUMN retention_months INT NOT NULL DEFAULT 60",
    "ALTER TABLE tasks ADD COLUMN sort_order INT DEFAULT 0",
    "ALTER TABLE users ADD COLUMN target_hours INT DEFAULT 0",
    "ALTER TABLE users ADD COLUMN has_hygiene INT DEFAULT 0",
    "ALTER TABLE users ADD COLUMN has_alcohol INT DEFAULT 0",
    "ALTER TABLE users ADD COLUMN expiry_jv DATE NULL",
    "ALTER TABLE users ADD COLUMN start_date DATE NULL",
    "ALTER TABLE users ADD COLUMN employment_type ENUM('regular','casual') NOT NULL DEFAULT 'regular'",
    "ALTER TABLE events ADD COLUMN description VARCHAR(600) NULL",
    // Olemassa olevat tapahtumat pysyvät sisäisinä (0); uudet ovat oletuksena julkisia (1)
    "ALTER TABLE events ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE events ALTER COLUMN is_public SET DEFAULT 1",
    "UPDATE shifts LEFT JOIN users ON shifts.userId = users.id SET shifts.pub_name = users.pub_name WHERE shifts.pub_name IS NULL AND shifts.userId IS NOT NULL",
];
