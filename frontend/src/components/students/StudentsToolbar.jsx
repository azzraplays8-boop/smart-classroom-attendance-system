import "../../styles/students/StudentsToolbar.css";

function StudentsToolbar({ value, onChange, onAddClick, onDeleteAllClick, isDeleteAllDisabled, isDeletingAll = false }) {
  return (
    <div className="students-toolbar">

      <div className="students-search">
        <input
          type="text"
          value={value || ""}
          placeholder="Search student..."
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>

      <div className="students-toolbar-actions">
        <button
          className="students-add-btn"
          type="button"
          onClick={onAddClick}
        >
          + Add Student
        </button>

        <button
          className="students-deleteall-btn"
          type="button"
          onClick={onDeleteAllClick}
          disabled={Boolean(isDeleteAllDisabled)}
          aria-disabled={Boolean(isDeleteAllDisabled)}
        >
          {isDeletingAll ? "Deleting All..." : "Delete All Students"}
        </button>
      </div>

    </div>
  );
}

export default StudentsToolbar;







