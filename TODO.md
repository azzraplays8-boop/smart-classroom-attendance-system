# Production Deployment Task List

## Backend
- [x] 1. `backend/src/db.js` — Added SSL support (`DB_SSL`, `DB_SSL_CA_PATH`) + `DATABASE_URL` support; `getEnvDb()` now returns `ssl`
- [x] 2. `backend/src/server.js` — Passes `ssl` to `ensureDatabaseExists` + `createAppPool`; already binds `0.0.0.0`, supports multi-origin CORS, gates auto-migrate behind `DB_AUTO_MIGRATE`
- [x] 3. `backend/src/auth/authMiddleware.js` — Removed hardcoded JWT secret fallback; requires `JWT_SECRET` from env
- [x] 4. `backend/.env.example` — Rewrote as production-ready template
- [x] 5. `backend/.gitignore` — Already correct (ignores `.env`, `.env.*`, includes `.env.example`)

## Frontend (remove localhost fallbacks; require VITE_API_BASE_URL)
- [x] 6. `frontend/src/config/api.js` — Already production-ready (already requires `VITE_API_BASE_URL`, no localhost fallback)
- [x] 7. `frontend/src/services/authService.js` — Already uses `config/api.js`
- [x] 8. `frontend/src/services/qrService.js` — Already uses `config/api.js`
- [x] 9. `frontend/src/components/participants/ParticipantAvatar.jsx` — Already uses `config/api.js`
- [x] 10. `frontend/src/pages/Attendance.jsx` — Already uses `config/api.js`
- [x] 11. `frontend/src/pages/Dashboard.jsx` — Already uses `config/api.js`
- [x] 12. `frontend/src/pages/Reports.jsx` — Updated to import `API_BASE_URL` from `config/api.js`
- [x] 13. `frontend/src/pages/Settings.jsx` — Updated to import `API_BASE_URL` from `config/api.js`

## Verification
- [x] 14. Confirm all API routes unchanged
- [x] 15. Deliver final deployment report (env vars, order, manual steps)

## Result
All backend changes complete. Frontend already production-ready (only Reports.jsx & Settings.jsx were patched to use the shared config; no localhost fallbacks remain).
