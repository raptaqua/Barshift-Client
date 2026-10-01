-- Hub: baarin julkinen sijainti synkronoidaan omana rivinään
ALTER TABLE `hub_sync` MODIFY `kind` enum('event','shift','profile') NOT NULL;
