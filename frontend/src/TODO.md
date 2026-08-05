# Attendance Page Redesign — Task Tracker

## Files
- [x] Create `frontend/src/styles/attendance/Attendance.css`
- [x] Rewrite `frontend/src/pages/Attendance.jsx` (UI/UX + camera/torch improvements only)

## Requirements Checklist
- [x] Preserve all backend logic, API calls, QR scanning, auth, routing, state management
- [x] Modern dashboard design (cards, shadows, rounded corners, spacing, typography)
- [x] Fully responsive desktop/tablet/mobile
- [x] Sticky top toolbar
- [x] Top statistics cards (Total, Present, Late, Absent, Unique Scanned)
- [x] Larger scanner with animated QR border + camera loading + scan success/failure overlay
- [x] Camera status indicator / loading animation
- [x] Rear camera preference on mobile + camera selector + Switch Camera button
- [x] Torch: detect via getCapabilities, disable when unsupported, graceful fallback
- [x] Today's Attendance auto-refresh after scan + highlight newly scanned row + row animation
- [x] Skeleton loaders + empty state ("Waiting for first scan...")
- [x] Recent scans panel with animation
- [x] Modern icons, badges, hover effects, transitions
- [x] Accessibility (large touch-friendly buttons, contrast)
