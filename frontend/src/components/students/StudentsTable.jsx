import { useMemo } from "react";
import StudentPhoto from "./StudentPhoto";
import "../../styles/students/StudentsTable.css";

const EMPTY = "";

function formatDateOnly(value) {
  if (!value) return EMPTY;

  // If backend returns an ISO timestamp (e.g. 2004-01-10T16:00:00.000Z), extract YYYY-MM-DD.
  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return EMPTY;
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
  }

  return String(value);
}

function EmptyState({ hasQuery, onAddClick }) {
  return (
    <div className="students-empty-state" role="status">
      <div className="students-empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <h3 className="students-empty-title">No participants found</h3>
      <p className="students-empty-text">
        {hasQuery
          ? "Try adjusting your search query."
          : "Click 'Add Participant' to create your first participant."
        }
      </p>
    </div>
  );
}

function StudentsTable({ students, query, onEditClick, onDeleteClick, isDeleting = false }) {
  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();

    if (!q) return students;

    return students.filter((s) => {
      const lastName = String(s.lastName ?? EMPTY);
      const firstName = String(s.firstName ?? EMPTY);
      const middleName = String(s.middleName ?? EMPTY);

      return (
        String(s.id ?? EMPTY).toLowerCase().includes(q) ||
        String(s.studentNumber ?? EMPTY).toLowerCase().includes(q) ||
        lastName.toLowerCase().includes(q) ||
        firstName.toLowerCase().includes(q) ||
        middleName.toLowerCase().includes(q) ||
        String(s.gender ?? EMPTY).toLowerCase().includes(q) ||
        String(s.dateOfBirth ?? EMPTY).toLowerCase().includes(q) ||
        String(s.course ?? EMPTY).toLowerCase().includes(q) ||
        String(s.year ?? EMPTY).toLowerCase().includes(q) ||
        String(s.section ?? EMPTY).toLowerCase().includes(q) ||
        String(s.email ?? EMPTY).toLowerCase().includes(q) ||
        String(s.contactNumber ?? EMPTY).toLowerCase().includes(q) ||
        String(s.status ?? EMPTY).toLowerCase().includes(q)
      );
    });
  }, [students, query]);

  const hasQuery = (query || "").trim().length > 0;

  if (!filtered || filtered.length === 0) {
    return (
      <div className="students-table-wrap">
        <EmptyState hasQuery={hasQuery} />
      </div>
    );
  }

  return (
    <div className="students-table-wrap">
      <table className="students-table" role="table" aria-label="Participants table">
        <thead>
          <tr>
            <th className="col-id" scope="col">#</th>
            <th className="col-photo" scope="col">Photo</th>
            <th className="col-student-number" scope="col">Participant ID</th>
            <th className="col-last-name" scope="col">Last Name</th>
            <th className="col-first-name" scope="col">First Name</th>
            <th className="col-middle-name" scope="col">Middle Name</th>
            <th className="col-gender" scope="col">Gender</th>
            <th className="col-dob" scope="col">Date of Birth</th>
            <th className="col-course" scope="col">Department / Group</th>
            <th className="col-year" scope="col">Category</th>
            <th className="col-section" scope="col">Team</th>
            <th className="col-email" scope="col">Email Address</th>
            <th className="col-contact" scope="col">Contact Number</th>
            <th className="col-status" scope="col">Status</th>
            <th className="col-action" scope="col">Actions</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((s, index) => (
            <tr key={s.id ?? `${s.studentNumber ?? "participant"}-${index}`}>
              <td data-label="#">{index + 1}</td>
              <td data-label="Photo">
                <StudentPhoto
                  photoPath={s.photo}
                  studentName={`${s.firstName || ""} ${s.lastName || ""}`.trim()}
                  size={48}
                  alt="Participant photo"
                />
              </td>
              <td data-label="Participant ID" className="cell-id">{s.studentNumber}</td>
              <td data-label="Last Name">{s.lastName}</td>
              <td data-label="First Name">{s.firstName}</td>
              <td data-label="Middle Name">{s.middleName}</td>
              <td data-label="Gender">{s.gender}</td>
              <td data-label="Date of Birth">{formatDateOnly(s.dateOfBirth)}</td>
              <td data-label="Department / Group">{s.course}</td>
              <td data-label="Category">{s.year}</td>
              <td data-label="Team">{s.section}</td>
              <td data-label="Email Address">{s.email}</td>
              <td data-label="Contact Number">{s.contactNumber}</td>
              <td data-label="Status">
                <span className={`status${s.status === "Active" ? " ok" : ""}`}>
                  {s.status}
                </span>
              </td>
              <td data-label="Actions">
                <div className="students-action-cell">
                  <button
                    type="button"
                    className="students-action-btn"
                    onClick={() => onEditClick?.(s)}
                    aria-label={`Edit participant ${s.studentNumber}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="students-action-btn students-action-btn-danger"
                    onClick={() => onDeleteClick?.(s)}
                    aria-label={`Delete participant ${s.studentNumber}`}
                    disabled={Boolean(isDeleting)}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default StudentsTable;

