# Automatic Absence Cron Job

The backend does not run an in-process scheduler. Automatic absence processing
is an executable job that loads the existing `settings` table and uses the
same `maybeAutoMarkAbsent` service as the manual `/attendance/close-session`
endpoint.

## Render Cron Job

Create a separate Render service with:

- **Service type:** Cron Job
- **Repository:** the same repository connected to the backend service
- **Root directory:** `smart-classroom-attendance-system/backend`
- **Build command:** `npm install`
- **Command:** `npm run attendance:auto-absent`
- **Schedule:** `*/5 * * * *` (every five minutes, UTC)

Copy the backend service's database and mail environment variables to the Cron
Job. Required database values are `DATABASE_URL` (or `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, `DB_NAME`). For absence notifications, also copy
`BREVO_API_KEY`, `MAIL_FROM`, and `MAIL_ENABLED`. `DB_SSL`, `DB_SSL_CA_PATH`, and
`DB_CONNECTION_LIMIT` should match the backend service when used. `JWT_SECRET`
is not read by this standalone job, but copying the complete backend
environment is acceptable for operational consistency.

The cron expression is deliberately UTC and frequent. The job does not encode
the attendance schedule in cron; it reads `attendanceEndTime`, `timezone`, and
`autoMarkAbsent` from the existing `settings` table and exits without changes
before the configured local end time.

Run locally from `backend` with:

```text
npm run attendance:auto-absent
```