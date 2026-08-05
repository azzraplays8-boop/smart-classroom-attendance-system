# Bulk Import Participants — Task Tracker

## Backend
- [x] 1. `backend/package.json` — add `xlsx` dependency
- [x] 2. `backend/sql/migrations/20270301_participant_import_history.sql` — NEW tables: `participant_imports`, `participant_import_errors` (additive only)
- [x] 3. `backend/src/routes/participants.js` — add `POST /participants/bulk-import` (multer file + mapping + duplicateMode; re-parse xlsx, re-validate rows, detect duplicates, transaction + batch insert, audit log, summary)
- [x] 4. `backend/src/routes/participants.js` — add `GET /participants/imports` (import history listing)

## Frontend
- [x] 5. `frontend/src/utils/importColumnMapping.js` — field metadata + synonym auto-detection
- [x] 6. `frontend/src/services/importService.js` — UI-only parse (preview/mapping), submit import, export error report (xlsx)
- [x] 7. `frontend/src/components/participants/import/ImportDropzone.jsx` — drag & drop + browse + validation + filename + upload progress
- [x] 8. `frontend/src/components/participants/import/ColumnMappingTable.jsx` — auto-detected + manual mapping dropdowns
- [x] 9. `frontend/src/components/participants/import/ImportPreviewTable.jsx` — preview table + validation stats/warnings
- [x] 10. `frontend/src/components/participants/import/ImportProgress.jsx` — staged progress (Reading → Validating → Checking Duplicates → Importing → Completed)
- [x] 11. `frontend/src/components/participants/import/ImportSummary.jsx` — summary + "Download Error Report" + recent imports
- [x] 12. `frontend/src/components/participants/import/ImportParticipantsModal.jsx` — multi-step wizard orchestrator
- [x] 13. `frontend/src/styles/participants/ImportParticipants.css` — enterprise UI
- [x] 14. `frontend/src/components/participants/ParticipantsToolbar.jsx` — add "📤 Import Participants" button + `onImportClick` prop
- [x] 15. `frontend/src/components/participants/Participants.jsx` — wire import modal, pass duplicate-check data, refetch after import
- [x] 16. `frontend/src/styles/participants/ParticipantsToolbar.css` — import button styles

## Verification
- [x] 17. `npm install` in `backend/` (for xlsx)
- [x] 18. `npm run build` in `frontend/` — no compile errors
- [ ] 19. Manual test with sample .xlsx/.csv; verify summary + error report
