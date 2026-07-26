-- Optional cleanup: remove legacy `name` column after backfilling.
-- Keep this script disabled unless you are sure no code depends on `students.name`.

-- ALTER TABLE `students` DROP COLUMN `name`;

