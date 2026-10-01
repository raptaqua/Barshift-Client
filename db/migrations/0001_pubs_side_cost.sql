-- Työnantajan sivukulut raportteihin
ALTER TABLE `pubs` ADD COLUMN `side_cost_pct` decimal(5,2) NOT NULL DEFAULT 0.00;
