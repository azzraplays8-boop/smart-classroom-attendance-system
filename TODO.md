# Refactoring Completed - Participants Page

## Summary

All changes applied to rename the Students page to Participants page across the frontend UI components.

### Files Modified

#### Component Files:
| File | Changes |
|------|---------|
| `Students.jsx` | Updated ConfirmDialog titles/messages to use "Participant" terminology |
| `StudentsTable.jsx` | Updated table headers: Participant ID, Department / Group, Category, Team, Actions |
| `StudentsToolbar.jsx` | Updated placeholder to "Search participants...", buttons to "+ Add Participant" / "Delete All Participants" |
| `AddStudentModal.jsx` | Updated aria-labels, titles, field labels (Participant ID, Participant Information, etc.) |
| `AcademicInformationSection.jsx` | Updated section title, labels (Department & Grouping, Category, Team) |
| `StudentPhoto.jsx` | Updated default alt text to "Participant photo" |

#### Styles:
| File | Changes |
|------|---------|
| `Students.css` | Improved padding/spacing, added responsive breakpoint |
| `StudentsPage.css` | Updated card/title styling for modern look |
| `StudentsToolbar.css` | Improved search input with icon positioning, enhanced button styles with transitions/hover effects |
| `StudentsTable.css` | Added table container border/radius, improved header typography, added empty state styles |

### What was NOT changed (as requested):
- Backend logic/routes
- Database schema
- API endpoints (still use `/students`)
- Internal variable names (e.g., `studentNumber`, `student` state)
- Logic/CRUD functionality remains intact

