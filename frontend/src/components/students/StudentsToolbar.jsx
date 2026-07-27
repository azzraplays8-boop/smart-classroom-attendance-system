import "../../styles/students/StudentsToolbar.css";

function StudentsToolbar({ value, onChange, onAddClick, onDeleteAllClick, isDeleteAllDisabled, isDeletingAll = false }) {
  return (
    <div className="students-toolbar">

      <div className="students-search">
        <svg className="students-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={value || ""}
          placeholder="Search participants..."
          onChange={(e) => onChange?.(e.target.value)}
          aria-label="Search participants"
        />
      </div>

      <div className="students-toolbar-actions">
        <button
          className="students-add-btn"
          type="button"
          onClick={onAddClick}
        >
          + Add Participant
        </button>

        <button
          className="students-deleteall-btn"
          type="button"
          onClick={onDeleteAllClick}
          disabled={Boolean(isDeleteAllDisabled)}
          aria-disabled={Boolean(isDeleteAllDisabled)}
        >
          {isDeletingAll ? "Deleting All..." : "Delete All Participants"}
        </button>
      </div>

    </div>
  );
}

export default StudentsToolbar;







