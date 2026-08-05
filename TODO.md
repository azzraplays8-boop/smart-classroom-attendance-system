# Enterprise RBAC & Organization Redesign — Task List

## Database
- [ ] 1. `backend/sql/migrations/20261101_enterprise_rbac.sql` — organizations, organization_invitation_codes, organization_members, user_roles, user_permissions, pending_registrations; extend users.role enum; add account_status + organization_id to users

## Backend
- [ ] 2. `backend/src/auth/authMiddleware.js` — include organization_id, account_status, permissions in JWT + /auth/me; add permission-based authorize helper
- [ ] 3. `backend/src/routes/auth.js` — rewrite register (invitation flow, pending approval), login (block pending/rejected/deactivated, return org+permissions), user management (role/org assignment, activate/deactivate), pending approvals (approve/reject), roles+permissions listing
- [ ] 4. `backend/src/routes/organizations.js` — NEW: org CRUD + invitation code management (Super Admin only)
- [ ] 5. `backend/src/server.js` — mount organizations router

## Frontend — Core Auth
- [ ] 6. `frontend/src/context/AuthContext.jsx` — new PERMISSIONS for 5+ roles; register handles pending flow (no auto-login); login handles pending errors
- [ ] 7. `frontend/src/services/authService.js` — new API methods (approve/reject, assign role/org, roles, pending)
- [ ] 8. `frontend/src/services/organizationService.js` — NEW: org + invitation code API methods
- [ ] 9. `frontend/src/pages/Register/Register.jsx` — add Invitation Code field + pending approval success screen
- [ ] 10. `frontend/src/pages/Login/Login.jsx` — handle pending/rejected/deactivated messages

## Frontend — Navigation & Roles
- [ ] 11. `frontend/src/components/Sidebar.jsx` — new roles + links to User Management & Organizations
- [ ] 12. `frontend/src/components/ProtectedRoute.jsx` — new role permission map
- [ ] 13. `frontend/src/components/UserMenu.jsx` — new role labels
- [ ] 14. `frontend/src/pages/AccountWorkspace.jsx` — new role labels + org display

## Frontend — New Pages
- [ ] 15. `frontend/src/pages/UserManagement.jsx` — NEW: pending approvals + user list + role/org assignment + activate/deactivate + search/filter
- [ ] 16. `frontend/src/pages/Organizations.jsx` — NEW: org CRUD + invitation codes + members (Super Admin only)
- [ ] 17. `frontend/src/App.jsx` — add new routes

## Frontend — Settings
- [ ] 18. `frontend/src/pages/Settings.jsx` — make "User Roles" section functional (summary + shortcut)

## Verification
- [ ] 19. Verify all existing attendance/QR/participants/reports/analytics intact
- [ ] 20. Final review & delivery report
