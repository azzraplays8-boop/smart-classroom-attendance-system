-- Older Settings saves could store the Department List under defaultCourses.
-- Preserve that existing configuration once, but never overwrite an explicit
-- defaultDepartments value managed by the current Settings page.

INSERT INTO settings (setting_key, setting_value)
SELECT 'defaultDepartments', legacy.setting_value
FROM settings AS legacy
WHERE legacy.setting_key = 'defaultCourses'
  AND legacy.setting_value IS NOT NULL
  AND TRIM(legacy.setting_value) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM settings AS current_settings
    WHERE current_settings.setting_key = 'defaultDepartments'
  );