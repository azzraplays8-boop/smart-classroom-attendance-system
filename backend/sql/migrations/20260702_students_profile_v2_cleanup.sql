-- Optional cleanup: remove legacy `name` column after backfilling.
-- Keep this script disabled unless you are sure no code depends on `participants.name`.

-- ALTER TABLE `participants` DROP COLUMN `name`;

